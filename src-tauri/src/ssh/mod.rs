use crate::error::AppResult;
use crate::models::{SshAuthType, SshConfig};
use secrecy::ExposeSecret;
use ssh2::Session;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

pub struct SshTunnel {
    pub local_port: u16,
    _session: Arc<Mutex<Session>>,
    _shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl SshTunnel {
    pub async fn open(config: &SshConfig, remote_host: &str, remote_port: u16) -> AppResult<Self> {
        tracing::info!("Opening SSH connection to {}:{}", config.host, config.port);

        let tcp = TcpStream::connect(format!("{}:{}", config.host, config.port)).map_err(|e| {
            crate::error::AppError::Ssh(format!(
                "Failed to connect to SSH host {}:{}: {}",
                config.host, config.port, e
            ))
        })?;

        let mut sess = Session::new().map_err(|e| {
            crate::error::AppError::Ssh(format!("Failed to create SSH session: {}", e))
        })?;

        sess.set_tcp_stream(tcp.try_clone().map_err(|e| {
            crate::error::AppError::Ssh(format!("Failed to set TCP stream: {}", e))
        })?);
        sess.handshake()
            .map_err(|e| crate::error::AppError::Ssh(format!("SSH handshake failed: {}", e)))?;

        match config.auth_type {
            SshAuthType::Password => {
                if let Some(ref password) = config.password {
                    sess.userauth_password(&config.user, password.expose_secret())
                        .map_err(|e| {
                            crate::error::AppError::Ssh(format!(
                                "SSH Password auth failed for user '{}': {}",
                                config.user, e
                            ))
                        })?;
                } else {
                    return Err(crate::error::AppError::Ssh(
                        "SSH Password authentication requested but no password provided".into(),
                    ));
                }
            }
            SshAuthType::Key => {
                if let Some(ref key) = config.private_key {
                    let passphrase = config
                        .passphrase
                        .as_ref()
                        .map(|p| p.expose_secret().as_ref());
                    sess.userauth_pubkey_memory(
                        &config.user,
                        None,
                        key.expose_secret(),
                        passphrase,
                    )
                    .map_err(|e| {
                        crate::error::AppError::Ssh(format!(
                            "SSH Key auth failed for user '{}': {}",
                            config.user, e
                        ))
                    })?;
                } else {
                    return Err(crate::error::AppError::Ssh(
                        "SSH Key authentication requested but no private key provided".into(),
                    ));
                }
            }
        }

        if !sess.authenticated() {
            return Err(crate::error::AppError::Ssh(
                "SSH authentication failed: session not authenticated".into(),
            ));
        }

        tracing::info!("SSH authentication successful for {}", config.user);

        // Start local listener for port forwarding
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| {
            crate::error::AppError::Ssh(format!("Failed to bind local port for forwarding: {}", e))
        })?;
        let local_port = listener.local_addr().unwrap().port();

        tracing::info!(
            "Started local listener for SSH forwarding on 127.0.0.1:{}",
            local_port
        );

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let sess_arc = Arc::new(Mutex::new(sess));
        let sess_clone = sess_arc.clone();
        let remote_host = remote_host.to_string();

        // Spawn background thread for port forwarding
        thread::spawn(move || {
            listener.set_nonblocking(true).ok();

            loop {
                // Check for shutdown signal
                match shutdown_rx.try_recv() {
                    Ok(()) | Err(tokio::sync::oneshot::error::TryRecvError::Closed) => {
                        tracing::info!("SSH Tunnel shutdown signal received");
                        break;
                    }
                    Err(tokio::sync::oneshot::error::TryRecvError::Empty) => {}
                }

                if let Ok((mut local_stream, _addr)) = listener.accept() {
                    let sess_inner = sess_clone.clone();
                    let host_inner = remote_host.clone();

                    thread::spawn(move || {
                        let mut sess_guard = sess_inner.lock().unwrap();
                        sess_guard.set_blocking(false);

                        let mut channel = loop {
                            match sess_guard.channel_direct_tcpip(&host_inner, remote_port, None) {
                                Ok(ch) => break ch,
                                Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => {
                                    // EAGAIN
                                    drop(sess_guard);
                                    thread::sleep(std::time::Duration::from_millis(50));
                                    sess_guard = sess_inner.lock().unwrap();
                                    continue;
                                }
                                Err(e) => {
                                    println!(
                                        "[SSH] FAILED to open channel to {}:{}: {}",
                                        host_inner, remote_port, e
                                    );
                                    return;
                                }
                            }
                        };
                        local_stream.set_nonblocking(true).ok();

                        let mut buffer_local = [0u8; 16384];
                        let mut buffer_remote = [0u8; 16384];

                        loop {
                            let mut activity = false;

                            // 1. Try to read from local and write to remote
                            match local_stream.read(&mut buffer_local) {
                                Ok(0) => break, // Local closed
                                Ok(n) => {
                                    activity = true;
                                    let mut pos = 0;
                                    while pos < n {
                                        match channel.write(&buffer_local[pos..n]) {
                                            Ok(written) => pos += written,
                                            Err(ref e)
                                                if e.kind() == std::io::ErrorKind::WouldBlock =>
                                            {
                                                thread::sleep(std::time::Duration::from_millis(10));
                                            }
                                            Err(_) => break,
                                        }
                                    }
                                }
                                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                                Err(_) => break,
                            }

                            // 2. Try to read from remote and write to local
                            match channel.read(&mut buffer_remote) {
                                Ok(0) => break, // Remote closed
                                Ok(n) => {
                                    activity = true;
                                    if local_stream.write_all(&buffer_remote[..n]).is_err() {
                                        break;
                                    }
                                }
                                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                                Err(_) => break,
                            }

                            if !activity {
                                drop(sess_guard);
                                thread::sleep(std::time::Duration::from_millis(50));
                                sess_guard = sess_inner.lock().unwrap();
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
