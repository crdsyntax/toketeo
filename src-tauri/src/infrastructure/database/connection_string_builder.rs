use crate::models::DbConnectionConfig;
use crate::db::DbType;
use secrecy::ExposeSecret;
use crate::error::{AppResult, AppError};

pub struct ConnectionStringBuilder;

impl ConnectionStringBuilder {
    pub fn build(config: &DbConnectionConfig) -> AppResult<String> {
        let user = Self::url_encode(&config.user);
        let password = config.password.as_ref()
            .map(|p| Self::url_encode(p.expose_secret()))
            .unwrap_or_default();
        
        let host = if config.ssh_tunnel.is_some() {
            "127.0.0.1" // Localhost for SSH tunnel
        } else {
            &config.host
        };

        let port = config.port;
        let database = config.database.as_deref().unwrap_or("");
        let ssl_enabled = config.ssl.as_deref().unwrap_or("false") == "true";
        
        match config.db_type {
            DbType::Postgres => {
                let mut url = format!(
                    "postgres://{}:{}@{}:{}/{}",
                    user, password, host, port, database
                );
                
                if config.ssh_tunnel.is_some() {
                    url.push_str("?sslmode=disable");
                } else if ssl_enabled {
                    url.push_str("?sslmode=require");
                } else {
                    url.push_str("?sslmode=prefer");
                }
                Ok(url)
            }
            DbType::Mysql | DbType::Mariadb => {
                let mut url = format!(
                    "mysql://{}:{}@{}:{}/{}",
                    user, password, host, port, database
                );
                
                let mut params = Vec::new();
                if ssl_enabled && config.ssh_tunnel.is_none() {
                    params.push("ssl-mode=REQUIRED");
                }
                params.push("multiStatements=true");
                
                if !params.is_empty() {
                    url.push_str("?");
                    url.push_str(&params.join("&"));
                }
                Ok(url)
            }
            DbType::Mongodb => {
                let mut url = format!(
                    "mongodb://{}:{}@{}:{}/{}",
                    user, password, host, port, database
                );
                let mut params = Vec::new();
                
                if ssl_enabled {
                    params.push("tls=true".to_string());
                }

                if let Some(ref auth_source) = config.auth_source {
                    params.push(format!("authSource={}", auth_source));
                } else {
                    params.push("authSource=admin".to_string());
                }
                if let Some(ref replica_set) = config.replica_set {
                    if !replica_set.is_empty() {
                        params.push(format!("replicaSet={}", replica_set));
                    }
                }
                if let Some(direct) = config.direct_connection {
                    params.push(format!("directConnection={}", direct));
                }
                if !params.is_empty() {
                    url.push_str("?");
                    url.push_str(&params.join("&"));
                }
                
                let sanitized_url = if let Some(idx) = url.find('@') {
                    format!("{}@{}", &url[..url.find("://").unwrap_or(0)+3], &url[idx+1..])
                } else {
                    url.clone()
                };
                println!("[Database] Generated URL: {}", sanitized_url);

                Ok(url)
            }
            DbType::Sqlserver => {
                let mut url = format!(
                    "sqlserver://{}:{}@{}:{}/{}",
                    user, password, host, port, database
                );

                if ssl_enabled {
                    url.push_str("?encrypt=require");
                } else {
                    url.push_str("?encrypt=false");
                }

                Ok(url)
            }
            _ => Err(AppError::Validation(format!("Unsupported database engine for connection string: {:?}", config.db_type))),
        }
    }

    fn url_encode(input: &str) -> String {
        // Simple percent-encoding for common sensitive characters in URLs
        input.chars().map(|c| {
            match c {
                'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
                _ => format!("%{:02X}", c as u32),
            }
        }).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DbConnectionConfig, SshConfig, SshAuthType};
    use crate::db::DbType;
    use secrecy::SecretString;

    #[test]
    fn test_build_postgres_url() {
        let config = DbConnectionConfig {
            id: None,
            name: "Test".into(),
            environment: "local".into(),
            db_type: DbType::Postgres,
            host: "localhost".into(),
            port: 5432,
            user: "user".into(),
            password: Some(SecretString::new("pass@word".into())),
            database: Some("db".into()),
            auth_source: None,
            replica_set: None,
            direct_connection: None,
            ssl: None,
            ssh_tunnel: None,
        };
        let url = ConnectionStringBuilder::build(&config).unwrap();
        assert_eq!(url, "postgres://user:pass%40word@localhost:5432/db?sslmode=prefer");
    }

    #[test]
    fn test_build_postgres_ssh_url() {
        let config = DbConnectionConfig {
            id: None,
            name: "Test".into(),
            environment: "local".into(),
            db_type: DbType::Postgres,
            host: "remote-host".into(),
            port: 5432,
            user: "user".into(),
            password: Some(SecretString::new("pass".into())),
            database: Some("db".into()),
            auth_source: None,
            replica_set: None,
            direct_connection: None,
            ssl: None,
            ssh_tunnel: Some(SshConfig {
                host: "ssh-host".into(),
                port: 22,
                user: "ssh-user".into(),
                auth_type: SshAuthType::Password,
                password: None,
                private_key: None,
                passphrase: None,
                key_path: None,
            }),
        };
        let url = ConnectionStringBuilder::build(&config).unwrap();
        // Should use 127.0.0.1 when SSH tunnel is active
        assert_eq!(url, "postgres://user:pass@127.0.0.1:5432/db?sslmode=disable");
    }

    #[test]
    fn test_url_encode() {
        assert_eq!(ConnectionStringBuilder::url_encode("abc"), "abc");
        assert_eq!(ConnectionStringBuilder::url_encode("a b"), "a%20b");
        assert_eq!(ConnectionStringBuilder::url_encode("p@ss"), "p%40ss");
    }
}
