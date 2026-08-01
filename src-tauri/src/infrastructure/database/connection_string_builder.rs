use crate::db::DbType;
use crate::error::{AppError, AppResult};
use crate::models::DbConnectionConfig;
use secrecy::ExposeSecret;

pub struct ConnectionStringBuilder;

impl ConnectionStringBuilder {
    pub fn build(config: &DbConnectionConfig) -> AppResult<String> {
        let user = Self::url_encode(&config.user);
        let password = config
            .password
            .as_ref()
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
                params.push("connect_timeout=10");

                if !params.is_empty() {
                    url.push_str("?");
                    url.push_str(&params.join("&"));
                }
                Ok(url)
            }
            DbType::Mongodb => {
                let auth_disabled = config.auth_enabled == Some(false);
                let has_credentials = !user.is_empty() || !password.is_empty();
                let needs_auth = !auth_disabled && has_credentials;

                let db_path = if database.is_empty() {
                    String::new()
                } else {
                    format!("/{}", database)
                };

                let mut url = if needs_auth {
                    format!(
                        "mongodb://{}:{}@{}:{}{}",
                        user, password, host, port, db_path
                    )
                } else {
                    format!("mongodb://{}:{}{}", host, port, db_path)
                };

                let mut params = Vec::new();

                if ssl_enabled {
                    params.push("tls=true".to_string());
                }

                if needs_auth {
                    if let Some(ref auth_source) = config.auth_source {
                        if !auth_source.is_empty() {
                            params.push(format!("authSource={}", auth_source));
                        }
                    }
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

                let _sanitized_url = if let Some(idx) = url.find('@') {
                    format!(
                        "{}@{}",
                        &url[..url.find("://").unwrap_or(0) + 3],
                        &url[idx + 1..]
                    )
                } else {
                    url.clone()
                };

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
            DbType::Redis => {
                let mut url = if !password.is_empty() {
                    format!("redis://:{}@{}:{}", password, host, port)
                } else if !user.is_empty() {
                    format!("redis://:{}@{}:{}", user, host, port)
                } else {
                    format!("redis://:{}@{}:{}", "", host, port)
                };

                let db_str = database.strip_prefix("db").unwrap_or(database);
                let db_num = db_str.parse::<u8>().unwrap_or(0);
                if db_num > 0 {
                    url.push_str(&format!("/{}", db_num));
                }

                Ok(url)
            }
            _ => Err(AppError::Validation(format!(
                "Unsupported database engine for connection string: {:?}",
                config.db_type
            ))),
        }
    }

    fn url_encode(input: &str) -> String {
        // Simple percent-encoding for common sensitive characters in URLs
        input
            .chars()
            .map(|c| match c {
                'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
                _ => format!("%{:02X}", c as u32),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbType;
    use crate::models::{DbConnectionConfig, SshAuthType, SshConfig};
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
            default_database: None,
            auth_enabled: None,
            auth_source: None,
            replica_set: None,
            direct_connection: None,
            ssl: None,
            ssh_tunnel: None,
            read_only: Some(false),
            max_pool_size: None,
            idle_timeout: None,
            acquire_timeout: None,
            max_lifetime: None,
            keep_alive: None,
            metadata_cache_ttl: None,
            password_enc: None,
            password_nonce: None,
            ssh_enc: None,
            ssh_nonce: None,
        };
        let url = ConnectionStringBuilder::build(&config).unwrap();
        assert_eq!(
            url,
            "postgres://user:pass%40word@localhost:5432/db?sslmode=prefer"
        );
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
            default_database: None,
            auth_enabled: None,
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
            read_only: Some(false),
            max_pool_size: None,
            idle_timeout: None,
            acquire_timeout: None,
            max_lifetime: None,
            keep_alive: None,
            metadata_cache_ttl: None,
            password_enc: None,
            password_nonce: None,
            ssh_enc: None,
            ssh_nonce: None,
        };
        let url = ConnectionStringBuilder::build(&config).unwrap();
        // Should use 127.0.0.1 when SSH tunnel is active
        assert_eq!(
            url,
            "postgres://user:pass@127.0.0.1:5432/db?sslmode=disable"
        );
    }

    #[test]
    fn test_url_encode() {
        assert_eq!(ConnectionStringBuilder::url_encode("abc"), "abc");
        assert_eq!(ConnectionStringBuilder::url_encode("a b"), "a%20b");
        assert_eq!(ConnectionStringBuilder::url_encode("p@ss"), "p%40ss");
    }
}
