use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::AppResult;
use crate::models::QueryResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum DbType {
    Postgres,
    Mysql,
    Sqlite,
    Mongodb,
    Mssql,
}

#[async_trait]
pub trait DbDriver: Send + Sync {
    async fn execute(&self, query: &str) -> AppResult<QueryResult>;
    async fn fetch_tables(&self) -> AppResult<Vec<String>>;
    async fn close(&self) -> AppResult<()>;
}

pub mod postgres;
pub mod mysql;
