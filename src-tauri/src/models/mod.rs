use crate::db::DbType;
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone)]
pub struct DbConnectionConfig {
    pub id: Option<Uuid>,
    pub name: String,
    pub environment: String,
    #[serde(rename = "type")]
    pub db_type: DbType,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(
        serialize_with = "serialize_secret",
        deserialize_with = "deserialize_secret"
    )]
    pub password: Option<SecretString>,
    pub database: Option<String>,
    #[serde(rename = "authSource")]
    pub auth_source: Option<String>,
    #[serde(rename = "replicaSet")]
    pub replica_set: Option<String>,
    #[serde(rename = "directConnection")]
    pub direct_connection: Option<bool>,
    pub ssl: Option<String>,
    #[serde(rename = "ssh")]
    pub ssh_tunnel: Option<SshConfig>,
    #[serde(rename = "readOnly")]
    pub read_only: Option<bool>,
    #[serde(rename = "maxPoolSize")]
    pub max_pool_size: Option<i32>,
    #[serde(rename = "idleTimeout")]
    pub idle_timeout: Option<i32>,
    #[serde(rename = "acquireTimeout")]
    pub acquire_timeout: Option<i32>,
    #[serde(rename = "maxLifetime")]
    pub max_lifetime: Option<i32>,
    #[serde(rename = "keepAlive")]
    pub keep_alive: Option<i32>,
    #[serde(rename = "metadataCacheTtl")]
    pub metadata_cache_ttl: Option<i32>,
}

impl fmt::Debug for DbConnectionConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DbConnectionConfig")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("environment", &self.environment)
            .field("db_type", &self.db_type)
            .field("host", &"***")
            .field("user", &"***")
            .field("password", &self.password)
            .field("database", &self.database)
            .field("auth_source", &self.auth_source)
            .field("replica_set", &self.replica_set)
            .field("direct_connection", &self.direct_connection)
            .field("max_pool_size", &self.max_pool_size)
            .field("idle_timeout", &self.idle_timeout)
            .field("acquire_timeout", &self.acquire_timeout)
            .field("max_lifetime", &self.max_lifetime)
            .field("keep_alive", &self.keep_alive)
            .field("metadata_cache_ttl", &self.metadata_cache_ttl)
            .finish()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SshAuthType {
    Password,
    Key,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(rename = "authType", alias = "authMethod")]
    pub auth_type: SshAuthType,
    #[serde(
        serialize_with = "serialize_secret",
        deserialize_with = "deserialize_secret",
        default
    )]
    pub password: Option<SecretString>,
    #[serde(
        rename = "privateKey",
        serialize_with = "serialize_secret",
        deserialize_with = "deserialize_secret",
        default
    )]
    pub private_key: Option<SecretString>,
    #[serde(
        serialize_with = "serialize_secret",
        deserialize_with = "deserialize_secret",
        default
    )]
    pub passphrase: Option<SecretString>,
    #[serde(rename = "keyPath", default)]
    pub key_path: Option<String>,
}

fn serialize_secret<S>(secret: &Option<SecretString>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    use secrecy::ExposeSecret;
    match secret {
        Some(s) => serializer.serialize_some(s.expose_secret()),
        None => serializer.serialize_none(),
    }
}

fn deserialize_secret<'de, D>(deserializer: D) -> Result<Option<SecretString>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let opt: Option<String> = serde::Deserialize::deserialize(deserializer)?;
    Ok(opt.map(SecretString::from))
}

impl fmt::Debug for SshConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SshConfig")
            .field("host", &"***")
            .field("user", &"***")
            .field("auth_type", &self.auth_type)
            .field("password", &self.password)
            .field("private_key", &"***")
            .field("passphrase", &"***")
            .field("key_path", &self.key_path)
            .finish()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    #[serde(rename = "executionTime")]
    pub execution_time_ms: u64,
    pub primary_keys: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RowContext {
    pub schema: Option<String>,
    pub table: String,
    pub primary_keys: std::collections::HashMap<String, serde_json::Value>,
    pub data: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CellUpdateInput {
    pub schema: Option<String>,
    pub table: String,
    pub row: std::collections::HashMap<String, serde_json::Value>,
    pub column: String,
    pub new_value: serde_json::Value,
    pub primary_keys: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SqlGenerationInput {
    pub context: RowContext,
}

#[cfg(test)]
mod tests {
    use super::*;
    use secrecy::SecretString;

    #[test]
    fn test_config_serialization_security() {
        let config = DbConnectionConfig {
            id: None,
            name: "Secret Conn".into(),
            environment: "prod".into(),
            db_type: DbType::Postgres,
            host: "sensitive-host.com".into(),
            port: 5432,
            user: "admin".into(),
            password: Some(SecretString::new("super-secret".into())),
            database: Some("main".into()),
            auth_source: None,
            replica_set: None,
            direct_connection: None,
            ssl: None,
            ssh_tunnel: None,
            read_only: None,
            max_pool_size: None,
            idle_timeout: None,
            acquire_timeout: None,
            max_lifetime: None,
            keep_alive: None,
            metadata_cache_ttl: None,
        };

        let json = serde_json::to_string(&config).unwrap();
        // Now passwords ARE serialized for local storage persistence
        assert!(json.contains("super-secret"));
        assert!(json.contains("password"));

        // Other fields should be there
        assert!(json.contains("Secret Conn"));
        assert!(json.contains("sensitive-host.com"));
    }

    #[test]
    fn test_ssh_config_serialization_security() {
        let ssh = SshConfig {
            host: "ssh-host".into(),
            port: 22,
            user: "ssh-user".into(),
            auth_type: SshAuthType::Password,
            password: Some(SecretString::new("ssh-pass".into())),
            private_key: None,
            passphrase: None,
            key_path: None,
        };

        let json = serde_json::to_string(&ssh).unwrap();
        assert!(json.contains("ssh-pass"));
        assert!(json.contains("password"));
        assert!(json.contains("ssh-host"));
        assert!(json.contains("authType"));
    }

    #[test]
    fn test_ssh_config_deserialization_legacy_auth_method() {
        use secrecy::ExposeSecret;

        let json = r#"{
            "host": "ssh-host",
            "port": 22,
            "user": "ssh-user",
            "authMethod": "password",
            "password": "ssh-pass"
        }"#;

        let ssh: SshConfig = serde_json::from_str(json).unwrap();
        assert_eq!(ssh.auth_type, SshAuthType::Password);
        assert_eq!(ssh.password.unwrap().expose_secret(), "ssh-pass");
    }
}
