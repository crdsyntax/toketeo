use crate::error::AppResult;
use crate::models::{SshAuthType, SshConfig};
use crate::storage::Storage;
use secrecy::ExposeSecret;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

pub static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Persistent store of trusted SSH host key fingerprints (known_hosts).
///
/// Host keys are verified with a trust-on-first-use (TOFU) policy:
///  - first connection to a host records its fingerprint;
///  - subsequent connections must present the same fingerprint, otherwise the
///    connection is rejected (possible MITM attack).
///
/// Fingerprints are persisted in the local storage (encrypted app secrets),
/// keyed by `host:port`.
pub struct KnownHostsStore {
    storage: Arc<Storage>,
    cache: std::sync::Mutex<HashMap<String, String>>,
    loaded: std::sync::OnceLock<bool>,
}

impl KnownHostsStore {
    pub fn new(storage: Arc<Storage>) -> Self {
        Self {
            storage,
            cache: std::sync::Mutex::new(HashMap::new()),
            loaded: std::sync::OnceLock::new(),
        }
    }

    async fn load(&self) {
        if self.loaded.get().is_some() {
            return;
        }
        if let Ok(Some(raw)) = self.storage.get_app_secret("ssh_known_hosts").await {
            if let Ok(map) =
                serde_json::from_str::<HashMap<String, String>>(&String::from_utf8_lossy(&raw))
            {
                if let Ok(mut cache) = self.cache.lock() {
                    *cache = map;
                }
            }
        }
        let _ = self.loaded.set(true);
    }

    /// Returns `Ok(true)` if the host key is trusted, `Ok(false)` if the
    /// fingerprint changed (reject), `Err` on storage failure.
    pub async fn verify_or_record(
        &self,
        host: &str,
        port: u16,
        fingerprint: &str,
    ) -> AppResult<bool> {
        self.load().await;
        let key = format!("{}:{}", host, port);
        let known = self.cache.lock().ok().and_then(|c| c.get(&key).cloned());
        match known {
            Some(expected) => Ok(expected == fingerprint),
            None => {
                if let Ok(mut cache) = self.cache.lock() {
                    cache.insert(key.clone(), fingerprint.to_string());
                }
                self.persist().await;
                Ok(true)
            }
        }
    }

    async fn persist(&self) {
        let raw = self
            .cache
            .lock()
            .ok()
            .and_then(|c| serde_json::to_string(&*c).ok());
        if let Some(raw) = raw {
            let _ = self
                .storage
                .set_app_secret("ssh_known_hosts", raw.as_bytes())
                .await;
        }
    }
}

/// Loads and decodes an SSH private key, either from a file path or from
/// inline PEM/OpenSSH contents, mapping russh errors into actionable messages.
fn load_private_key(
    key_path: Option<&str>,
    private_key: Option<&str>,
    passphrase: Option<&str>,
) -> AppResult<russh::keys::PrivateKey> {
    let parsed = if let Some(path) = key_path {
        russh::keys::load_secret_key(std::path::Path::new(path), passphrase)
    } else if let Some(key) = private_key {
        russh::keys::decode_secret_key(key, passphrase)
    } else {
        return Err(crate::error::AppError::Ssh(
            "SSH Key authentication requested but no private key or key path provided".into(),
        ));
    };

    parsed.map_err(|e| {
        let location = key_path
            .map(|p| format!(" from file '{}'", p))
            .unwrap_or_default();
        let reason = match e {
            russh::keys::Error::KeyIsEncrypted => {
                "the private key is encrypted and no passphrase was provided. Enter the key's passphrase in the connection's SSH settings (Passphrase field)"
            }
            _ => {
                "the key could not be decoded: the passphrase may be incorrect or the key format is not supported"
            }
        };
        crate::error::AppError::Ssh(format!(
            "Failed to parse SSH private key{}: {}. Supported formats include OpenSSH ed25519/RSA/ECDSA ('-----BEGIN OPENSSH PRIVATE KEY-----') and PEM PKCS#1/PKCS#8/EC keys. If the key is encrypted, the passphrase must match. ({})",
            location, reason, e
        ))
    })
}

