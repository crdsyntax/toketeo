use crate::db::DbDriver;
use crate::db::PoolConfig;
use crate::db::UpsertResult;
use crate::db::{CapabilityProvider, DataReader, DataWriter};
use crate::error::{AppError, AppResult};
use crate::models::sync::{DriverCapabilities, UpsertStrategy};
use crate::models::QueryResult;
use async_trait::async_trait;
use sqlx::{postgres::PgPoolOptions, Column, PgPool, Row};
use std::time::{Duration, Instant};

pub(crate) fn quote_pg(id: &str) -> String {
    format!("\"{}\"", id.replace('"', "\"\""))
}

/// Minimum warm connections kept alive for non-transactional pool.
const POOL_MIN_CONNECTIONS: u32 = 1;
/// Fail fast if a connection cannot be acquired within 5 seconds.
const POOL_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(30);

pub struct PostgresDriver {
    pool: PgPool,
}

impl PostgresDriver {
    pub async fn new(
        url: &str,
        transactional: bool,
        pool_config: Option<PoolConfig>,
    ) -> AppResult<Self> {
        let pool = if transactional {
            // Transactional sessions use a single connection to guarantee
            // that BEGIN / COMMIT / ROLLBACK operate on the same connection.
            PgPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(POOL_ACQUIRE_TIMEOUT)
                .connect(url)
                .await
        } else {
            let config = pool_config.unwrap_or_default();
            let mut opts = PgPoolOptions::new()
                .min_connections(POOL_MIN_CONNECTIONS)
                .max_connections(config.max_connections)
                .acquire_timeout(config.acquire_timeout);
            if let Some(idle) = config.idle_timeout {
                opts = opts.idle_timeout(idle);
            }
            if let Some(lifetime) = config.max_lifetime {
                opts = opts.max_lifetime(lifetime);
            }
            opts.connect(url).await
        }
        .map_err(|e| {
            let app_err: AppError = e.into();
            match app_err {
                AppError::Auth(msg) => AppError::Auth(format!("PostgreSQL Auth Failed: {}", msg)),
                _ => AppError::Connection(format!("Could not connect to PostgreSQL: {}", app_err)),
            }
        })?;

        Ok(Self { pool })
    }
}

#[async_trait]
impl DbDriver for PostgresDriver {
    fn db_type(&self) -> crate::db::DbType {
        crate::db::DbType::Postgres
    }

