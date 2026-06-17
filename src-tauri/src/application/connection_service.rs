use uuid::Uuid;
use crate::error::AppResult;
use crate::models::DbConnectionConfig;
use crate::state::AppState;
use secrecy::ExposeSecret;
use serde_json;

use crate::infrastructure::drivers::driver_factory::DriverFactory;
use crate::infrastructure::database::connection_string_builder::ConnectionStringBuilder;

pub struct ConnectionService;

impl ConnectionService {
    async fn merge_sensitive_data(state: &AppState, config: &mut DbConnectionConfig) {
        if let Some(id) = config.id {
            if let Ok(db_config) = state.storage.get_connection(&id.to_string()).await {
                // Merge main password
                if config.password.is_none() || config.password.as_ref().map(|p| p.expose_secret().is_empty()).unwrap_or(true) {
                    config.password = db_config.password;
                }

                // Merge SSH secrets
                if let Some(ref mut incoming_ssh) = config.ssh_tunnel {
                    if let Some(ref db_ssh) = db_config.ssh_tunnel {
                        if incoming_ssh.password.is_none() || incoming_ssh.password.as_ref().map(|p| p.expose_secret().is_empty()).unwrap_or(true) {
                            incoming_ssh.password = db_ssh.password.clone();
                        }
                        if incoming_ssh.private_key.is_none() || incoming_ssh.private_key.as_ref().map(|p| p.expose_secret().is_empty()).unwrap_or(true) {
                            incoming_ssh.private_key = db_ssh.private_key.clone();
                        }
                        if incoming_ssh.passphrase.is_none() || incoming_ssh.passphrase.as_ref().map(|p| p.expose_secret().is_empty()).unwrap_or(true) {
                            incoming_ssh.passphrase = db_ssh.passphrase.clone();
                        }
                    }
                }
            }
        }
    }

    pub async fn save_connection(
        state: &AppState,
        mut config: DbConnectionConfig,
    ) -> AppResult<String> {
        tracing::debug!("Saving connection: {:?}", config.name);
        // If updating existing, merge passwords if not provided
        Self::merge_sensitive_data(state, &mut config).await;
        state.storage.save_connection(config).await
    }

    pub async fn export_connection(
        state: &AppState,
        id: &str,
        file_path: &str,
    ) -> AppResult<()> {
        let connection = state.storage.get_connection(id).await?;
        let content = serde_json::to_string_pretty(&connection)?;
        tokio::fs::write(file_path, content).await?;
        Ok(())
    }

    pub async fn export_all_connections(
        state: &AppState,
        file_path: &str,
    ) -> AppResult<()> {
        let connections = state.storage.get_all_connections().await?;
        let content = serde_json::to_string_pretty(&connections)?;
        tokio::fs::write(file_path, content).await?;
        Ok(())
    }

    pub async fn import_connections(
        state: &AppState,
        file_path: &str,
    ) -> AppResult<Vec<String>> {
        let content = tokio::fs::read_to_string(file_path).await?;
        
        let connections: Vec<DbConnectionConfig> = serde_json::from_str(&content)
            .or_else(|_| {
                let single_conn: DbConnectionConfig = serde_json::from_str(&content)
                    .map_err(|e| crate::error::AppError::Internal(format!("Failed to parse JSON: {}", e)))?;
                Ok(vec![single_conn])
            })
            .map_err(|e: crate::error::AppError| e)?;

        let mut saved_ids = Vec::new();
        for conn in connections {
            let id = state.storage.save_connection(conn).await?;
            saved_ids.push(id.to_string());
        }
        Ok(saved_ids)
    }

    pub async fn get_connections(state: &AppState) -> AppResult<Vec<DbConnectionConfig>> {
        tracing::debug!("Fetching all connections");
        let mut conns = state.storage.get_all_connections().await?;
        // Security: Remove sensitive data before sending to frontend
        for conn in conns.iter_mut() {
            conn.password = None;
            if let Some(ref mut ssh) = conn.ssh_tunnel {
                ssh.password = None;
                ssh.private_key = None;
                ssh.passphrase = None;
            }
        }
        Ok(conns)
    }

