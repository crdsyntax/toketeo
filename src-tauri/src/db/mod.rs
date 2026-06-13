use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::AppResult;
use crate::models::QueryResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    Postgres,
    Mariadb,
    Mysql,
    Sqlite,
    Mongodb,
    Sqlserver,
}

#[async_trait]
pub trait DbDriver: Send + Sync {
    async fn execute(&self, query: &str) -> AppResult<QueryResult>;
    async fn fetch_schemas(&self) -> AppResult<Vec<String>>;
    async fn fetch_tables(&self, schema: Option<String>) -> AppResult<Vec<String>>;
    async fn close(&self) -> AppResult<()>;
}

pub mod postgres;
pub mod mysql;