    async fn begin_script(
        &self,
        schema: Option<&str>,
    ) -> crate::db::AppResult<crate::db::BoxScriptTransaction> {
        let conn = self.pool.acquire().await.map_err(|e| {
            AppError::Connection(format!("Failed to acquire Postgres connection: {}", e))
        })?;
        let mut tx = sqlx::Transaction::begin(conn, None).await.map_err(|e| {
            AppError::Database(format!("Failed to begin script transaction: {}", e))
        })?;
        if let Some(schema) = schema.filter(|s| !s.is_empty()) {
            sqlx::query(&format!(
                "SET search_path TO \"{}\"",
                schema.replace('"', "\"\"")
            ))
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set search_path to '{}': {}", schema, e))
            })?;
        }
        Ok(Box::new(PostgresScriptTransaction { tx }))
    }

    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        let start = Instant::now();
        let trimmed = query.trim().to_uppercase();

        let is_select = trimmed.starts_with("SELECT")
            || trimmed.starts_with("SHOW")
            || trimmed.starts_with("DESCRIBE")
            || trimmed.starts_with("EXPLAIN")
            || trimmed.starts_with("WITH");

        if is_select {
            let rows = sqlx::query(query).fetch_all(&self.pool).await?;

            if rows.is_empty() {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,

                    next_cursor: None,

                    graph: None,
                });
            }

            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            let result_rows = rows
                .into_iter()
                .map(|row| {
                    let mut row_map = serde_json::Map::new();
                    for (i, col_name) in columns.iter().enumerate() {
                        let value = self.decode_column(&row, i);
                        row_map.insert(col_name.clone(), value);
                    }
                    serde_json::Value::Object(row_map)
                })
                .collect();

            // Detectar claves primarias
            let primary_keys = if let Some(table) = self.extract_table_name(query) {
                self.get_primary_keys(&table)
                    .await
                    .ok()
                    .filter(|keys| !keys.is_empty())
            } else {
                None
            };

            Ok(QueryResult {
                columns,
                rows: result_rows,
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys,
                rows_affected: 0,

                next_cursor: None,

                graph: None,
            })
        } else {
            let result = sqlx::raw_sql(query).execute(&self.pool).await?;
            let rows_affected = result.rows_affected();
            Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: None,
                rows_affected,
                next_cursor: None,
                graph: None,
            })
        }
    }

    async fn execute_with_params(
        &self,
        query: &str,
        params: &[Option<String>],
    ) -> AppResult<QueryResult> {
        let start = Instant::now();
        let trimmed = query.trim().to_uppercase();

        let is_select = trimmed.starts_with("SELECT")
            || trimmed.starts_with("SHOW")
            || trimmed.starts_with("DESCRIBE")
            || trimmed.starts_with("EXPLAIN")
            || trimmed.starts_with("WITH");

        let mut qb = sqlx::query(query);
        for param in params {
            qb = qb.bind(param.as_deref());
        }

        if is_select {
            let rows = qb.fetch_all(&self.pool).await?;

            if rows.is_empty() {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                });
            }

            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            let result_rows = rows
                .into_iter()
                .map(|row| {
                    let mut row_map = serde_json::Map::new();
                    for (i, col_name) in columns.iter().enumerate() {
                        let value = self.decode_column(&row, i);
                        row_map.insert(col_name.clone(), value);
                    }
                    serde_json::Value::Object(row_map)
                })
                .collect();

            Ok(QueryResult {
                columns,
                rows: result_rows,
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: None,
                rows_affected: 0,
                next_cursor: None,
                graph: None,
            })
        } else {
            let result = qb.execute(&self.pool).await?;
            let rows_affected = result.rows_affected();
            Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: None,
                rows_affected,
                next_cursor: None,
                graph: None,
            })
        }
    }

    async fn execute_with_schema(&self, query: &str, schema: &str) -> AppResult<QueryResult> {
        let mut pool_conn = self.pool.acquire().await.map_err(|e| {
            AppError::Connection(format!("Failed to acquire Postgres connection: {}", e))
        })?;
        use sqlx::Executor;
        let conn: &mut sqlx::postgres::PgConnection = &mut pool_conn;

        // Guardar el search_path anterior para restaurarlo antes de devolver
        // la conexión al pool (evita contaminar el estado de otras consultas).
        let previous_path: Option<String> = sqlx::query("SELECT current_setting('search_path')")
            .fetch_one(&mut *conn)
            .await
            .ok()
            .and_then(|r| r.try_get::<String, _>(0).ok());

        let set_result = conn
            .execute(sqlx::query(&format!(
                "SET search_path TO \"{}\"",
                schema.replace('"', "\"\"")
            )))
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to set search_path to '{}': {}", schema, e))
            });

        if let Err(e) = set_result {
            Self::restore_search_path(conn, previous_path.as_deref()).await;
            return Err(e);
        }

        let start = Instant::now();
        let trimmed = query.trim().to_uppercase();

        let is_select = trimmed.starts_with("SELECT")
            || trimmed.starts_with("SHOW")
            || trimmed.starts_with("DESCRIBE")
            || trimmed.starts_with("EXPLAIN")
            || trimmed.starts_with("WITH");

        let result = if is_select {
            let rows = sqlx::query(query).fetch_all(&mut *conn).await;
            match rows {
                Ok(rows) => {
                    if rows.is_empty() {
                        Some(Ok(QueryResult {
                            columns: vec![],
                            rows: vec![],
                            execution_time_ms: start.elapsed().as_millis() as u64,
                            primary_keys: None,
                            rows_affected: 0,
                            next_cursor: None,
                            graph: None,
                        }))
                    } else {
                        let columns: Vec<String> = rows[0]
                            .columns()
                            .iter()
                            .map(|col| col.name().to_string())
                            .collect();

                        let result_rows = rows
                            .into_iter()
                            .map(|row| {
                                let mut row_map = serde_json::Map::new();
                                for (i, col_name) in columns.iter().enumerate() {
                                    let value = self.decode_column(&row, i);
                                    row_map.insert(col_name.clone(), value);
                                }
                                serde_json::Value::Object(row_map)
                            })
                            .collect();

                        Some(Ok(QueryResult {
                            columns,
                            rows: result_rows,
                            execution_time_ms: start.elapsed().as_millis() as u64,
                            primary_keys: None,
                            rows_affected: 0,
                            next_cursor: None,
                            graph: None,
                        }))
                    }
                }
                Err(e) => Some(Err(e)),
            }
        } else {
            let result = conn.execute(sqlx::raw_sql(query)).await;
            match result {
                Ok(res) => {
                    let rows_affected = res.rows_affected();
                    Some(Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected,
                        next_cursor: None,
                        graph: None,
                    }))
                }
                Err(e) => Some(Err(e)),
            }
        };

        Self::restore_search_path(conn, previous_path.as_deref()).await;

        match result {
            Some(Ok(qr)) => Ok(qr),
            Some(Err(e)) => Err(e.into()),
            None => Err(AppError::Internal(
                "execute_with_schema produced no result".into(),
            )),
        }
    }

    // ==================== METADATOS ====================

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        let rows = sqlx::query(
            r#"
            SELECT datname 
            FROM pg_database 
            WHERE datistemplate = false 
            ORDER BY datname
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        let rows = sqlx::query(
            r#"
            SELECT n.nspname 
            FROM pg_namespace n
            WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
              AND n.nspname NOT LIKE 'pg_temp_%'
              AND n.nspname NOT LIKE 'pg_toast_temp_%'
              AND n.nspname NOT LIKE 'pg_stat%'
            ORDER BY n.nspname
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_tables(
        &self,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());

        let mut query = "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'".to_string();

        if let Some(f) = filter {
            query.push_str(&format!(
                " AND table_name LIKE '%{}%'",
                f.replace("'", "''")
            ));
        }

        query.push_str(" ORDER BY table_name");

        let rows = sqlx::query(&query)
            .bind(schema)
            .fetch_all(&self.pool)
            .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_views(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            r#"
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1 AND table_type = 'VIEW'
            ORDER BY table_name
            "#,
        )
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_functions(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            r#"
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_schema = $1 AND routine_type = 'FUNCTION'
            ORDER BY routine_name
            "#,
        )
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_procedures(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            r#"
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_schema = $1 AND routine_type = 'PROCEDURE'
            ORDER BY routine_name
            "#,
        )
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_triggers(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            r#"
            SELECT trigger_name 
            FROM information_schema.triggers 
            WHERE trigger_schema = $1
            ORDER BY trigger_name
            "#,
        )
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());

        let rows = sqlx::query(
            r#"
            SELECT 
                c.column_name as name,
                c.data_type as type,
                c.is_nullable = 'YES' as is_nullable,
                c.column_default as default_value,
                col_description(
                    (quote_ident($2) || '.' || quote_ident($1))::regclass::oid, 
                    c.ordinal_position
                ) as comment,
                EXISTS (
                    SELECT 1 FROM pg_constraint pgc
                    JOIN pg_attribute pga ON pga.attrelid = pgc.conrelid 
                                         AND pga.attnum = ANY(pgc.conkey)
                    WHERE pgc.contype = 'p' 
                      AND pgc.conrelid = (
                          SELECT oid FROM pg_class 
                          WHERE relname = $1 
                            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
                      )
                      AND pga.attname = c.column_name
                ) as is_pk
            FROM information_schema.columns c
            WHERE c.table_name = $1 
              AND c.table_schema = $2
            ORDER BY c.ordinal_position
            "#,
        )
        .bind(table)
        .bind(&schema)
        .fetch_all(&self.pool)
        .await?;

        let mut cols = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("type".into(), row.get::<String, _>("type").into());
            map.insert(
                "isNullable".into(),
                row.get::<bool, _>("is_nullable").into(),
            );
            map.insert("isPrimaryKey".into(), row.get::<bool, _>("is_pk").into());
            map.insert(
                "defaultValue".into(),
                row.get::<Option<String>, _>("default_value").into(),
            );
            map.insert(
                "comment".into(),
                row.get::<Option<String>, _>("comment").into(),
            );
            cols.push(serde_json::Value::Object(map));
        }
        Ok(cols)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());

        let rows = sqlx::query(
            r#"
            SELECT 
                i.relname as name,
                a.attname as column,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE t.relkind = 'r'
              AND n.nspname = $2
              AND t.relname = $1
            ORDER BY i.relname, a.attnum
            "#,
        )
        .bind(table)
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        let mut indexes = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("column".into(), row.get::<String, _>("column").into());
            map.insert("isUnique".into(), row.get::<bool, _>("is_unique").into());
            map.insert("isPrimary".into(), row.get::<bool, _>("is_primary").into());
            map.insert("type".into(), "btree".into());
            indexes.push(serde_json::Value::Object(map));
        }
        Ok(indexes)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());

        let rows = sqlx::query(
            r#"
            SELECT 
                tc.constraint_name as constraint_name,
                kcu.column_name as column_name,
                ccu.table_name as referenced_table,
                ccu.column_name as referenced_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name 
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu 
              ON ccu.constraint_name = tc.constraint_name 
             AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_name = $1 
              AND tc.table_schema = $2
            "#,
        )
        .bind(table)
        .bind(&schema)
        .fetch_all(&self.pool)
        .await?;

        let mut fks = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert(
                "constraintName".into(),
                row.get::<String, _>("constraint_name").into(),
            );
            map.insert(
                "columnName".into(),
                row.get::<String, _>("column_name").into(),
            );
            map.insert(
                "referencedTable".into(),
                row.get::<String, _>("referenced_table").into(),
            );
            map.insert(
                "referencedColumn".into(),
                row.get::<String, _>("referenced_column").into(),
            );
            fks.push(serde_json::Value::Object(map));
        }
        Ok(fks)
    }

    async fn fetch_referenced_by_keys(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());

        let rows = sqlx::query(
            r#"
            SELECT
                tc.constraint_name AS constraint_name,
                kcu.column_name    AS column_name,
                tc.table_name      AS referencing_table,
                kcu2.column_name   AS referencing_column
            FROM information_schema.referential_constraints rc
            JOIN information_schema.table_constraints tc
              ON rc.constraint_name = tc.constraint_name
             AND rc.constraint_schema = tc.constraint_schema
            JOIN information_schema.key_column_usage kcu
              ON rc.constraint_name = kcu.constraint_name
             AND rc.constraint_schema = kcu.table_schema
            JOIN information_schema.table_constraints tc2
              ON rc.unique_constraint_name = tc2.constraint_name
             AND rc.unique_constraint_schema = tc2.table_schema
            JOIN information_schema.key_column_usage kcu2
              ON tc2.constraint_name = kcu2.constraint_name
             AND tc2.table_schema = kcu2.table_schema
            WHERE tc2.table_name = $1
              AND tc2.table_schema = $2
            ORDER BY tc.table_name, kcu.ordinal_position
            "#,
        )
        .bind(table)
        .bind(&schema)
        .fetch_all(&self.pool)
        .await?;

        let mut fks = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert(
                "constraintName".into(),
                row.get::<String, _>("constraint_name").into(),
            );
            map.insert(
                "columnName".into(),
                row.get::<String, _>("column_name").into(),
            );
            map.insert(
                "referencingTable".into(),
                row.get::<String, _>("referencing_table").into(),
            );
            map.insert(
                "referencingColumn".into(),
                row.get::<String, _>("referencing_column").into(),
            );
            fks.push(serde_json::Value::Object(map));
        }
        Ok(fks)
    }

    async fn fetch_constraints(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());

        let rows = sqlx::query(
            r#"
            SELECT constraint_name as name, constraint_type as type
            FROM information_schema.table_constraints 
            WHERE table_name = $1 AND table_schema = $2
            ORDER BY constraint_name
            "#,
        )
        .bind(table)
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        let mut constraints = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("type".into(), row.get::<String, _>("type").into());
            constraints.push(serde_json::Value::Object(map));
        }
        Ok(constraints)
    }

    async fn fetch_ddl(
        &self,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<String> {
        let schema = schema.unwrap_or_else(|| "public".to_string());
        let obj_type = object_type.to_lowercase();

        match obj_type.as_str() {
            "view" => self.fetch_view_ddl(name, &schema).await,
            "function" | "procedure" => self.fetch_function_ddl(name, &schema).await,
            "table" => self.fetch_table_ddl(name, &schema).await,
            _ => Ok(format!("-- DDL no implementado para tipo: {}", object_type)),
        }
    }

    async fn fetch_parameters(
        &self,
        name: &str,
        _object_type: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema = schema.unwrap_or_else(|| "public".to_string());

        let rows = sqlx::query(
            r#"
            SELECT parameter_name as name, 
                   data_type as type, 
                   parameter_mode as mode
            FROM information_schema.parameters 
            WHERE specific_schema = $2 
              AND specific_name LIKE $1 || '%'
            ORDER BY ordinal_position
            "#,
        )
        .bind(name)
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        let params = rows
            .into_iter()
            .map(|row| {
                let mut map = serde_json::Map::new();
                map.insert(
                    "name".into(),
                    row.get::<Option<String>, _>("name")
                        .unwrap_or_default()
                        .into(),
                );
                map.insert("type".into(), row.get::<String, _>("type").into());
                map.insert(
                    "mode".into(),
                    row.get::<Option<String>, _>("mode")
                        .unwrap_or_default()
                        .into(),
                );
                serde_json::Value::Object(map)
            })
            .collect();

        Ok(params)
    }

    async fn close(&self) -> AppResult<()> {
        self.pool.close().await;
        Ok(())
    }
}

