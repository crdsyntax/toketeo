use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::DbType;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbConnectionConfig {
    pub id: Option<Uuid>,
    pub name: String,
    pub environment: String,
    #[serde(rename = "type")]
    pub db_type: DbType,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: Option<String>,
    pub database: Option<String>,
    #[serde(rename = "ssh")]
    pub ssh_tunnel: Option<SshConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub execution_time_ms: u64,
    pub primary_keys: Option<Vec<String>>,
}