/// Client handler used by the SSH tunnel.
///
/// Server host keys are verified against the persisted known_hosts store
/// (TOFU). A fingerprint mismatch rejects the connection to prevent MITM.
pub struct SshClientHandler {
    host: String,
    port: u16,
    known_hosts: Arc<KnownHostsStore>,
}

impl SshClientHandler {
    pub fn new(host: &str, port: u16, known_hosts: Arc<KnownHostsStore>) -> Self {
        Self {
            host: host.to_string(),
            port,
            known_hosts,
        }
    }
}

impl russh::client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint(russh::keys::ssh_key::HashAlg::Sha256);
        let fp = fingerprint.to_string();
        match self
            .known_hosts
            .verify_or_record(&self.host, self.port, &fp)
            .await
        {
            Ok(true) => Ok(true),
            Ok(false) => {
                tracing::error!(
                    "SSH host key MISMATCH for {}:{} — possible MITM attack. Fingerprint {} was not found in known_hosts.",
                    self.host, self.port, fp
                );
                Ok(false)
            }
            Err(e) => {
                tracing::error!("SSH known_hosts storage error: {}", e);
                // Fail closed: do not trust an unverifiable host key.
                Ok(false)
            }
        }
    }
}

pub struct SshTunnel {
    pub local_port: u16,
    _session: Arc<russh::client::Handle<SshClientHandler>>,
    _shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl SshTunnel {
    pub async fn open(
        config: &SshConfig,
        remote_host: &str,
        remote_port: u16,
        connection_id: Option<String>,
        known_hosts: Arc<KnownHostsStore>,
    ) -> AppResult<Self> {
        tracing::info!("Opening SSH connection to {}:{}", config.host, config.port);

        let client_config = Arc::new(russh::client::Config {
            inactivity_timeout: Some(Duration::from_secs(600)),
            keepalive_interval: Some(Duration::from_secs(15)),
            keepalive_max: 3,
            nodelay: true,
            ..Default::default()
        });

        let mut session = russh::client::connect(
            client_config,
            (config.host.as_str(), config.port),
            SshClientHandler::new(&config.host, config.port, known_hosts),
        )
        .await
        .map_err(|e| {
            crate::error::AppError::Ssh(format!(
                "Failed to connect to SSH host {}:{}: {}",
                config.host, config.port, e
            ))
        })?;

        match config.auth_type {
            SshAuthType::Password => {
                let password = config.password.as_ref().ok_or_else(|| {
                    crate::error::AppError::Ssh(
                        "SSH Password authentication requested but no password provided".into(),
                    )
                })?;
                let auth = session
                    .authenticate_password(&config.user, password.expose_secret())
                    .await
                    .map_err(|e| {
                        crate::error::AppError::Ssh(format!(
                            "SSH Password auth failed for user '{}': {}",
                            config.user, e
                        ))
                    })?;
                if !auth.success() {
                    return Err(crate::error::AppError::Ssh(format!(
                        "SSH Password auth rejected for user '{}'",
                        config.user
                    )));
                }
            }
            SshAuthType::Key => {
                let passphrase = config
                    .passphrase
                    .as_ref()
                    .map(|p| p.expose_secret().to_owned())
                    .filter(|p| !p.trim().is_empty());

                let key_path = config.key_path.as_deref().filter(|p| !p.trim().is_empty());
                let private_key = config
                    .private_key
                    .as_ref()
                    .map(|k| k.expose_secret().to_owned())
                    .filter(|k| !k.trim().is_empty());

                let key_pair =
                    load_private_key(key_path, private_key.as_deref(), passphrase.as_deref())?;

                let best_hash = session.best_supported_rsa_hash().await.map_err(|e| {
                    crate::error::AppError::Ssh(format!("SSH RSA hash negotiation failed: {}", e))
                })?;

                let auth = session
                    .authenticate_publickey(
                        &config.user,
                        russh::keys::PrivateKeyWithHashAlg::new(
                            Arc::new(key_pair),
                            best_hash.flatten(),
                        ),
                    )
                    .await
                    .map_err(|e| {
                        crate::error::AppError::Ssh(format!(
                            "SSH Key auth failed for user '{}': {}",
                            config.user, e
                        ))
                    })?;

                if !auth.success() {
                    return Err(crate::error::AppError::Ssh(format!(
                        "SSH Key auth rejected for user '{}': the key is not authorized on the server, the passphrase is incorrect, or the public key is not present in the server's authorized_keys",
                        config.user
                    )));
                }
            }
        }

        tracing::info!("SSH authentication successful for {}", config.user);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| {
                crate::error::AppError::Ssh(format!(
                    "Failed to bind local port for forwarding: {}",
                    e
                ))
            })?;
        let local_port = listener
            .local_addr()
            .map_err(|e| {
                crate::error::AppError::Ssh(format!(
                    "Failed to read local address of forwarding listener: {}",
                    e
                ))
            })?
            .port();

        tracing::info!(
            "Started local listener for SSH forwarding on 127.0.0.1:{}",
            local_port
        );

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let session = Arc::new(session);
        let worker_session = session.clone();
        let remote_host = remote_host.to_string();
        let conn_id = connection_id;

        // Spawn the forwarding loop on the tokio runtime.
        tokio::spawn(async move {
            let mut shutdown_rx = shutdown_rx;
            let listener = listener;
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        tracing::info!("SSH Tunnel shutdown signal received");
                        break;
                    }
                    accepted = listener.accept() => {
                        match accepted {
                            Ok((local_stream, _addr)) => {
                                let sess = worker_session.clone();
                                let host = remote_host.clone();
                                let cid = conn_id.clone();
                                tokio::spawn(async move {
                                    tunnel_connection(sess, local_stream, &host, remote_port, cid.as_deref()).await;
                                });
                            }
                            Err(e) => {
                                tracing::error!("[SSH] failed to accept on local forwarding listener: {}", e);
                            }
                        }
                    }
                }
            }
            tracing::info!("SSH Tunnel background worker stopped");
        });

        Ok(SshTunnel {
            local_port,
            _session: session,
            _shutdown_tx: shutdown_tx,
        })
    }
}