#[async_trait]
impl DataReader for PostgresDriver {
    async fn fetch_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>> {
        let table_ref = if let Some(s) = schema {
            format!("{}.{}", quote_pg(s), quote_pg(table))
        } else {
            quote_pg(table)
        };

        let select_clause = if columns.is_empty() {
            "*".to_string()
        } else {
            let cols: Vec<String> = columns.iter().map(|c| quote_pg(c)).collect();
            cols.join(", ")
        };

        let (query, has_filter) = if last_key.is_some() {
            (
                format!(
                    "SELECT {} FROM {} WHERE {} > $1 ORDER BY {} ASC LIMIT $2",
                    select_clause,
                    table_ref,
                    quote_pg(pk_column),
                    quote_pg(pk_column)
                ),
                true,
            )
        } else {
            (
                format!(
                    "SELECT {} FROM {} ORDER BY {} ASC LIMIT $1",
                    select_clause,
                    table_ref,
                    quote_pg(pk_column)
                ),
                false,
            )
        };

        let mut qb = sqlx::query(&query);

        if has_filter {
            if let Some(ref key) = last_key {
                qb = match key {
                    serde_json::Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            qb.bind(i)
                        } else if let Some(f) = n.as_f64() {
                            qb.bind(f)
                        } else {
                            qb.bind(n.to_string())
                        }
                    }
                    serde_json::Value::String(s) => qb.bind(s.clone()),
                    serde_json::Value::Bool(b) => qb.bind(*b),
                    other => qb.bind(other.to_string()),
                };
            }
            qb = qb.bind(batch_size as i64);
        } else {
            qb = qb.bind(batch_size as i64);
        }

        let rows = qb.fetch_all(&self.pool).await?;
        let mut result = Vec::new();

        for row in rows {
            let mut map = serde_json::Map::new();
            if columns.is_empty() {
                for (i, col) in row.columns().iter().enumerate() {
                    let value = self.decode_column(&row, i);
                    map.insert(col.name().to_string(), value);
                }
            } else {
                for (i, col_name) in columns.iter().enumerate() {
                    let value = self.decode_column(&row, i);
                    map.insert(col_name.clone(), value);
                }
            }
            result.push(serde_json::Value::Object(map));
        }

        Ok(result)
    }

    async fn count_rows(&self, table: &str, schema: Option<&str>) -> AppResult<u64> {
        let table_ref = if let Some(s) = schema {
            format!("{}.{}", quote_pg(s), quote_pg(table))
        } else {
            quote_pg(table)
        };

        let row = sqlx::query(&format!("SELECT COUNT(*) as cnt FROM {}", table_ref))
            .fetch_one(&self.pool)
            .await?;

        Ok(row.get::<i64, _>("cnt") as u64)
    }
}