    pub async fn get_connection(state: &AppState, id: &str) -> AppResult<DbConnectionConfig> {
        tracing::debug!("Fetching single connection with secrets: {}", id);
        state.storage.get_connection(id).await
    }

    pub async fn delete_connection(state: &AppState, id: &str) -> AppResult<()> {
        tracing::debug!("Deleting connection: {}", id);
        state.storage.delete_connection(id).await
    }

    pub async fn connect(
        state: &AppState,
        mut config: DbConnectionConfig,
    ) -> AppResult<String> {
        // If we have an ID, load the full config from DB first!
        Self::merge_sensitive_data(state, &mut config).await;
        
        println!("\n[Connection] >>> Starting connection process for: {} ({:?})", config.name, config.db_type);
        tracing::info!("Attempting to connect to: {} ({:?})", config.name, config.db_type);
        
        let id_uuid = config.id.unwrap_or_else(Uuid::new_v4);
        let id = id_uuid.to_string();
        config.id = Some(id_uuid);

        // SSH Tunnel Setup
        let ssh_tunnel = if let Some(ref ssh_config) = config.ssh_tunnel {
            println!("[SSH] Opening tunnel to {}:{}...", ssh_config.host, ssh_config.port);
            tracing::info!("SSH Tunnel requested for connection. Opening tunnel to {}:{}", ssh_config.host, ssh_config.port);
            
            match crate::ssh::SshTunnel::open(ssh_config, &config.host, config.port).await {
                Ok(tunnel) => {
                    println!("[SSH] Tunnel established! Local port: {}", tunnel.local_port);
                    config.port = tunnel.local_port;
                    Some(tunnel)
                },
                Err(e) => {
                    println!("[SSH] FAILED to open tunnel: {}", e);
                    tracing::error!("SSH Tunnel failed: {}", e);
                    return Err(e);
                }
            }
        } else {
            println!("[SSH] No SSH tunnel configured, connecting directly.");
            None
        };

        // Build URL (will use localhost if SSH is active)
        let url = ConnectionStringBuilder::build(&config)?;
        println!("[Database] Building connection string... Done.");
        tracing::debug!("Connection string built successfully (sensitive data hidden)");
        
        let is_transactional = config.environment.to_lowercase() == "production";

        // Create Driver
        println!("[Database] Initializing {:?} driver and verifying connection...", config.db_type);
        tracing::debug!("Initializing driver for {:?}", config.db_type);
        
        let driver = match DriverFactory::create(config.db_type.clone(), &url, is_transactional).await {
            Ok(d) => {
                println!("[Database] Connection verified successfully!");
                tracing::info!("Driver created successfully and connection verified");
                d
            },
            Err(e) => {
                println!("[Database] FAILED to connect: {}", e);
                tracing::error!("Failed to create driver: {:?}", e);
                // ssh_tunnel will be dropped here automatically if it exists
                return Err(e);
            }
        };

        if is_transactional {
            let begin_sql = match config.db_type {
                crate::db::DbType::Postgres => "BEGIN",
                crate::db::DbType::Mysql | crate::db::DbType::Mariadb => "START TRANSACTION",
                crate::db::DbType::Sqlserver => "BEGIN TRANSACTION",
                _ => "BEGIN",
            };
            driver.execute(begin_sql).await?;
            tracing::info!("Production transaction mode enabled for connection {}", id);
        }

        state.add_connection(id.clone(), driver, ssh_tunnel, is_transactional).await;
        println!("[Connection] <<< Session established with ID: {}\n", id);
        tracing::info!("Connection session established: {}", id);
        Ok(id)
    }

    pub async fn disconnect(state: &AppState, id: &str) -> AppResult<()> {
        state.remove_connection(id).await
    }
}
