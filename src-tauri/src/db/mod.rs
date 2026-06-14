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
    async fn fetch_views(&self, schema: Option<String>) -> AppResult<Vec<String>>;
    async fn fetch_procedures(&self, schema: Option<String>) -> AppResult<Vec<String>>;
    async fn fetch_triggers(&self, schema: Option<String>) -> AppResult<Vec<String>>;
    async fn fetch_functions(&self, schema: Option<String>) -> AppResult<Vec<String>>;
    async fn fetch_columns(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_indexes(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_foreign_keys(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_constraints(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_ddl(&self, name: &str, object_type: &str, schema: Option<String>) -> AppResult<String>;
    async fn fetch_parameters(&self, name: &str, object_type: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>>;
    async fn switch_schema(&self, schema: &str) -> AppResult<()>;
    async fn close(&self) -> AppResult<()>;
}

pub mod postgres;
pub mod mysql;
