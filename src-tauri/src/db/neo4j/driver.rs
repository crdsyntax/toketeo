use crate::db::neo4j::connection::build_config;
use crate::db::neo4j::query::{execute_cypher, ping};
use crate::db::{DbDriver, DbType, GraphDriver, PoolConfig};
use crate::error::{AppError, AppResult};
use crate::models::{GraphMetadata, GraphResult, QueryResult};
use async_trait::async_trait;
use std::sync::Arc;
use std::time::Duration;

/// Driver Neo4j: único punto de contacto con `neo4rs`. Implementa `DbDriver`
/// (con fallbacks Err para capacidades relacionales) y `GraphDriver` (sus
/// capacidades nativas). Nunca conoce SSH: `ConnectionService` resuelve túnel y
/// host/port antes de construir el driver.
pub struct Neo4jDriver {
    graph: Arc<neo4rs::Graph>,
    query_timeout: Duration,
}

impl Neo4jDriver {
    pub async fn new(
        url: &str,
        user: &str,
        password: Option<&str>,
        database: Option<&str>,
        pool_config: Option<&PoolConfig>,
    ) -> AppResult<Self> {
        let config = build_config(
            url,
            user,
            password.unwrap_or_default(),
            database,
            pool_config,
        )?;
        let graph = neo4rs::Graph::connect(config)
            .map_err(|e| AppError::Connection(format!("Neo4j connect error: {}", e)))?;
        let driver = Self {
            graph: Arc::new(graph),
            query_timeout: Duration::from_secs(60),
        };
        // Verifica conectividad real en la creación (auth + bolt handshake).
        ping(&driver.graph).await?;
        Ok(driver)
    }

    pub async fn verify_connectivity(&self) -> AppResult<()> {
        ping(&self.graph).await
    }

    fn not_supported(what: &str) -> AppError {
        AppError::Validation(format!("{} is not supported for Neo4j connections", what))
    }
}

#[async_trait]
impl GraphDriver for Neo4jDriver {
    fn db_type(&self) -> DbType {
        DbType::Neo4j
    }

    async fn node_labels(&self) -> AppResult<Vec<String>> {
        Err(Self::not_supported("node_labels (Phase 3)"))
    }

    async fn relationship_types(&self) -> AppResult<Vec<String>> {
        Err(Self::not_supported("relationship_types (Phase 3)"))
    }

    async fn graph_metadata(&self) -> AppResult<GraphMetadata> {
        Err(Self::not_supported("graph_metadata (Phase 3)"))
    }

    async fn execute_cypher(
        &self,
        query: &str,
        params: &[Option<String>],
    ) -> AppResult<GraphResult> {
        execute_cypher(&self.graph, query, params, Some(self.query_timeout)).await
    }

    async fn close(&self) -> AppResult<()> {
        Ok(())
    }
}

#[async_trait]
impl DbDriver for Neo4jDriver {
    fn db_type(&self) -> DbType {
        DbType::Neo4j
    }

    /// Ejecuta Cypher y devuelve una vista tabular (columnas + rows JSON).
    /// Para ping/health (`RETURN 1`) y para respuestas tabulares simples.
    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        execute_cypher(&self.graph, query, &[], Some(self.query_timeout)).await?;
        Ok(QueryResult {
            columns: Vec::new(),
            rows: Vec::new(),
            execution_time_ms: 0,
            primary_keys: None,
            rows_affected: 0,
            next_cursor: None,
        })
    }

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        Err(Self::not_supported("fetch_databases"))
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        Err(Self::not_supported("fetch_schemas"))
    }

    async fn fetch_tables(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Err(Self::not_supported("fetch_tables"))
    }

    async fn fetch_views(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Err(Self::not_supported("fetch_views"))
    }

    async fn fetch_procedures(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Err(Self::not_supported("fetch_procedures"))
    }

    async fn fetch_triggers(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Err(Self::not_supported("fetch_triggers"))
    }

    async fn fetch_functions(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Err(Self::not_supported("fetch_functions"))
    }

    async fn fetch_columns(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Err(Self::not_supported("fetch_columns"))
    }

    async fn fetch_indexes(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Err(Self::not_supported("fetch_indexes"))
    }

    async fn fetch_foreign_keys(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Err(Self::not_supported("fetch_foreign_keys"))
    }

    async fn fetch_constraints(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Err(Self::not_supported("fetch_constraints"))
    }

    async fn fetch_ddl(
        &self,
        _name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<String> {
        Err(Self::not_supported("fetch_ddl"))
    }

    async fn fetch_parameters(
        &self,
        _name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Err(Self::not_supported("fetch_parameters"))
    }

    async fn close(&self) -> AppResult<()> {
        Ok(())
    }

    fn as_graph(&self) -> Option<&dyn GraphDriver> {
        Some(self)
    }
}

#[async_trait]
impl crate::db::DataReader for Neo4jDriver {
    async fn fetch_rows(
        &self,
        _table: &str,
        _schema: Option<&str>,
        _columns: &[String],
        _pk_column: &str,
        _last_key: Option<serde_json::Value>,
        _batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>> {
        Err(Self::not_supported("fetch_rows"))
    }

    async fn count_rows(&self, _table: &str, _schema: Option<&str>) -> AppResult<u64> {
        Err(Self::not_supported("count_rows"))
    }
}

#[async_trait]
impl crate::db::DataWriter for Neo4jDriver {
    async fn upsert_rows(
        &self,
        _table: &str,
        _schema: Option<&str>,
        _columns: &[String],
        _primary_keys: &[String],
        _rows: &[serde_json::Value],
    ) -> AppResult<crate::db::UpsertResult> {
        Err(Self::not_supported("upsert_rows"))
    }
}