#[async_trait]
impl DataWriter for PostgresDriver {
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
            format!("{}.{}", quote_pg(s), quote_pg(table))
        } else {
            quote_pg(table)
        };

        let target_schema = schema.unwrap_or("public");
        let col_types = self.fetch_column_types(table, target_schema).await;

        let quoted_cols: Vec<String> = columns.iter().map(|c| quote_pg(c)).collect();
        let cols_str = quoted_cols.join(", ");

        // Build placeholders with explicit ::type casts so PostgreSQL
        // handles type conversion server-side. This avoids the need for
        // Rust-side type matching and works for ALL PostgreSQL types.
        let mut param_idx = 1;
        let mut all_placeholders = Vec::new();
        for _ in 0..rows.len() {
            let row_placeholders: Vec<String> = columns
                .iter()
                .map(|col| {
                    let p = format!("${}", param_idx);
                    param_idx += 1;
                    let cast = col_types
                        .get(col.as_str())
                        .and_then(|t| Self::pg_type_cast(t))
                        .map(|c| format!("::{}", c))
                        .unwrap_or_default();
                    format!("{}{}", p, cast)
                })
                .collect();
            all_placeholders.push(format!("({})", row_placeholders.join(", ")));
        }
        let values_str = all_placeholders.join(", ");

        let pk_clause: Vec<String> = primary_keys.iter().map(|k| quote_pg(k)).collect();
        let update_parts: Vec<String> = quoted_cols
            .iter()
            .map(|c| format!("{} = EXCLUDED.{}", c, c))
            .collect();
        let update_str = update_parts.join(", ");

        let query = format!(
            "INSERT INTO {} ({}) VALUES {} ON CONFLICT ({}) DO UPDATE SET {}",
            table_ref,
            cols_str,
            values_str,
            pk_clause.join(", "),
            update_str,
        );

        let mut qb = sqlx::query(&query);

        for row in rows {
            for col in columns {
                qb = Self::bind_json_value(qb, row.get(col).cloned());
            }
        }

        let result = qb.execute(&self.pool).await?;
        Ok(UpsertResult {
            affected: result.rows_affected() as u64,
            skipped: 0,
        })
    }
}

