use crate::error::AppResult;
use crate::models::QueryResult;
use crate::models::sync::DriverCapabilities;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    Postgres,
    Mariadb,
    Mysql,
    Sqlite,
    Mongodb,
    Sqlserver,
    Redis,
}

impl std::fmt::Display for DbType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            DbType::Postgres => "postgres",
            DbType::Mariadb => "mariadb",
            DbType::Mysql => "mysql",
            DbType::Sqlite => "sqlite",
            DbType::Mongodb => "mongodb",
            DbType::Sqlserver => "sqlserver",
            DbType::Redis => "redis",
        };
        write!(f, "{}", s)
    }
}

/// Lectura de datos con paginación por keyset.
#[async_trait]
pub trait DataReader: Send + Sync {
    async fn fetch_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>>;

    async fn count_rows(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> AppResult<u64>;
}

/// Escritura de datos con upsert.
#[async_trait]
pub trait DataWriter: Send + Sync {
    async fn upsert_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<UpsertResult>;
}

/// Resultado de un upsert batch: filas afectadas + filas omitidas (duplicados en MongoDB).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpsertResult {
    pub affected: u64,
    pub skipped: u64,
}

#[async_trait]
pub trait DbDriver: DataReader + DataWriter + Send + Sync {
    fn db_type(&self) -> DbType;
    async fn execute(&self, query: &str) -> AppResult<QueryResult>;
    async fn execute_with_schema(&self, query: &str, _schema: &str) -> AppResult<QueryResult> {
        self.execute(query).await
    }
    async fn fetch_databases(&self) -> AppResult<Vec<String>>;
    async fn fetch_schemas(&self) -> AppResult<Vec<String>>;
    async fn fetch_tables(
        &self,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>>;
    async fn fetch_views(
        &self,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>>;
    async fn fetch_procedures(
        &self,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>>;
    async fn fetch_triggers(
        &self,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>>;
    async fn fetch_functions(
        &self,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>>;
    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_constraints(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_ddl(
        &self,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<String>;
    async fn fetch_parameters(
        &self,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>>;
    async fn fetch_mongo_structure(&self) -> AppResult<serde_json::Value> {
        Err(crate::error::AppError::Validation("Not supported for this database type".to_string()))
    }
    async fn close(&self) -> AppResult<()>;
}

/// Capacidades del driver para sync.
pub trait CapabilityProvider: Send + Sync {
    fn capabilities(&self) -> DriverCapabilities;
}

pub mod mongodb;
pub mod common;
pub mod mysql;
pub mod postgres;
pub mod redis;
pub mod sqlserver;

#[derive(Debug, Clone)]
pub struct PoolConfig {
    pub max_connections: u32,
    pub idle_timeout: Option<Duration>,
    pub acquire_timeout: Duration,
    pub max_lifetime: Option<Duration>,
    pub keep_alive: Option<Duration>,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 5,
            idle_timeout: Some(Duration::from_secs(600)),
            acquire_timeout: Duration::from_secs(30),
            max_lifetime: Some(Duration::from_secs(28800)),
            keep_alive: None,
        }
    }
}

#[async_trait]
impl DataReader for std::sync::Arc<dyn DbDriver> {
    async fn fetch_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>> {
        (**self).fetch_rows(table, schema, columns, pk_column, last_key, batch_size).await
    }

    async fn count_rows(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> AppResult<u64> {
        (**self).count_rows(table, schema).await
    }
}

#[async_trait]
impl DataWriter for std::sync::Arc<dyn DbDriver> {
    async fn upsert_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<UpsertResult> {
        (**self).upsert_rows(table, schema, columns, primary_keys, rows).await
    }
}

impl From<&crate::models::DbConnectionConfig> for Option<PoolConfig> {
    fn from(config: &crate::models::DbConnectionConfig) -> Self {
        let max = config.max_pool_size.unwrap_or(0);
        let idle = config.idle_timeout.unwrap_or(0);
        let acq = config.acquire_timeout.unwrap_or(0);
        let life = config.max_lifetime.unwrap_or(0);
        let ka = config.keep_alive.unwrap_or(0);

        if max == 0 && idle == 0 && acq == 0 && life == 0 && ka == 0 {
            return None;
        }

        Some(PoolConfig {
            max_connections: if max > 0 { max as u32 } else { 5 },
            idle_timeout: if idle > 0 { Some(Duration::from_secs(idle as u64)) } else { None },
            acquire_timeout: if acq > 0 { Duration::from_secs(acq as u64) } else { Duration::from_secs(30) },
            max_lifetime: if life > 0 { Some(Duration::from_secs(life as u64)) } else { None },
            keep_alive: if ka > 0 { Some(Duration::from_secs(ka as u64)) } else { None },
        })
    }
}

