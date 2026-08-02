//! In-memory `DbDriver` implementation for unit tests. Configured with fixed
//! tables/columns so assistant tools and orchestration can be tested without a
//! real database.

use async_trait::async_trait;
use std::sync::{Arc, Mutex};

use crate::db::{CapabilityProvider, DataReader, DataWriter, DbDriver, DbType, UpsertResult};
use crate::error::AppResult;
use crate::models::QueryResult;
use crate::models::sync::DriverCapabilities;

/// A table definition served by the mock.
#[derive(Debug, Clone, Default)]
pub struct MockTable {
    pub name: String,
    /// Column metadata items, each with at least `name` and optionally
    /// `isPrimaryKey`.
    pub columns: Vec<serde_json::Value>,
    /// Rows returned for `SELECT * FROM <name>`.
    pub rows: Vec<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct MockDriverSpec {
    pub db_type: DbType,
    pub databases: Vec<String>,
    pub tables: Vec<MockTable>,
    /// Error injected for `execute` calls (e.g. to simulate a dead connection).
    pub execute_error: Option<String>,
    pub upsert_count: u64,
}

/// Simple mock driver. `Spec` is optional; a default instance exposes
/// `users`/`orders` tables and a `mydb` database.
pub struct MockDriver {
    spec: Arc<Mutex<MockDriverSpec>>,
}

impl MockDriver {
    pub fn new(spec: MockDriverSpec) -> Arc<Self> {
        Arc::new(Self {
            spec: Arc::new(Mutex::new(spec)),
        })
    }

    pub fn default_spec() -> MockDriverSpec {
        MockDriverSpec {
            db_type: DbType::Mariadb,
            databases: vec!["mydb".to_string()],
            tables: vec![
                MockTable {
                    name: "users".to_string(),
                    columns: vec![
                        serde_json::json!({ "name": "id", "isPrimaryKey": true }),
                        serde_json::json!({ "name": "email", "isPrimaryKey": false }),
                    ],
                    rows: vec![
                        serde_json::json!({ "id": 1, "email": "a@x.com" }),
                        serde_json::json!({ "id": 2, "email": "b@x.com" }),
                    ],
                },
                MockTable {
                    name: "orders".to_string(),
                    columns: vec![
                        serde_json::json!({ "name": "id", "isPrimaryKey": true }),
                        serde_json::json!({ "name": "total", "isPrimaryKey": false }),
                    ],
                    rows: vec![serde_json::json!({ "id": 10, "total": 5.5 })],
                },
            ],
            execute_error: None,
            upsert_count: 0,
        }
    }

    pub fn spec(&self) -> std::sync::MutexGuard<'_, MockDriverSpec> {
        self.spec.lock().unwrap()
    }

    fn find_table(&self, name: &str) -> Option<MockTable> {
        self.spec()
            .tables
            .iter()
            .find(|t| t.name == name)
            .cloned()
    }
}

#[async_trait]
impl DataReader for MockDriver {
    async fn fetch_rows(
        &self,
        table: &str,
        _schema: Option<&str>,
        _columns: &[String],
        _pk_column: &str,
        _last_key: Option<serde_json::Value>,
        _batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(self.find_table(table).map(|t| t.rows).unwrap_or_default())
    }

    async fn count_rows(&self, table: &str, _schema: Option<&str>) -> AppResult<u64> {
        Ok(self.find_table(table).map(|t| t.rows.len() as u64).unwrap_or(0))
    }
}

#[async_trait]
impl DataWriter for MockDriver {
    async fn upsert_rows(
        &self,
        _table: &str,
        _schema: Option<&str>,
        _columns: &[String],
        _primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<UpsertResult> {
        let mut spec = self.spec.lock().unwrap();
        spec.upsert_count += rows.len() as u64;
        Ok(UpsertResult {
            affected: rows.len() as u64,
            skipped: 0,
        })
    }
}

#[async_trait]
impl DbDriver for MockDriver {
    fn db_type(&self) -> DbType {
        self.spec().db_type.clone()
    }

    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        {
            let spec = self.spec.lock().unwrap();
            if let Some(err) = &spec.execute_error {
                return Err(crate::error::AppError::Internal(err.clone()));
            }
        }
        let trimmed = query.trim();
        if trimmed.starts_with("SELECT") {
            let table = trimmed
                .split_whitespace()
                .nth(3)
                .map(|s| s.trim_end_matches(';').to_string())
                .unwrap_or_default();
            let t = self.find_table(&table).unwrap_or_default();
            return Ok(QueryResult {
                columns: t.columns.iter().filter_map(|c| {
                    c.get("name").and_then(|v| v.as_str()).map(String::from)
                }).collect(),
                rows: t.rows,
                execution_time_ms: 1,
                primary_keys: Some(vec!["id".to_string()]),
                rows_affected: 0,
            });
        }
        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            execution_time_ms: 0,
            primary_keys: None,
            rows_affected: 1,
        })
    }

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        Ok(self.spec().databases.clone())
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        Ok(vec!["mydb".to_string()])
    }

    async fn fetch_tables(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(self
            .spec()
            .tables
            .iter()
            .map(|t| t.name.clone())
            .collect())
    }

    async fn fetch_views(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_procedures(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_triggers(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_functions(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_columns(
        &self,
        table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(self.find_table(table).map(|t| t.columns).unwrap_or_default())
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(self
            .find_table(table)
            .map(|t| {
                t.columns
                    .iter()
                    .filter(|c| c.get("isPrimaryKey").and_then(|v| v.as_bool()).unwrap_or(false))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default())
    }

    async fn fetch_foreign_keys(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn fetch_constraints(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn fetch_ddl(
        &self,
        name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<String> {
        Ok(format!("CREATE TABLE {name} (id INT PRIMARY KEY);"))
    }

    async fn fetch_parameters(
        &self,
        _name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn close(&self) -> AppResult<()> {
        Ok(())
    }
}

impl CapabilityProvider for MockDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_transactions: true,
            supports_savepoints: true,
            supports_upsert: true,
            upsert_strategy: Some(crate::models::sync::UpsertStrategy::OnDuplicateKey),
            supports_keyset_pagination: true,
            supports_streaming: false,
            supports_json: true,
            supports_arrays: false,
            supports_returning: false,
            max_batch_size: 1000,
        }
    }
}
