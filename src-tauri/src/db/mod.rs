use crate::error::{AppError, AppResult};
use crate::models::sync::DriverCapabilities;
use crate::models::QueryResult;
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
    Neo4j,
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
            DbType::Neo4j => "neo4j",
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

    async fn count_rows(&self, table: &str, schema: Option<&str>) -> AppResult<u64>;
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

/// Resultado de un statement dentro de una sesión de script: filas afectadas
/// (DML) o número de filas devueltas (SELECT). Los datos de SELECT no viajan
/// por IPC: solo el conteo.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StatementOutcome {
    pub rows_affected: Option<u64>,
    pub row_count: Option<usize>,
}

/// Sesión transaccional para ejecutar un script statement a statement sobre
/// UNA conexión: BEGIN al crearla, COMMIT/ROLLBACK al finalizar.
/// Las implementaciones con sqlx usan `Transaction` (rollback automático en
/// drop si nunca se llama commit/rollback).
#[async_trait]
pub trait ScriptTransaction: Send + Sync {
    async fn execute_statement(&mut self, sql: &str) -> AppResult<StatementOutcome>;
    async fn commit(self: Box<Self>) -> AppResult<()>;
    async fn rollback(self: Box<Self>) -> AppResult<()>;
}

pub type BoxScriptTransaction = Box<dyn ScriptTransaction>;

#[async_trait]
pub trait DbDriver: DataReader + DataWriter + Send + Sync {
    fn db_type(&self) -> DbType;
    async fn execute(&self, query: &str) -> AppResult<QueryResult>;
    /// Ejecuta una query con parámetros bindeados (identificadores/valores
    /// sanitizados por el driver). Fallback por defecto: no soportado.
    async fn execute_with_params(
        &self,
        _query: &str,
        _params: &[Option<String>],
    ) -> AppResult<QueryResult> {
        Err(AppError::Validation(
            "execute_with_params is not supported for this database type".into(),
        ))
    }
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
    async fn fetch_referenced_by_keys(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }
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
        Err(crate::error::AppError::Validation(
            "Not supported for this database type".to_string(),
        ))
    }
    /// Abre una sesión transaccional para ejecutar un script statement a
    /// statement (BEGIN + conexión única). Soporte por defecto: no soportado.
    async fn begin_script(&self, _schema: Option<&str>) -> AppResult<Box<dyn ScriptTransaction>> {
        Err(AppError::Validation(
            "Script execution is not supported for this database type".into(),
        ))
    }
    async fn close(&self) -> AppResult<()>;
    /// Expone las capacidades de grafo si el driver es un motor de grafos
    /// (Neo4j). Default: este driver no tiene capacidades de grafo.
    fn as_graph(&self) -> Option<&dyn GraphDriver> {
        None
    }
}

/// Capacidades del driver para sync.
pub trait CapabilityProvider: Send + Sync {
    fn capabilities(&self) -> DriverCapabilities;
}

/// Capacidades de grafo (Neo4j). Trait separado de `DbDriver`: el core no
/// asume que toda BD es relacional, ni obliga a motores relacionales a
/// exponer capacidades de grafo en el trait base. Implementado solo por el
/// driver Neo4j.
#[async_trait]
pub trait GraphDriver: Send + Sync {
    fn db_type(&self) -> DbType;
    async fn node_labels(&self) -> AppResult<Vec<String>>;
    async fn relationship_types(&self) -> AppResult<Vec<String>>;
    async fn graph_metadata(&self) -> AppResult<crate::models::GraphMetadata>;
    async fn execute_cypher(
        &self,
        query: &str,
        params: &[Option<String>],
    ) -> AppResult<crate::models::GraphResult>;
    async fn close(&self) -> AppResult<()>;
}

pub type BoxGraphDriver = Box<dyn GraphDriver>;

pub mod common;
pub mod mongodb;
pub mod mysql;
pub mod neo4j;
pub mod postgres;
pub mod redis;
pub mod sqlite;
pub mod sqlserver;

#[cfg(test)]
pub mod mock;

/// Quote an identifier (table/column/index/constraint) according to the engine
/// dialect. Shared by Tauri commands and assistant tools.
pub(crate) fn quote_identifier(db_type: &DbType, name: &str) -> String {
    match db_type {
        DbType::Postgres => postgres::quote_pg(name),
        DbType::Mysql | DbType::Mariadb => mysql::quote_mysql(name),
        DbType::Sqlserver => sqlserver::quote_ss(name),
        DbType::Sqlite => sqlite::quote_sqlite(name),
        _ => name.to_string(),
    }
}

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
        (**self)
            .fetch_rows(table, schema, columns, pk_column, last_key, batch_size)
            .await
    }

    async fn count_rows(&self, table: &str, schema: Option<&str>) -> AppResult<u64> {
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
        (**self)
            .upsert_rows(table, schema, columns, primary_keys, rows)
            .await
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
            idle_timeout: if idle > 0 {
                Some(Duration::from_secs(idle as u64))
            } else {
                None
            },
            acquire_timeout: if acq > 0 {
                Duration::from_secs(acq as u64)
            } else {
                Duration::from_secs(30)
            },
            max_lifetime: if life > 0 {
                Some(Duration::from_secs(life as u64))
            } else {
                None
            },
            keep_alive: if ka > 0 {
                Some(Duration::from_secs(ka as u64))
            } else {
                None
            },
        })
    }
}
