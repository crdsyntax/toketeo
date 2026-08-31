use crate::db::{CapabilityProvider, DataReader, DataWriter, DbDriver, DbType, UpsertResult};
use crate::error::{AppError, AppResult};
use crate::models::sync::{DriverCapabilities, UpsertStrategy};
use crate::models::QueryResult;
use async_trait::async_trait;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Column, Row};
use std::time::Instant;

pub(crate) fn quote_sqlite(id: &str) -> String {
    format!("\"{}\"", id.replace('"', "\"\""))
}

fn json_to_sqlite_value(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => {
            if *b {
                "1".to_string()
            } else {
                "0".to_string()
            }
        }
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

fn json_to_sqlite_values(row: &serde_json::Value, columns: &[String]) -> String {
    columns
        .iter()
        .map(|col| {
            let value = row.get(col).unwrap_or(&serde_json::Value::Null);
            json_to_sqlite_value(value)
        })
        .collect::<Vec<_>>()
        .join(", ")
}

pub struct SqliteDriver {
    pool: sqlx::SqlitePool,
}

impl SqliteDriver {
    pub async fn new(url: &str) -> AppResult<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(url)
            .await
            .map_err(|e| AppError::Connection(format!("Failed to connect to SQLite: {}", e)))?;
        Ok(Self { pool })
    }

    async fn run_query(&self, query: &str) -> AppResult<Vec<serde_json::Value>> {
        let rows = sqlx::raw_sql(query)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("SQLite query failed: {}", e)))?;

        let mut result = Vec::new();
        for row in &rows {
            let mut map = serde_json::Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                let name = col.name();
                let value = row.try_get::<String, _>(i);
                match value {
                    Ok(s) => {
                        map.insert(name.to_string(), serde_json::Value::String(s));
                    }
                    Err(_) => {
                        if let Ok(n) = row.try_get::<i64, _>(i) {
                            map.insert(name.to_string(), serde_json::json!(n));
                        } else if let Ok(f) = row.try_get::<f64, _>(i) {
                            map.insert(name.to_string(), serde_json::json!(f));
                        } else {
                            map.insert(name.to_string(), serde_json::Value::Null);
                        }
                    }
                }
            }
            if !map.is_empty() {
                result.push(serde_json::Value::Object(map));
            }
        }
        Ok(result)
    }
}

#[async_trait]
impl DbDriver for SqliteDriver {
    fn db_type(&self) -> DbType {
        DbType::Sqlite
    }

