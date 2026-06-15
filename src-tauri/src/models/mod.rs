use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::DbType;
use secrecy::SecretString;
use std::fmt;

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
    #[serde(skip_serializing)]
    pub password: Option<SecretString>,
    pub database: Option<String>,
    #[serde(rename = "ssh")]
    pub ssh_tunnel: Option<SshConfig>,
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
            .finish()
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(skip_serializing)]
    pub password: Option<SecretString>,
    pub private_key_path: Option<String>,
}

impl fmt::Debug for SshConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SshConfig")
            .field("host", &"***")
            .field("user", &"***")
            .field("password", &self.password)
            .field("private_key_path", &self.private_key_path)
            .finish()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub execution_time_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_keys: Option<Vec<String>>,
}