// ==================== MÉTODOS AUXILIARES ====================

impl PostgresDriver {
    async fn restore_search_path(
        conn: &mut sqlx::postgres::PgConnection,
        previous_path: Option<&str>,
    ) {
        use sqlx::Executor;
        let restore = previous_path
            .map(|p| format!("SET search_path TO {}", p))
            .unwrap_or_else(|| "SET search_path TO DEFAULT".to_string());
        let _ = conn.execute(sqlx::raw_sql(&restore)).await;
    }

    fn decode_column(&self, row: &sqlx::postgres::PgRow, i: usize) -> serde_json::Value {
        use sqlx::TypeInfo;
        let col = &row.columns()[i];
        let type_name = col.type_info().name();

        match type_name {
            "INT2" => row
                .try_get::<Option<i16>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "INT4" | "OID" => row
                .try_get::<Option<i32>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "INT8" => row
                .try_get::<Option<i64>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::Number(v.into()))
                .unwrap_or(serde_json::Value::Null),
            "FLOAT4" | "FLOAT8" | "NUMERIC" => row
                .try_get::<Option<f64>, _>(i)
                .ok()
                .flatten()
                .map(|v| {
                    serde_json::Value::Number(
                        serde_json::Number::from_f64(v)
                            .unwrap_or_else(|| serde_json::Number::from(0)),
                    )
                })
                .unwrap_or(serde_json::Value::Null),
            "BOOL" => row
                .try_get::<Option<bool>, _>(i)
                .ok()
                .flatten()
                .map(Into::into)
                .unwrap_or(serde_json::Value::Null),
            "JSON" | "JSONB" => row
                .try_get::<Option<serde_json::Value>, _>(i)
                .ok()
                .flatten()
                .map(sanitize_json_value)
                .unwrap_or(serde_json::Value::Null),
            "TIMESTAMPTZ" => row
                .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::String(v.to_rfc3339()))
                .unwrap_or(serde_json::Value::Null),
            "TIMESTAMP" => row
                .try_get::<Option<chrono::NaiveDateTime>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::String(v.format("%Y-%m-%dT%H:%M:%S%.f").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "DATE" => row
                .try_get::<Option<chrono::NaiveDate>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::String(v.format("%Y-%m-%d").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "TIME" | "TIMETZ" => row
                .try_get::<Option<chrono::NaiveTime>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::String(v.format("%H:%M:%S%.f").to_string()))
                .unwrap_or(serde_json::Value::Null),
            "UUID" => row
                .try_get::<Option<uuid::Uuid>, _>(i)
                .ok()
                .flatten()
                .map(|v| serde_json::Value::String(v.to_string()))
                .unwrap_or(serde_json::Value::Null),
            _ => row
                .try_get::<Option<String>, _>(i)
                .ok()
                .flatten()
                .map(|s| serde_json::Value::String(sanitize_string(&s)))
                .unwrap_or(serde_json::Value::Null),
        }
    }

    /// Query the target table's column types from information_schema.
    /// Returns a map of column_name -> data_type (lowercase).
    async fn fetch_column_types(
        &self,
        table: &str,
        schema: &str,
    ) -> std::collections::HashMap<String, String> {
        let rows = sqlx::query(
            r#"SELECT column_name, data_type
               FROM information_schema.columns
               WHERE table_name = $1 AND table_schema = $2"#,
        )
        .bind(table)
        .bind(schema)
        .fetch_all(&self.pool)
        .await;

        match rows {
            Ok(rows) => rows
                .into_iter()
                .filter_map(|r| {
                    let name: String = r.try_get("column_name").ok()?;
                    let ty: String = r.try_get("data_type").ok()?;
                    Some((name, ty))
                })
                .collect(),
            Err(_) => std::collections::HashMap::new(),
        }
    }

    /// Map information_schema.columns.data_type to a PostgreSQL type cast name.
    fn pg_type_cast(data_type: &str) -> Option<&'static str> {
        match data_type {
            "smallint" => Some("smallint"),
            "integer" => Some("integer"),
            "bigint" | "oid" => Some("bigint"),
            "real" => Some("real"),
            "double precision" => Some("double precision"),
            "numeric" | "decimal" | "money" => Some("numeric"),
            "boolean" => Some("boolean"),
            "json" => Some("json"),
            "jsonb" => Some("jsonb"),
            "timestamp with time zone" => Some("timestamptz"),
            "timestamp without time zone" => Some("timestamp"),
            "date" => Some("date"),
            "time with time zone" => Some("timetz"),
            "time without time zone" => Some("time"),
            "uuid" => Some("uuid"),
            "bytea" => Some("bytea"),
            "character varying" | "varchar" | "character" | "char" | "text" => Some("text"),
            _ => None,
        }
    }

    /// Bind a JSON value as a query parameter. Since SQL placeholders use
    /// explicit ::type casts, we only need to bind the raw value — PostgreSQL
    /// handles the type conversion.
    /// Null bytes (0x00) are stripped from strings to avoid UTF8 encoding errors.
    fn bind_json_value<'a>(
        qb: sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>,
        val: Option<serde_json::Value>,
    ) -> sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments> {
        match val {
            None | Some(serde_json::Value::Null) => qb.bind(None::<String>),
            Some(serde_json::Value::String(s)) => {
                let clean = sanitize_string(&s);
                qb.bind(clean)
            }
            Some(serde_json::Value::Number(n)) => {
                if let Some(i) = n.as_i64() {
                    qb.bind(i)
                } else if let Some(f) = n.as_f64() {
                    qb.bind(f)
                } else {
                    qb.bind(n.to_string())
                }
            }
            Some(serde_json::Value::Bool(b)) => qb.bind(b),
            Some(v) => {
                // Array, Object, or any other — sanitize null bytes then serialize to JSON string
                let clean = sanitize_json_value(v);
                let s = serde_json::to_string(&clean).unwrap_or_default();
                qb.bind(s)
            }
        }
    }

    fn extract_table_name(&self, query: &str) -> Option<String> {
        let upper = query.trim().to_uppercase();
        if !upper.starts_with("SELECT") || !upper.contains(" FROM ") {
            return None;
        }

        let parts: Vec<&str> = upper.split_whitespace().collect();
        if let Some(pos) = parts.iter().position(|&p| p == "FROM") {
            if pos + 1 < parts.len() {
                let raw = parts[pos + 1];
                let table = raw
                    .split('.')
                    .next_back()
                    .unwrap_or(raw)
                    .replace(|c: char| !c.is_alphanumeric() && c != '_', "");
                return Some(table);
            }
        }
        None
    }

    async fn get_primary_keys(&self, table: &str) -> AppResult<Vec<String>> {
        let rows = sqlx::query(
            r#"
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = $1::regclass AND i.indisprimary
            "#,
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_view_ddl(&self, name: &str, schema: &str) -> AppResult<String> {
        let row = sqlx::query(
            "SELECT pg_get_viewdef((quote_ident($2) || '.' || quote_ident($1))::regclass, true)",
        )
        .bind(name)
        .bind(schema)
        .fetch_one(&self.pool)
        .await?;

        let def: Option<String> = row.try_get(0)?;
        match def {
            Some(d) if !d.trim().is_empty() => Ok(format!(
                "CREATE OR REPLACE VIEW \"{}\".\"{}\" AS\n{}",
                schema.replace('"', "\"\""),
                name.replace('"', "\"\""),
                d
            )),
            _ => Ok(format!(
                "-- No se pudo obtener definición de la vista {}.{}",
                schema, name
            )),
        }
    }

    async fn fetch_function_ddl(&self, name: &str, schema: &str) -> AppResult<String> {
        let row = sqlx::query(
            r#"
            SELECT pg_get_functiondef(p.oid)
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = $2 AND p.proname = $1
            LIMIT 1
            "#,
        )
        .bind(name)
        .bind(schema)
        .fetch_one(&self.pool)
        .await?;

        let def: Option<String> = row.try_get(0)?;
        Ok(def.unwrap_or_default())
    }

    async fn fetch_table_ddl(&self, name: &str, schema: &str) -> AppResult<String> {
        let columns = sqlx::query(
            r#"
            SELECT 
                c.column_name,
                c.data_type,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.is_nullable,
                c.column_default,
                c.udt_name
            FROM information_schema.columns c
            WHERE c.table_name = $1 AND c.table_schema = $2
            ORDER BY c.ordinal_position
            "#,
        )
        .bind(name)
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        if columns.is_empty() {
            return Ok(format!("-- Table {}.{} not found", schema, name));
        }

        let pk_rows = sqlx::query(
            r#"
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = (
                SELECT oid FROM pg_class 
                WHERE relname = $1 
                AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
            )
            AND i.indisprimary
            ORDER BY array_position(i.indkey, a.attnum)
            "#,
        )
        .bind(name)
        .bind(schema)
        .fetch_all(&self.pool)
        .await?;

        let pk_cols: Vec<String> = pk_rows.iter().filter_map(|r| r.try_get(0).ok()).collect();

        let mut col_defs = Vec::new();
        for row in &columns {
            let col_name: String = row.try_get("column_name")?;
            let data_type: String = row.try_get("data_type")?;
            let udt_name: Option<String> = row.try_get("udt_name").ok();
            let char_max_len: Option<i32> = row.try_get("character_maximum_length").ok();
            let num_precision: Option<i32> = row.try_get("numeric_precision").ok();
            let num_scale: Option<i32> = row.try_get("numeric_scale").ok();
            let is_nullable: String = row.try_get("is_nullable")?;
            let default_val: Option<String> = row.try_get("column_default").ok();

            let pg_type = match data_type.as_str() {
                "character varying" | "varchar" => {
                    if let Some(max_len) = char_max_len {
                        format!("varchar({})", max_len)
                    } else {
                        "varchar".to_string()
                    }
                }
                "character" | "char" => {
                    if let Some(max_len) = char_max_len {
                        format!("char({})", max_len)
                    } else {
                        "char".to_string()
                    }
                }
                "numeric" | "decimal" => {
                    if let (Some(p), Some(s)) = (num_precision, num_scale) {
                        format!("numeric({}, {})", p, s)
                    } else if let Some(p) = num_precision {
                        format!("numeric({})", p)
                    } else {
                        "numeric".to_string()
                    }
                }
                "user-defined" => {
                    // User-defined types (enums etc.) won't exist on target — map to text
                    if let Some(ref udt) = udt_name {
                        if udt.starts_with('_') {
                            "text[]".to_string()
                        } else {
                            "text".to_string()
                        }
                    } else {
                        "text".to_string()
                    }
                }
                "ARRAY" => "text[]".to_string(),
                _ => data_type.clone(),
            };

            let mut def = format!("    \"{}\" {}", col_name.replace('"', "\"\""), pg_type);

            if is_nullable == "NO" {
                def.push_str(" NOT NULL");
            }

            if let Some(ref d) = default_val {
                if is_safe_default(d) {
                    def.push_str(&format!(" DEFAULT {}", d));
                }
            }

            col_defs.push(def);
        }

        if !pk_cols.is_empty() {
            let pkquoted: Vec<String> = pk_cols
                .iter()
                .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
                .collect();
            col_defs.push(format!("    PRIMARY KEY ({})", pkquoted.join(", ")));
        }

        let schema_quoted = schema.replace('"', "\"\"");
        let name_quoted = name.replace('"', "\"\"");

        Ok(format!(
            "CREATE TABLE IF NOT EXISTS \"{}\".\"{}\" (\n{}\n);",
            schema_quoted,
            name_quoted,
            col_defs.join(",\n")
        ))
    }
}

/// Remove null bytes (0x00) from a string.
/// PostgreSQL rejects strings containing null bytes when the database encoding is UTF8.
fn sanitize_string(s: &str) -> String {
    if s.contains('\0') {
        s.replace('\0', "")
    } else {
        s.to_string()
    }
}

/// Recursively strip null bytes (0x00) from all string values and keys
/// inside a serde_json::Value tree. This prevents null bytes from reaching
/// PostgreSQL where they cause UTF-8 encoding errors, especially in JSONB columns.
fn sanitize_json_value(val: serde_json::Value) -> serde_json::Value {
    match val {
        serde_json::Value::String(s) => serde_json::Value::String(sanitize_string(&s)),
        serde_json::Value::Object(map) => {
            let sanitized: serde_json::Map<String, serde_json::Value> = map
                .into_iter()
                .map(|(k, v)| (sanitize_string(&k), sanitize_json_value(v)))
                .collect();
            serde_json::Value::Object(sanitized)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(sanitize_json_value).collect())
        }
        other => other,
    }
}

