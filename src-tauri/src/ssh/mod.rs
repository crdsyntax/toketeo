use std::net::{TcpListener, TcpStream};
use ssh2::Session;
use crate::error::AppResult;
use crate::models::{SshConfig, SshAuthType};
use secrecy::ExposeSecret;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::thread;
use std::io::{Read, Write};

pub struct SshTunnel {
    pub local_port: u16,
    _session: Arc<Mutex<Session>>,
    _shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl SshTunnel {
    pub async fn open(config: &SshConfig, remote_host: &str, remote_port: u16) -> AppResult<Self> {
        tracing::info!("Opening SSH connection to {}:{}", config.host, config.port);
        
        let tcp = TcpStream::connect(format!("{}:{}", config.host, config.port))
            .map_err(|e| crate::error::AppError::Ssh(format!("Failed to connect to SSH host {}:{}: {}", config.host, config.port, e)))?;
        
        let mut sess = Session::new()
            .map_err(|e| crate::error::AppError::Ssh(format!("Failed to create SSH session: {}", e)))?;
        
        sess.set_tcp_stream(tcp.try_clone().map_err(|e| crate::error::AppError::Ssh(format!("Failed to set TCP stream: {}", e)))?);
        sess.handshake().map_err(|e| crate::error::AppError::Ssh(format!("SSH handshake failed: {}", e)))?;

        match config.auth_type {
            SshAuthType::Password => {
                if let Some(ref password) = config.password {
                    sess.userauth_password(&config.user, password.expose_secret())
                        .map_err(|e| crate::error::AppError::Ssh(format!("SSH Password auth failed for user '{}': {}", config.user, e)))?;
                } else {
                    return Err(crate::error::AppError::Ssh("SSH Password authentication requested but no password provided".into()));
                }
            }
            SshAuthType::Key => {
                if let Some(ref key) = config.private_key {
                    let passphrase = config.passphrase.as_ref().map(|p| p.expose_secret().as_ref());
                    sess.userauth_pubkey_memory(&config.user, None, key.expose_secret(), passphrase)
                        .map_err(|e| crate::error::AppError::Ssh(format!("SSH Key auth failed for user '{}': {}", config.user, e)))?;
                } else {
                    return Err(crate::error::AppError::Ssh("SSH Key authentication requested but no private key provided".into()));
                }
            }
        }

        if !sess.authenticated() {
            return Err(crate::error::AppError::Ssh("SSH authentication failed: session not authenticated".into()));
        }

        tracing::info!("SSH authentication successful for {}", config.user);

        // Start local listener for port forwarding
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| crate::error::AppError::Ssh(format!("Failed to bind local port for forwarding: {}", e)))?;
        let local_port = listener.local_addr().unwrap().port();
        
        tracing::info!("Started local listener for SSH forwarding on 127.0.0.1:{}", local_port);

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let sess_arc = Arc::new(Mutex::new(sess));
        let sess_clone = sess_arc.clone();
        let remote_host = remote_host.to_string();
        
        // Spawn background thread for port forwarding
        thread::spawn(move || {
            listener.set_nonblocking(true).ok();
            
            loop {
                // Check for shutdown signal
                if shutdown_rx.try_recv().is_ok() {
                    tracing::info!("SSH Tunnel shutdown signal received");
                    break;
                }

                if let Ok((mut local_stream, _)) = listener.accept() {
                    let sess_inner = sess_clone.clone();
                    let host_inner = remote_host.clone();
                    
                    thread::spawn(move || {
                        let sess_guard = tauri::async_runtime::block_on(async { sess_inner.lock().await });
                        match sess_guard.channel_direct_tcpip(&host_inner, remote_port, None) {
                            Ok(mut channel) => {
                                tracing::debug!("SSH channel established to {}:{}", host_inner, remote_port);
                                
                                let mut local_write = local_stream.try_clone().unwrap();
                                let mut channel_write = channel.clone();

                                // Bridge local -> remote
                                let t1 = thread::spawn(move || {
                                    let mut buffer = [0u8; 8192];
                                    loop {
                                        match local_stream.read(&mut buffer) {
                                            Ok(0) => break,
                                            Ok(n) => {
                                                if channel_write.write_all(&buffer[..n]).is_err() { break; }
                                            }
                                            Err(_) => break,
                                        }
                                    }
                                    let _ = channel_write.send_eof();
                                    tracing::debug!("SSH bridge (local -> remote) closed");
                                });

                                // Bridge remote -> local
                                let mut buffer = [0u8; 8192];
                                loop {
                                    match channel.read(&mut buffer) {
                                        Ok(0) => break,
                                        Ok(n) => {
                                            if local_write.write_all(&buffer[..n]).is_err() { break; }
                                        }
                                        Err(_) => break,
                                    }
                                }
                                tracing::debug!("SSH bridge (remote -> local) closed");
                                let _ = t1.join();
                            }
                            Err(e) => {
                                tracing::error!("Failed to open SSH channel: {}", e);
                            }
                        }
                    });
                }
                
                thread::sleep(std::time::Duration::from_millis(100));
            }
            tracing::info!("SSH Tunnel background worker stopped");
        });

        Ok(SshTunnel {
            local_port,
            _session: sess_arc,
            _shutdown_tx: shutdown_tx,
        })
    }
}

pub type SshTunnelRef = Arc<Mutex<Option<SshTunnel>>>;