/// Forwards a single local TCP connection through an SSH direct-tcpip channel.
async fn tunnel_connection(
    session: Arc<russh::client::Handle<SshClientHandler>>,
    local_stream: tokio::net::TcpStream,
    remote_host: &str,
    remote_port: u16,
    connection_id: Option<&str>,
) {
    match session
        .channel_open_direct_tcpip(remote_host, remote_port as u32, "127.0.0.1", 0)
        .await
    {
        Ok(channel) => {
            let mut channel_stream = channel.into_stream();
            let mut local_stream = local_stream;
            if let Err(e) =
                tokio::io::copy_bidirectional(&mut channel_stream, &mut local_stream).await
            {
                tracing::debug!("[SSH] tunnel connection closed: {}", e);
            }
        }
        Err(e) => {
            tracing::error!(
                "[SSH] FAILED to open channel to {}:{}: {}",
                remote_host,
                remote_port,
                e
            );
            if let (Some(handle), Some(cid)) = (APP_HANDLE.get(), connection_id) {
                let _ = handle.emit(
                    "connection:error",
                    &serde_json::json!({
                        "connection_id": cid,
                        "error": format!(
                            "[SSH] FAILED to open channel to {}:{}: {}",
                            remote_host, remote_port, e
                        )
                    }),
                );
            }
        }
    }
}