/// Check if a column_default value is safe to include in cross-database DDL.
/// Unsafe defaults reference source-specific state (sequences, USER keyword, etc.)
/// that doesn't exist on the target database.
fn is_safe_default(default: &str) -> bool {
    let lower = default.to_lowercase().trim().to_string();

    // String literals: 'value' or 'value'::type
    if default.trim().starts_with('\'') {
        return true;
    }
    // Numeric literals
    if default.trim().parse::<f64>().is_ok() {
        return true;
    }
    // Boolean
    if lower == "true" || lower == "false" {
        return true;
    }
    // NULL
    if lower == "null" {
        return true;
    }
    // now() and time functions
    if lower == "now()"
        || lower == "current_timestamp"
        || lower == "current_date"
        || lower == "current_time"
    {
        return true;
    }
    // gen_random_uuid()
    if lower == "gen_random_uuid()" {
        return true;
    }
    // Expression with cast: ('value')::type
    if default.trim().starts_with('(') && default.contains("::") {
        return true;
    }

    // Everything else is unsafe: USER, CURRENT_USER, nextval(), etc.
    false
}

impl CapabilityProvider for PostgresDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_transactions: true,
            supports_savepoints: true,
            supports_upsert: true,
            upsert_strategy: Some(UpsertStrategy::OnConflict),
            supports_keyset_pagination: true,
            supports_streaming: true,
            supports_json: true,
            supports_arrays: true,
            supports_returning: true,
            max_batch_size: 1000,
        }
    }
}

/// Sesión transaccional de script sobre PostgreSQL.
/// Al dropear sin commit/rollback, sqlx revierte la transacción automáticamente.
pub struct PostgresScriptTransaction {
    tx: sqlx::Transaction<'static, sqlx::Postgres>,
}

#[async_trait]
impl crate::db::ScriptTransaction for PostgresScriptTransaction {
    async fn execute_statement(
        &mut self,
        sql: &str,
    ) -> crate::db::AppResult<crate::db::StatementOutcome> {
        use sqlx::Executor;
        let trimmed = sql.trim().to_uppercase();
        let is_select = trimmed.starts_with("SELECT")
            || trimmed.starts_with("SHOW")
            || trimmed.starts_with("DESCRIBE")
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
        self.tx
            .commit()
            .await
            .map_err(|e| AppError::Database(format!("Failed to commit script transaction: {}", e)))
    }

    async fn rollback(self: Box<Self>) -> crate::db::AppResult<()> {
        self.tx.rollback().await.map_err(|e| {
            AppError::Database(format!("Failed to rollback script transaction: {}", e))
        })
    }
}