    async fn begin_script(
        &self,
        _schema: Option<&str>,
    ) -> crate::db::AppResult<crate::db::BoxScriptTransaction> {
        let conn = self.pool.acquire().await.map_err(|e| {
            AppError::Connection(format!("Failed to acquire SQLite connection: {}", e))
        })?;
        let tx = sqlx::Transaction::begin(conn, None).await.map_err(|e| {
            AppError::Database(format!("Failed to begin script transaction: {}", e))
        })?;
        Ok(Box::new(SqliteScriptTransaction { tx }))
    }

    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        let start = Instant::now();
        let rows = self.run_query(query).await?;
        let columns = if !rows.is_empty() {
            rows[0]
                .as_object()
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        Ok(QueryResult {
            columns,
            column_types: None,
            rows,
            execution_time_ms: start.elapsed().as_millis() as u64,
            primary_keys: None,
            rows_affected: 0,

            next_cursor: None,
        })
    }

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        Ok(vec!["main".to_string()])
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        Ok(vec!["main".to_string()])
    }

    async fn fetch_tables(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = self
            .run_query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_views(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = self
            .run_query("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name")
            .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_procedures(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(Vec::new())
    }

    async fn fetch_triggers(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = self
            .run_query("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
            .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_functions(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(Vec::new())
    }

    async fn fetch_columns(
        &self,
        table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let pragma_query = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
        let rows = self.run_query(&pragma_query).await?;

        let mut cols = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            let name = row
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let col_type = row
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("TEXT")
                .to_string();
            let notnull = row.get("notnull").and_then(|v| v.as_i64()).unwrap_or(0);
            let pk = row.get("pk").and_then(|v| v.as_i64()).unwrap_or(0);
            let default_val = row.get("dflt_value").and_then(|v| v.as_str());

            map.insert("name".into(), serde_json::Value::String(name));
            map.insert("type".into(), serde_json::Value::String(col_type));
            map.insert("isNullable".into(), serde_json::json!(notnull == 0));
            map.insert("isPrimaryKey".into(), serde_json::json!(pk != 0));
            map.insert(
                "defaultValue".into(),
                default_val
                    .map(|s| serde_json::Value::String(s.to_string()))
                    .unwrap_or(serde_json::Value::Null),
            );
            map.insert("comment".into(), serde_json::Value::Null);
            cols.push(serde_json::Value::Object(map));
        }
        Ok(cols)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let rows = self.run_query(&format!(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='{}' AND sql IS NOT NULL ORDER BY name",
            table.replace('\'', "''")
        )).await?;

        let mut indexes = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert(
                "name".into(),
                row.get("name").cloned().unwrap_or(serde_json::Value::Null),
            );
            map.insert(
                "type".into(),
                serde_json::Value::String("btree".to_string()),
            );
            indexes.push(serde_json::Value::Object(map));
        }
        Ok(indexes)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let pragma_query = format!(
            "PRAGMA foreign_key_list(\"{}\")",
            table.replace('"', "\"\"")
        );
        self.run_query(&pragma_query).await
    }

    async fn fetch_constraints(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(Vec::new())
    }

    async fn fetch_ddl(
        &self,
        name: &str,
        object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<String> {
        let obj_type = object_type.to_lowercase();
        let query = format!(
            "SELECT sql FROM sqlite_master WHERE type='{}' AND name='{}'",
            obj_type,
            name.replace('\'', "''")
        );
        let rows = self.run_query(&query).await?;
        if let Some(row) = rows.first() {
            if let Some(sql) = row.get("sql").and_then(|v| v.as_str()) {
                return Ok(sql.to_string());
            }
        }
        Err(AppError::Internal(format!(
            "Could not retrieve DDL for {} {}",
            object_type, name
        )))
    }

    async fn fetch_parameters(
        &self,
        _name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(Vec::new())
    }

    async fn close(&self) -> AppResult<()> {
        self.pool.close().await;
        Ok(())
    }
}

#[async_trait]
impl DataReader for SqliteDriver {
    async fn fetch_rows(
        &self,
        table: &str,
        _schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>> {
        let table_ref = quote_sqlite(table);

        let select_clause = if columns.is_empty() {
            "*".to_string()
        } else {
            let cols: Vec<String> = columns.iter().map(|c| quote_sqlite(c)).collect();
            cols.join(", ")
        };

        let query = if let Some(ref key) = last_key {
            let key_str = json_to_sqlite_value(key);
            format!(
                "SELECT {} FROM {} WHERE {} > {} ORDER BY {} ASC LIMIT {}",
                select_clause,
                table_ref,
                quote_sqlite(pk_column),
                key_str,
                quote_sqlite(pk_column),
                batch_size,
            )
        } else {
            format!(
                "SELECT {} FROM {} ORDER BY {} ASC LIMIT {}",
                select_clause,
                table_ref,
                quote_sqlite(pk_column),
                batch_size,
            )
        };

        self.run_query(&query).await
    }

    async fn count_rows(&self, table: &str, _schema: Option<&str>) -> AppResult<u64> {
        let rows = self
            .run_query(&format!(
                "SELECT COUNT(*) as cnt FROM {}",
                quote_sqlite(table)
            ))
            .await?;
        Ok(rows
            .first()
            .and_then(|r| r.get("cnt").and_then(|v| v.as_i64()))
            .unwrap_or(0) as u64)
    }
}

#[async_trait]
impl DataWriter for SqliteDriver {
    async fn upsert_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<UpsertResult> {
        if rows.is_empty() || columns.is_empty() {
            return Ok(UpsertResult::default());
        }

        let table_ref = if let Some(s) = schema {
            format!("{}.{}", quote_sqlite(s), quote_sqlite(table))
        } else {
            quote_sqlite(table)
        };

        let quoted_cols: Vec<String> = columns.iter().map(|c| quote_sqlite(c)).collect();
        let cols_str = quoted_cols.join(", ");

        let update_parts: Vec<String> = quoted_cols
            .iter()
            .map(|c| format!("{} = excluded.{}", c, c))
            .collect();
        let update_str = update_parts.join(", ");

        let pk_cols: Vec<String> = primary_keys.iter().map(|k| quote_sqlite(k)).collect();
        let pk_clause = pk_cols.join(", ");

        let mut total_affected = 0u64;

        for row in rows {
            let values = json_to_sqlite_values(row, columns);

            let query = if !pk_clause.is_empty() {
                format!(
                    "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
                    table_ref, cols_str, values, pk_clause, update_str,
                )
            } else {
                format!(
                    "INSERT INTO {} ({}) VALUES ({})",
                    table_ref, cols_str, values,
                )
            };

            match sqlx::raw_sql(&query).execute(&self.pool).await {
                Ok(_) => total_affected += 1,
                Err(e) => {
                    tracing::warn!(
                        "[sqlite] upsert_rows failed for row in {}: {}",
                        table_ref,
                        e,
                    );
                }
            }
        }

        Ok(UpsertResult {
            affected: total_affected,
            skipped: 0,
        })
    }

    async fn add_column(
        &self,
        table: &str,
        schema: Option<&str>,
        column: &str,
        _column_type: &str,
    ) -> AppResult<()> {
        let table_ref = if let Some(s) = schema {
            format!("{}.{}", quote_sqlite(s), quote_sqlite(table))
        } else {
            quote_sqlite(table)
        };

        let sql = format!(
            "ALTER TABLE {} ADD COLUMN {} TEXT",
            table_ref,
            quote_sqlite(column)
        );
        self.execute(&sql).await?;
        Ok(())
    }
}

impl CapabilityProvider for SqliteDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_transactions: true,
            supports_savepoints: true,
            supports_upsert: true,
            upsert_strategy: Some(UpsertStrategy::OnConflict),
            supports_keyset_pagination: true,
            supports_streaming: false,
            supports_json: false,
            supports_arrays: false,
            supports_returning: false,
            max_batch_size: 500,
        }
    }
}

