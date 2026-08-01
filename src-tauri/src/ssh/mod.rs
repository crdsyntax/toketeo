use crate::error::AppResult;
use crate::models::{SshAuthType, SshConfig};
use secrecy::ExposeSecret;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

pub static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Client handler used by the SSH tunnel.
///
/// Server host keys are accepted without verification (TOFU is intentionally
/// not enforced for ephemeral tunnels, matching the previous ssh2 behavior).
pub struct SshClientHandler;

impl russh::client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
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
            SshClientHandler,
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
                    .map(|p| p.expose_secret().to_owned());
                let passphrase_ref = passphrase.as_deref();

                let key_path = config.key_path.as_ref().filter(|p| !p.trim().is_empty());
                let private_key = config
                    .private_key
                    .as_ref()
                    .map(|k| k.expose_secret().to_owned());

                let key_pair = if let Some(path) = key_path {
                    russh::keys::load_secret_key(std::path::Path::new(path), passphrase_ref)
                        .map_err(|e| {
                            crate::error::AppError::Ssh(format!(
                                "Failed to load SSH private key from '{}': {}",
                                path, e
                            ))
                        })?
                } else if let Some(ref key) = private_key {
                    russh::keys::decode_secret_key(key, passphrase_ref).map_err(|e| {
                        crate::error::AppError::Ssh(format!(
                            "Failed to parse SSH private key: {}. Supported formats include OpenSSH ed25519/RSA/ECDSA ('-----BEGIN OPENSSH PRIVATE KEY-----') and PEM PKCS#1/PKCS#8/EC keys. If the key is encrypted, the passphrase must match.",
                            e
                        ))
                    })?
                } else {
                    return Err(crate::error::AppError::Ssh(
                        "SSH Key authentication requested but no private key or key path provided"
                            .into(),
                    ));
                };

                let best_hash = session
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| {
                        crate::error::AppError::Ssh(format!(
                            "SSH RSA hash negotiation failed: {}",
                            e
                        ))
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
            if let Err(e) = tokio::io::copy_bidirectional(&mut channel_stream, &mut local_stream)
                .await
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
