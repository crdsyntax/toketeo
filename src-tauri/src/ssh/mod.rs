use std::net::TcpStream;
use ssh2::Session;
use crate::error::AppResult;
use crate::models::SshConfig;
use secrecy::ExposeSecret;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct SshTunnel {
    pub local_port: u16,
    _session: Session,
    _tcp: TcpStream,
}

impl SshTunnel {
    pub async fn open(config: &SshConfig) -> AppResult<Self> {
        let tcp = TcpStream::connect(format!("{}:{}", config.host, config.port))
            .map_err(|e| crate::error::AppError::Ssh(format!("Failed to connect to SSH host: {}", e)))?;
        
        let mut sess = Session::new()
            .map_err(|e| crate::error::AppError::Ssh(format!("Failed to create SSH session: {}", e)))?;
        
        sess.set_tcp_stream(tcp.try_clone().map_err(|e| crate::error::AppError::Ssh(e.to_string()))?);
        sess.handshake().map_err(|e| crate::error::AppError::Ssh(e.to_string()))?;

        if let Some(ref password) = config.password {
            sess.userauth_password(&config.user, password.expose_secret())
                .map_err(|e| crate::error::AppError::Ssh(format!("SSH Auth failed: {}", e)))?;
        } else if let Some(ref _key_path) = config.private_key_path {
            // TODO: Implement key auth
            return Err(crate::error::AppError::Ssh("Key auth not yet implemented".into()));
        }

        if !sess.authenticated() {
            return Err(crate::error::AppError::Ssh("SSH authentication failed".into()));
        }

        // For simplicity, we assume we need to tunnel to the same host but different port
        // In a real scenario, we might need a dynamic local port
        let local_port = 0; // Let OS choose
        
        // This is a simplified version. Real tunneling requires background port forwarding.
        Ok(SshTunnel {
            local_port,
            _session: sess,
            _tcp: tcp,
        })
    }
}

// Ensure resources are cleaned up
impl Drop for SshTunnel {
    fn drop(&mut self) {
        // In ssh2-rs, resources are closed when dropped.
        // We might want to explicitly signal closure if we had background tasks.
    }
}

pub type SshTunnelRef = Arc<Mutex<Option<SshTunnel>>>;
