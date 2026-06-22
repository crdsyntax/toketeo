use crate::db::DbDriver;
use crate::db::PoolConfig;
use crate::error::{AppError, AppResult};
use crate::models::QueryResult;
use async_trait::async_trait;
use sqlx::{Column, PgPool, Row, postgres::PgPoolOptions};
use std::time::{Duration, Instant};

/// Minimum warm connections kept alive for non-transactional pool.
const POOL_MIN_CONNECTIONS: u32 = 1;
/// Fail fast if a connection cannot be acquired within 5 seconds.
const POOL_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(5);

pub struct PostgresDriver {
    pool: PgPool,
}

impl PostgresDriver {
    pub async fn new(url: &str, transactional: bool, pool_config: Option<PoolConfig>) -> AppResult<Self> {
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
            })
        } else {
            let _ = sqlx::query(query).execute(&self.pool).await?;
            Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: None,
            })
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
        .bind(schema)
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
            "table" => Ok(format!(
                "-- DDL completo para tabla {}.{} no está implementado.\n-- Recomendación: usar pg_dump para obtener el DDL completo.",
                schema, name
            )),
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

// ==================== MÉTODOS AUXILIARES ====================

impl PostgresDriver {
    fn decode_column(&self, row: &sqlx::postgres::PgRow, i: usize) -> serde_json::Value {
        use sqlx::TypeInfo;
        let col = &row.columns()[i];
        let type_name = col.type_info().name();

        match type_name {
            "INT2" | "INT4" | "INT8" | "OID" => row
                .try_get::<i64, _>(i)
                .map(Into::into)
                .unwrap_or(serde_json::Value::Null),
            "FLOAT4" | "FLOAT8" | "NUMERIC" => row
                .try_get::<f64, _>(i)
                .map(Into::into)
                .unwrap_or(serde_json::Value::Null),
            "BOOL" => row
                .try_get::<bool, _>(i)
                .map(Into::into)
                .unwrap_or(serde_json::Value::Null),
            "JSON" | "JSONB" => row
                .try_get::<serde_json::Value, _>(i)
                .unwrap_or(serde_json::Value::Null),
            _ => row
                .try_get::<String, _>(i)
                .map(Into::into)
                .unwrap_or(serde_json::Value::Null),
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
                    .last()
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
}
