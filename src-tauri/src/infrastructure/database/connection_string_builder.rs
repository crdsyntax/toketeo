use crate::models::DbConnectionConfig;
use crate::db::DbType;
use secrecy::ExposeSecret;

pub struct ConnectionStringBuilder;

impl ConnectionStringBuilder {
    pub fn build(config: &DbConnectionConfig) -> String {
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
        
        match config.db_type {
            DbType::Postgres => {
                let mut url = format!(
                    "postgres://{}:{}@{}:{}/{}",
                    user, password, host, port, database
                );
                // Add default TLS params if needed
                if config.ssh_tunnel.is_none() {
                    url.push_str("?sslmode=prefer");
                } else {
                    url.push_str("?sslmode=disable");
                }
                url
            }
            DbType::Mysql | DbType::Mariadb => {
                format!(
                    "mysql://{}:{}@{}:{}/{}",
                    user, password, host, port, database
                )
            }
            DbType::Mongodb => {
                format!(
                    "mongodb://{}:{}@{}:{}/{}?authSource=admin",
                    user, password, host, port, database
                )
            }
            _ => String::new(),
        }
    }

    fn url_encode(input: &str) -> String {
        // Simple percent-encoding for common sensitive characters in URLs
        // In a real project, using the 'url' crate is preferred.
        input.chars().map(|c| {
            match c {
                'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
                _ => format!("%{:02X}", c as u32),
            }
        }).collect()
    }
}
