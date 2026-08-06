use crate::db::PoolConfig;
use crate::error::AppResult;
use crate::infrastructure::crypto;
use crate::models::DbConnectionConfig;
use crate::state::AppState;
use secrecy::ExposeSecret;
use serde_json;
use std::time::Duration;
use uuid::Uuid;

use crate::infrastructure::database::connection_string_builder::ConnectionStringBuilder;
use crate::infrastructure::drivers::driver_factory::DriverFactory;

pub struct ConnectionService;

/// Placeholder returned to the frontend in place of real secrets. The backend
/// treats this sentinel as "keep the stored secret" during merge, so a hostile
/// webview can never read the actual credential nor accidentally overwrite it.
pub const REDACTED: &str = "********";

impl ConnectionService {
    fn is_redacted(v: &Option<secrecy::SecretString>) -> bool {
        v.as_ref()
            .map(|s| s.expose_secret() == REDACTED)
            .unwrap_or(false)
    }

    fn encrypt_connection(
        config: &mut DbConnectionConfig,
        key: &[u8; 32],
    ) -> AppResult<()> {
        if let Some(ref pw) = config.password {
            let plaintext = pw.expose_secret();
            if !plaintext.is_empty() {
                let (enc, nonce) = crypto::encrypt(plaintext, key)
                    .map_err(|e| crate::error::AppError::Auth(e))?;
                config.password_enc = Some(enc);
                config.password_nonce = Some(nonce.to_vec());
                config.password = None;
            }
        }
        if let Some(ref ssh) = config.ssh_tunnel {
            let mut ssh_fields = Vec::new();
            if let Some(ref pw) = ssh.password {
                ssh_fields.push(("password", pw.expose_secret().to_string()));
            }
            if let Some(ref pk) = ssh.private_key {
                ssh_fields.push(("private_key", pk.expose_secret().to_string()));
            }
            if let Some(ref pp) = ssh.passphrase {
                ssh_fields.push(("passphrase", pp.expose_secret().to_string()));
            }
            if !ssh_fields.is_empty() {
                let ssh_json = serde_json::to_string(&ssh_fields)
                    .unwrap_or_default();
                let (enc, nonce) = crypto::encrypt(&ssh_json, key)
                    .map_err(|e| crate::error::AppError::Auth(e))?;
                config.ssh_enc = Some(enc);
                config.ssh_nonce = Some(nonce.to_vec());
                // Never persist plaintext SSH secrets; they are restored from ssh_enc on decrypt.
                if let Some(ref mut ssh) = config.ssh_tunnel {
                    ssh.password = None;
                    ssh.private_key = None;
                    ssh.passphrase = None;
                }
            }
        }
        Ok(())
    }