#[async_trait]
impl crate::db::ScriptTransaction for SqliteScriptTransaction {
    async fn execute_statement(
        &mut self,
        sql: &str,
    ) -> crate::db::AppResult<crate::db::StatementOutcome> {
        use sqlx::Executor;
        let trimmed = sql.trim().to_uppercase();
        let is_select = trimmed.starts_with("SELECT")
            || trimmed.starts_with("SHOW")
            || trimmed.starts_with("PRAGMA")
            || trimmed.starts_with("EXPLAIN")
            || trimmed.starts_with("WITH");
        if is_select {
            let rows = sqlx::query(sql).fetch_all(&mut *self.tx).await?;
            Ok(crate::db::StatementOutcome {
                rows_affected: None,
                row_count: Some(rows.len()),
            })
        } else {
            let result = self.tx.execute(sqlx::query(sql)).await?;
            Ok(crate::db::StatementOutcome {
                rows_affected: Some(result.rows_affected()),
                row_count: None,
            })
        }
    }

    async fn commit(self: Box<Self>) -> crate::db::AppResult<()> {
        self.tx.commit().await.map_err(|e| {
            crate::error::AppError::Database(format!("Failed to commit script transaction: {}", e))
        })
    }

    async fn rollback(self: Box<Self>) -> crate::db::AppResult<()> {
        self.tx.rollback().await.map_err(|e| {
            crate::error::AppError::Database(format!(
                "Failed to rollback script transaction: {}",
                e
            ))
        })
    }
}

pub struct SqliteScriptTransaction {
    tx: sqlx::Transaction<'static, sqlx::Sqlite>,
}