    pub(crate) fn decrypt_connection(
        config: &mut DbConnectionConfig,
        key: &[u8; 32],
    ) -> AppResult<()> {        if let Some(ref enc) = config.password_enc.clone() {
            if let Some(ref nonce_vec) = config.password_nonce.clone() {
                if nonce_vec.len() == 12 {
                    let mut nonce = [0u8; 12];
                    nonce.copy_from_slice(nonce_vec);
                    if let Ok(plaintext) = crypto::decrypt(enc, &nonce, key) {
                        config.password = Some(secrecy::SecretString::from(plaintext));
                    }
                }
            }
        }
        if let Some(ref enc) = config.ssh_enc.clone() {
            if let Some(ref nonce_vec) = config.ssh_nonce.clone() {
                if nonce_vec.len() == 12 {
                    let mut nonce = [0u8; 12];
                    nonce.copy_from_slice(nonce_vec);
                    if let Ok(plaintext) = crypto::decrypt(enc, &nonce, key) {
                        if let Ok(ssh_fields) =
                            serde_json::from_str::<Vec<(String, String)>>(&plaintext)
                        {
                            if let Some(ref mut ssh) = config.ssh_tunnel {
                                for (field, value) in ssh_fields {
                                    match field.as_str() {
                                        "password" => ssh.password =
                                            Some(secrecy::SecretString::from(value)),
                                        "private_key" => ssh.private_key =
                                            Some(secrecy::SecretString::from(value)),
                                        "passphrase" => ssh.passphrase =
                                            Some(secrecy::SecretString::from(value)),
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Replaces all secrets with the REDACTED sentinel so they are never sent
    /// to the frontend. Used by `get_connection` (the webview is untrusted).
    fn mask_secrets(config: &mut DbConnectionConfig) {
        if config.password.is_some() {
            config.password = Some(secrecy::SecretString::from(REDACTED));
        }
        config.password_enc = None;
        config.password_nonce = None;
        config.ssh_enc = None;
        config.ssh_nonce = None;
        if let Some(ref mut ssh) = config.ssh_tunnel {
            if ssh.password.is_some() {
                ssh.password = Some(secrecy::SecretString::from(REDACTED));
            }
            if ssh.private_key.is_some() {
                ssh.private_key = Some(secrecy::SecretString::from(REDACTED));
            }
            if ssh.passphrase.is_some() {
                ssh.passphrase = Some(secrecy::SecretString::from(REDACTED));
            }
        }
    }

    async fn merge_sensitive_data(state: &AppState, config: &mut DbConnectionConfig) {
        if let Some(id) = config.id {
            if let Ok(mut db_config) = state.storage.get_connection(&id.to_string()).await {
                tracing::debug!("merge_sensitive_data: loaded from storage, auth_enabled={:?}, incoming_password_present={}, stored_password_enc_present={}", 
                    config.auth_enabled,
                    config.password.as_ref().map(|p| !p.expose_secret().is_empty()).unwrap_or(false),
                    db_config.password_enc.is_some()
                );
                // Decrypt stored secrets using the decryption key (available regardless of UI lock state)
                if let Ok(key) = state.get_decryption_key().await {
                    let _ = Self::decrypt_connection(&mut db_config, &key);
                }

                // When auth is explicitly disabled, clear password and skip merge
                if config.auth_enabled == Some(false) {
                    config.password = None;
                } else if Self::is_redacted(&config.password)
                    || config.password.is_none()
                    || config
                        .password
                        .as_ref()
                        .map(|p| p.expose_secret().is_empty())
                        .unwrap_or(true)
                {
                    config.password = db_config.password;
                }

                // Merge SSH secrets
                if let Some(ref mut incoming_ssh) = config.ssh_tunnel {
                    if let Some(ref db_ssh) = db_config.ssh_tunnel {
                        if Self::is_redacted(&incoming_ssh.password)
                            || incoming_ssh.password.is_none()
                            || incoming_ssh
                                .password
                                .as_ref()
                                .map(|p| p.expose_secret().is_empty())
                                .unwrap_or(true)
                        {
                            incoming_ssh.password = db_ssh.password.clone();
                        }
                        if Self::is_redacted(&incoming_ssh.private_key)
                            || incoming_ssh.private_key.is_none()
                            || incoming_ssh
                                .private_key
                                .as_ref()
                                .map(|p| p.expose_secret().is_empty())
                                .unwrap_or(true)
                        {
                            incoming_ssh.private_key = db_ssh.private_key.clone();
                        }
                        if Self::is_redacted(&incoming_ssh.passphrase)
                            || incoming_ssh.passphrase.is_none()
                            || incoming_ssh
                                .passphrase
                                .as_ref()
                                .map(|p| p.expose_secret().is_empty())
                                .unwrap_or(true)
                        {
                            incoming_ssh.passphrase = db_ssh.passphrase.clone();
                        }
                    }
                }

                tracing::debug!("merge_sensitive_data: after merge, final_password_present={}", 
                    config.password.as_ref().map(|p| !p.expose_secret().is_empty()).unwrap_or(false)
                );
            }
        }
    }

    pub async fn save_connection(
        state: &AppState,
        mut config: DbConnectionConfig,
    ) -> AppResult<String> {
        tracing::debug!("Saving connection: {:?}", config.name);
        // Redis always needs auth — force auth_enabled before merge so password is never cleared
        if config.db_type == crate::db::DbType::Redis {
            config.auth_enabled = Some(true);
        }
        Self::merge_sensitive_data(state, &mut config).await;
        if let Ok(key) = state.get_decryption_key().await {
            Self::encrypt_connection(&mut config, &key)?;
        }
        state.storage.save_connection(config).await
    }

    pub async fn export_connection(state: &AppState, id: &str, file_path: &str) -> AppResult<()> {
        let mut connection = state.storage.get_connection(id).await?;
        let unlocked = state.is_session_unlocked().await;
        if unlocked {
            if let Ok(key) = state.require_unlock().await {
                let _ = Self::decrypt_connection(&mut connection, &key);
            }
        } else {
            connection.strip_secrets();
        }
        let content = serde_json::to_string_pretty(&connection)?;
        tokio::fs::write(file_path, content).await?;
        Ok(())
    }

    pub async fn export_all_connections(state: &AppState, file_path: &str) -> AppResult<()> {
        let mut connections = state.storage.get_all_connections().await?;
        let unlocked = state.is_session_unlocked().await;
        for conn in connections.iter_mut() {
            if unlocked {
                if let Ok(key) = state.require_unlock().await {
                    let _ = Self::decrypt_connection(conn, &key);
                }
            } else {
                conn.strip_secrets();
            }
        }
        let content = serde_json::to_string_pretty(&connections)?;
        tokio::fs::write(file_path, content).await?;
        Ok(())
    }

    pub async fn import_connections(state: &AppState, file_path: &str) -> AppResult<Vec<String>> {
        let content = tokio::fs::read_to_string(file_path).await?;

        let mut connections: Vec<DbConnectionConfig> = serde_json::from_str(&content)
            .or_else(|_| {
                let single_conn: DbConnectionConfig =
                    serde_json::from_str(&content).map_err(|e| {
                        crate::error::AppError::Internal(format!("Failed to parse JSON: {}", e))
                    })?;
                Ok(vec![single_conn])
            })
            .map_err(|e: crate::error::AppError| e)?;

        let mut saved_ids = Vec::new();
        for conn in connections.iter_mut() {
            if let Ok(key) = state.require_unlock().await {
                Self::encrypt_connection(conn, &key)?;
            }
            let id = state.storage.save_connection(conn.clone()).await?;
            saved_ids.push(id.to_string());
        }
        Ok(saved_ids)
    }

    pub async fn get_connections(state: &AppState) -> AppResult<Vec<DbConnectionConfig>> {
        tracing::debug!("Fetching all connections");
        let mut conns = state.storage.get_all_connections().await?;
        for conn in conns.iter_mut() {
            conn.strip_secrets();
        }
        Ok(conns)
    }

    pub async fn get_connection(state: &AppState, id: &str) -> AppResult<DbConnectionConfig> {
        tracing::debug!("Fetching single connection config: {}", id);
        let mut conn = state.storage.get_connection(id).await?;
        // Secrets are decrypted (in-memory) so the merge logic on save can work,
        // then masked with the REDACTED sentinel — the webview never receives them.
        if let Ok(key) = state.require_unlock().await {
            Self::decrypt_connection(&mut conn, &key)?;
        }
        Self::mask_secrets(&mut conn);
        Ok(conn)
    }

    /// Returns a single secret field for a connection. The session must already
    /// be unlocked (gated at the command boundary). Only the requested field is
    /// returned, never the whole config, and only while the caller is
    /// authenticated. Field names: `password`, `ssh_password`,
    /// `ssh_private_key`, `ssh_passphrase`.
    pub async fn reveal_secret(state: &AppState, id: &str, field: &str) -> AppResult<Option<String>> {
        let mut conn = state.storage.get_connection(id).await?;
        if let Ok(key) = state.require_unlock().await {
            Self::decrypt_connection(&mut conn, &key)?;
        }
        let value = match field {
            "password" => conn
                .password
                .as_ref()
                .map(|s| s.expose_secret().to_string()),
            "ssh_password" => conn
                .ssh_tunnel
                .as_ref()
                .and_then(|s| s.password.as_ref())
                .map(|s| s.expose_secret().to_string()),
            "ssh_private_key" => conn
                .ssh_tunnel
                .as_ref()
                .and_then(|s| s.private_key.as_ref())
                .map(|s| s.expose_secret().to_string()),
            "ssh_passphrase" => conn
                .ssh_tunnel
                .as_ref()
                .and_then(|s| s.passphrase.as_ref())
                .map(|s| s.expose_secret().to_string()),
            other => {
                return Err(crate::error::AppError::Internal(format!(
                    "Unknown secret field: {}",
                    other
                )))
            }
        };
        // Drop any decrypted material that is not being returned.
        conn.strip_secrets();
        Ok(value)
    }

    pub async fn delete_connection(state: &AppState, id: &str) -> AppResult<()> {
        tracing::debug!("Deleting connection: {}", id);
        state.storage.delete_connection(id).await
    }

    pub async fn connect(state: &AppState, mut config: DbConnectionConfig) -> AppResult<String> {
        // Redis always needs auth capability — force auth_enabled before merge so password is never cleared
        if config.db_type == crate::db::DbType::Redis {
            config.auth_enabled = Some(true);
        }

        Self::merge_sensitive_data(state, &mut config).await;

        tracing::info!(
            "Attempting to connect to: {} ({:?})",
            config.name,
            config.db_type
        );

        let id_uuid = config.id.unwrap_or_else(Uuid::new_v4);
        let id = id_uuid.to_string();
        config.id = Some(id_uuid);

        let ssh_tunnel = if let Some(ref ssh_config) = config.ssh_tunnel {
            tracing::info!(
                "SSH Tunnel requested for connection. Opening tunnel to {}:{}",
                ssh_config.host,
                ssh_config.port
            );

            match crate::ssh::SshTunnel::open(
                ssh_config,
                &config.host,
                config.port,
                Some(id.clone()),
                state.known_hosts.clone(),
            )
            .await
            {
                Ok(tunnel) => {
                    config.port = tunnel.local_port;
                    Some(tunnel)
                }
                Err(e) => {
                    println!("[SSH] FAILED to open tunnel: {}", e);
                    tracing::error!("SSH Tunnel failed: {}", e);
                    return Err(e);
                }
            }
        } else {
            None
        };

        let url = ConnectionStringBuilder::build(&config)?;
        tracing::debug!("Connection string built: db_type={:?}, auth_enabled={:?}, password_present={}, user_present={}", 
            config.db_type, config.auth_enabled, 
            config.password.as_ref().map(|p| !p.expose_secret().is_empty()).unwrap_or(false),
            !config.user.is_empty()
        );

        let is_transactional = config.environment.to_lowercase() == "production";
        let pool_config: Option<PoolConfig> = (&config).into();

        tracing::debug!("Initializing driver for {:?}", config.db_type);

        let driver =
            match DriverFactory::create(config.db_type.clone(), &url, is_transactional, pool_config).await {
                Ok(d) => {
                    tracing::info!("Driver created successfully and connection verified");
                    d
                }
                Err(e) => {
                    println!("[Database] FAILED to connect: {}", e);
                    tracing::error!("Failed to create driver: {:?}", e);
                    return Err(e);
                }
            };

        if is_transactional {
            if config.db_type != crate::db::DbType::Mongodb && config.db_type != crate::db::DbType::Redis {
                let begin_sql = match config.db_type {
                    crate::db::DbType::Postgres => "BEGIN",
                    crate::db::DbType::Mysql | crate::db::DbType::Mariadb => "START TRANSACTION",
                    crate::db::DbType::Sqlserver => "BEGIN TRANSACTION",
                    _ => "BEGIN",
                };
                driver.execute(begin_sql).await?;
                tracing::info!("Production transaction mode enabled for connection {}", id);
            } else {
                tracing::info!("Production transaction mode requested but skipped for {:?} (unsupported standard BEGIN)", config.db_type);
            }
        }

        let max_ttl = config.max_lifetime.map(|s| Duration::from_secs(s as u64));
        let metadata_cache_ttl = Duration::from_secs(config.metadata_cache_ttl.unwrap_or(300) as u64);

        state
            .add_connection(id.clone(), driver, ssh_tunnel, is_transactional, config.read_only.unwrap_or(false), max_ttl, metadata_cache_ttl)
            .await;
        tracing::info!("Connection session established: {}", id);
        Ok(id)
    }

    pub async fn diagnose_connection(state: &AppState, id: &str) -> AppResult<serde_json::Value> {
        let mut config = state.storage.get_connection(id).await?;
        if let Ok(key) = state.get_decryption_key().await {
            Self::decrypt_connection(&mut config, &key)?;
        }
        let url = ConnectionStringBuilder::build(&config)?;

        let driver = DriverFactory::create(config.db_type, &url, false, None).await?;

        let dbs = driver.fetch_databases().await?;
        let schemas = driver.fetch_schemas().await?;

        Ok(serde_json::json!({
            "databases": dbs,
            "schemas": schemas
        }))
    }

    pub async fn switch_database(state: &AppState, id: &str, new_db: &str) -> AppResult<()> {
        let mut config = state.storage.get_connection(id).await?;
        if let Ok(key) = state.get_decryption_key().await {
            Self::decrypt_connection(&mut config, &key)?;
        }
        config.database = Some(new_db.to_string());

        // For SSH connections, reuse the existing tunnel's local port
        if config.ssh_tunnel.is_some() {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(ref tunnel) = session.ssh_tunnel {
                    config.port = tunnel.local_port;
                }
            }
        }

        let url = ConnectionStringBuilder::build(&config)?;
        let pool_config: Option<PoolConfig> = (&config).into();
        let driver = DriverFactory::create(config.db_type, &url, false, pool_config).await?;

        let max_ttl = config.max_lifetime.map(|s| Duration::from_secs(s as u64));
        let metadata_cache_ttl = Duration::from_secs(config.metadata_cache_ttl.unwrap_or(300) as u64);

        // Swap driver while preserving the existing SSH tunnel (dropping it would kill the tunnel)
        let old_driver = {
            let mut conns = state.connections.write().await;
            if let Some(mut session) = conns.remove(id) {
                let ssh_tunnel = session.ssh_tunnel.take();
                conns.insert(
                    id.to_string(),
                    crate::application::session_service::ConnectionSession::new(
                        driver, ssh_tunnel, false, config.read_only.unwrap_or(false), max_ttl, metadata_cache_ttl,
                    ),
                );
                Some(session.driver)
            } else {
                None
            }
        };
        if let Some(d) = old_driver {
            let _ = d.close().await;
        }

        Ok(())
    }

    pub async fn reconnect(state: &AppState, id: &str) -> AppResult<String> {
        tracing::info!("Reconnecting session: {}", id);
        let _ = state.remove_connection(id).await;
        let mut config = state.storage.get_connection(id).await?;
        if let Ok(key) = state.get_decryption_key().await {
            Self::decrypt_connection(&mut config, &key)?;
        }
        Self::connect(state, config).await
    }

    pub async fn disconnect(state: &AppState, id: &str) -> AppResult<()> {
        state.remove_connection(id).await
    }

    pub async fn disconnect_all(state: &AppState) -> AppResult<()> {
        let ids: Vec<String> = {
            let conns = state.connections.read().await;
            conns.keys().cloned().collect()
        };
        for id in ids {
            let _ = state.remove_connection(&id).await;
        }
        Ok(())
    }
}
