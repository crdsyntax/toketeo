use crate::db::common::{
    decode_bool, decode_bytes, decode_date, decode_datetime, decode_datetime_utc, decode_decimal,
    decode_f64, decode_i64, decode_string, decode_time, decode_u16, decode_u32, decode_u64,
    decode_u8, Decoder,
};
use crate::db::CapabilityProvider;
use crate::db::DataReader;
use crate::db::DataWriter;
use crate::db::DbDriver;
use crate::db::PoolConfig;
use crate::db::UpsertResult;
use crate::error::{AppError, AppResult};
use crate::models::sync::{DriverCapabilities, UpsertStrategy};
use crate::models::QueryResult;
use async_trait::async_trait;
use serde_json::Value;
use sqlx::{mysql::MySqlPoolOptions, mysql::MySqlRow, Column, MySqlPool, Row, TypeInfo};
use std::time::{Duration, Instant};

pub(crate) fn quote_mysql(id: &str) -> String {
    format!("`{}`", id.replace('`', "``"))
}

/// Convert a JSON cell value into a MySQL-bindable string.
/// Handles MongoDB Extended JSON shapes produced by bson_to_json:
///   {"$oid":"hex"} → hex string
///   {"$date":{"$numberLong":"ms"}} → ISO-8601 datetime
/// Arrays/objects → JSON text for JSON/TEXT columns.
fn json_value_to_mysql_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(i.to_string())
            } else if let Some(u) = n.as_u64() {
                Some(u.to_string())
            } else if let Some(f) = n.as_f64() {
                Some(f.to_string())
            } else {
                Some(n.to_string())
            }
        }
        Value::Bool(b) => Some(if *b { "1".into() } else { "0".into() }),
        Value::Array(_) | Value::Object(_) => {
            // Extended JSON ObjectId
            if let Some(oid) = value.get("$oid").and_then(|v| v.as_str()) {
                return Some(oid.to_string());
            }
            // Extended JSON DateTime: {"$date":{"$numberLong":"..."}} or {"$date":"..."}
            if let Some(date_val) = value.get("$date") {
                if let Some(ms_str) = date_val
                    .get("$numberLong")
                    .and_then(|v| v.as_str())
                    .or_else(|| date_val.as_str())
                {
                    if let Ok(ms) = ms_str.parse::<i64>() {
                        if let Some(dt) = chrono::DateTime::from_timestamp_millis(ms) {
                            return Some(dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string());
                        }
                    }
                    return Some(ms_str.to_string());
                }
                if let Some(ms) = date_val
                    .get("$numberLong")
                    .and_then(|v| v.as_i64())
                    .or_else(|| date_val.as_i64())
                {
                    if let Some(dt) = chrono::DateTime::from_timestamp_millis(ms) {
                        return Some(dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string());
                    }
                }
            }
            // Generic object/array → JSON string
            Some(value.to_string())
        }
    }
}

/// Minimum warm connections kept alive for non-transactional pool.
const POOL_MIN_CONNECTIONS: u32 = 1;
/// Fail fast if a connection cannot be acquired within 5 seconds.
const POOL_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(15);

pub struct MySqlDriver {
    pool: MySqlPool,
}

impl MySqlDriver {
    pub async fn new(
        url: &str,
        transactional: bool,
        pool_config: Option<PoolConfig>,
    ) -> AppResult<Self> {
        let pool = (if transactional {
            // Transactional sessions use a single connection to guarantee
            // that START TRANSACTION / COMMIT / ROLLBACK operate on the same connection.
            MySqlPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(POOL_ACQUIRE_TIMEOUT)
                .connect(url)
                .await
        } else {
            let config = pool_config.unwrap_or_default();
            let acquire_timeout = config.acquire_timeout.min(POOL_ACQUIRE_TIMEOUT);
            let mut opts = MySqlPoolOptions::new()
                .min_connections(POOL_MIN_CONNECTIONS)
                .max_connections(config.max_connections)
                .acquire_timeout(acquire_timeout);
            if let Some(idle) = config.idle_timeout {
                opts = opts.idle_timeout(idle);
            }
            if let Some(lifetime) = config.max_lifetime {
                opts = opts.max_lifetime(lifetime);
            }
            opts.connect(url).await
        })
        .map_err(|e| {
            let app_err: AppError = e.into();
            match app_err {
                AppError::Auth(msg) => AppError::Auth(format!("MySQL Auth Failed: {}", msg)),
                _ => AppError::Connection(format!("Could not connect to MySQL: {}", app_err)),
            }
        })?;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DbDriver for MySqlDriver {
    fn db_type(&self) -> crate::db::DbType {
        crate::db::DbType::Mysql
    }

    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        let start = Instant::now();
        let trimmed_query = query.trim();
        let is_select = trimmed_query.to_uppercase().starts_with("SELECT")
            || trimmed_query.to_uppercase().starts_with("SHOW")
            || trimmed_query.to_uppercase().starts_with("DESCRIBE")
            || trimmed_query.to_uppercase().starts_with("EXPLAIN")
            || trimmed_query.to_uppercase().starts_with("CALL");

        if is_select {
            let rows = sqlx::query(query).fetch_all(&self.pool).await?;

            if rows.is_empty() {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                });
            }

            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            let mut result_rows = Vec::new();
            for row in rows {
                let mut row_map = serde_json::Map::new();
                for (i, col_name) in columns.iter().enumerate() {
                    let value = self.decode_column(&row, i);
                    row_map.insert(col_name.clone(), value);
                }
                result_rows.push(serde_json::Value::Object(row_map));
            }

            Ok(QueryResult {
                columns,
                rows: result_rows,
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: None,
                rows_affected: 0,
            })
        } else {
            let result = if trimmed_query.contains(';') {
                sqlx::raw_sql(query).execute(&self.pool).await
            } else {
                sqlx::query(query).execute(&self.pool).await
            };

            match result {
                Ok(res) => {
                    let rows_affected = res.rows_affected();
                    Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected,
                    })
                }
                Err(e) => Err(e.into()),
            }
        }
    }

    async fn execute_with_schema(&self, query: &str, schema: &str) -> AppResult<QueryResult> {
        let mut pool_conn = self.pool.acquire().await.map_err(|e| {
            AppError::Connection(format!("Failed to acquire MySQL connection: {}", e))
        })?;
        use sqlx::Executor;
        let conn: &mut sqlx::mysql::MySqlConnection = &mut pool_conn;

        conn.execute(sqlx::raw_sql(&format!("USE `{}`", schema)))
            .await
            .map_err(|e| {
                AppError::Database(format!("Failed to select database '{}': {}", schema, e))
            })?;

        let start = Instant::now();
        let trimmed_query = query.trim();
        let is_select = trimmed_query.to_uppercase().starts_with("SELECT")
            || trimmed_query.to_uppercase().starts_with("SHOW")
            || trimmed_query.to_uppercase().starts_with("DESCRIBE")
            || trimmed_query.to_uppercase().starts_with("EXPLAIN")
            || trimmed_query.to_uppercase().starts_with("CALL");

        if is_select {
            let rows = sqlx::query(query).fetch_all(&mut *conn).await?;

            if rows.is_empty() {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                });
            }

            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            let mut result_rows = Vec::new();
            for row in rows {
                let mut row_map = serde_json::Map::new();
                for (i, col_name) in columns.iter().enumerate() {
                    let value = self.decode_column(&row, i);
                    row_map.insert(col_name.clone(), value);
                }
                result_rows.push(serde_json::Value::Object(row_map));
            }

            Ok(QueryResult {
                columns,
                rows: result_rows,
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: None,
                rows_affected: 0,
            })
        } else {
            let result = if trimmed_query.contains(';') {
                conn.execute(sqlx::raw_sql(query)).await
            } else {
                conn.execute(sqlx::query(query)).await
            };

            match result {
                Ok(res) => {
                    let rows_affected = res.rows_affected();
                    Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected,
                    })
                }
                Err(e) => Err(e.into()),
            }
        }
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        let rows = sqlx::query("SELECT schema_name FROM information_schema.schemata")
            .fetch_all(&self.pool)
            .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        let rows = sqlx::query("SHOW DATABASES").fetch_all(&self.pool).await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_tables(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = if let Some(schema_name) = schema {
            sqlx
                ::query(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'"
                )
                .bind(schema_name)
                .fetch_all(&self.pool).await?
        } else {
            sqlx::query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
                .fetch_all(&self.pool)
                .await?
        };

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_views(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = if let Some(schema_name) = schema {
            sqlx
                ::query(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'VIEW'"
                )
                .bind(schema_name)
                .fetch_all(&self.pool).await?
        } else {
            sqlx::query("SHOW FULL TABLES WHERE Table_type = 'VIEW'")
                .fetch_all(&self.pool)
                .await?
        };
        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_procedures(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = sqlx
            ::query(
                "SELECT routine_name FROM information_schema.routines WHERE routine_type = 'PROCEDURE' AND routine_schema = IFNULL(?, DATABASE()) ORDER BY routine_name"
            )
            .bind(schema)
            .fetch_all(&self.pool).await?;
        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_triggers(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = sqlx
            ::query(
                "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = IFNULL(?, DATABASE()) ORDER BY trigger_name"
            )
            .bind(schema)
            .fetch_all(&self.pool).await?;
        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_functions(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = sqlx
            ::query(
                "SELECT routine_name FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = IFNULL(?, DATABASE()) ORDER BY routine_name"
            )
            .bind(schema)
            .fetch_all(&self.pool).await?;
        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let query = "SELECT 
            column_name as name,
            column_type as type,
            is_nullable as isNullable,
            column_key as keyType,
            column_default as defaultValue,
            extra as extra
            FROM information_schema.columns 
            WHERE table_name = ? AND table_schema = IFNULL(?, DATABASE())
            ORDER BY ordinal_position";

        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema)
            .fetch_all(&self.pool)
            .await?;

        let mut cols = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            let name: String = row.try_get("name").unwrap_or_default();
            let col_type: String = row.try_get("type").unwrap_or_default();
            let nullable_raw: String = row.try_get("isNullable").unwrap_or_default();
            let key_raw: String = row.try_get("keyType").unwrap_or_default();
            let default_val: Option<String> = row.try_get("defaultValue").ok().flatten();
            let extra: Option<String> = row.try_get("extra").ok().flatten();

            map.insert("name".into(), name.into());
            map.insert("type".into(), col_type.into());
            map.insert("isNullable".into(), (nullable_raw == "YES").into());
            map.insert("isPrimaryKey".into(), (key_raw == "PRI").into());
            map.insert("defaultValue".into(), default_val.into());
            map.insert("comment".into(), serde_json::Value::Null);
            if let Some(ref e) = extra {
                if e.contains("auto_increment") {
                    map.insert("isAutoIncrement".into(), true.into());
                }
            }
            cols.push(serde_json::Value::Object(map));
        }
        Ok(cols)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let query = "SELECT 
            index_name as name, 
            column_name as column_name, 
            non_unique = 0 as isUnique, 
            index_type as type
            FROM information_schema.statistics 
            WHERE table_name = ? AND table_schema = IFNULL(?, DATABASE())";

        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema)
            .fetch_all(&self.pool)
            .await?;

        let mut idxs = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("column".into(), row.get::<String, _>("column_name").into());

            let is_unique = row.try_get::<i64, _>("isUnique").unwrap_or(0) == 1
                || row.try_get::<i32, _>("isUnique").unwrap_or(0) == 1;
            map.insert("isUnique".into(), is_unique.into());

            map.insert("type".into(), row.get::<String, _>("type").into());
            idxs.push(serde_json::Value::Object(map));
        }
        Ok(idxs)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let query =
            "SELECT 
            constraint_name as constraintName, 
            column_name as columnName, 
            referenced_table_name as referencedTable, 
            referenced_column_name as referencedColumn
            FROM information_schema.key_column_usage 
            WHERE table_name = ? AND table_schema = IFNULL(?, DATABASE()) AND referenced_table_name IS NOT NULL";

        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema)
            .fetch_all(&self.pool)
            .await?;

        let mut fks = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert(
                "constraintName".into(),
                row.get::<String, _>("constraintName").into(),
            );
            map.insert(
                "columnName".into(),
                row.get::<String, _>("columnName").into(),
            );
            map.insert(
                "referencedTable".into(),
                row.get::<String, _>("referencedTable").into(),
            );
            map.insert(
                "referencedColumn".into(),
                row.get::<String, _>("referencedColumn").into(),
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
        let query = r#"
            SELECT
                kcu.constraint_name    AS constraintName,
                kcu.table_name         AS referencingTable,
                kcu.column_name        AS columnName,
                kcu.referenced_table_name AS referencedTable,
                kcu.referenced_column_name AS referencedColumn
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc
              ON kcu.constraint_name = tc.constraint_name
             AND kcu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND kcu.referenced_table_name = ?
              AND kcu.referenced_table_schema = IFNULL(?, DATABASE())
            ORDER BY kcu.table_name, kcu.ordinal_position
        "#;

        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema)
            .fetch_all(&self.pool)
            .await?;

        let mut fks = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert(
                "constraintName".into(),
                row.get::<String, _>("constraintName").into(),
            );
            map.insert(
                "columnName".into(),
                row.get::<String, _>("columnName").into(),
            );
            map.insert(
                "referencingTable".into(),
                row.get::<String, _>("referencingTable").into(),
            );
            map.insert(
                "referencingColumn".into(),
                row.get::<String, _>("referencedColumn").into(),
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
        let query = "SELECT 
            constraint_name as name, 
            constraint_type as type
            FROM information_schema.table_constraints 
            WHERE table_name = ? AND table_schema = IFNULL(?, DATABASE())";

        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema)
            .fetch_all(&self.pool)
            .await?;

        let mut cs = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("type".into(), row.get::<String, _>("type").into());
            cs.push(serde_json::Value::Object(map));
        }
        Ok(cs)
    }

    async fn fetch_ddl(
        &self,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<String> {
        let full_name = if let Some(schema_name) = schema.as_ref() {
            format!("`{}`.`{}`", schema_name, name)
        } else {
            format!("`{}`", name)
        };

        let obj_type_lower = object_type.to_lowercase();
        let query = match obj_type_lower.as_str() {
            "table" => format!("SHOW CREATE TABLE {}", full_name),
            "view" => format!("SHOW CREATE VIEW {}", full_name),
            "procedure" => format!("SHOW CREATE PROCEDURE {}", full_name),
            "function" => format!("SHOW CREATE FUNCTION {}", full_name),
            "trigger" => format!("SHOW CREATE TRIGGER {}", full_name),
            _ => {
                return Err(AppError::Internal("Unsupported object type for DDL".into()));
            }
        };
        let ddl_base = match sqlx::query(&query).fetch_one(&self.pool).await {
            Ok(row) => {
                let mut found_ddl = None;
                let columns = row.columns();
                for col in columns {
                    let col_name = col.name().to_lowercase();
                    if col_name.contains("create") || col_name.contains("statement") {
                        if let Ok(val) = row.try_get::<String, _>(col.ordinal()) {
                            if !val.is_empty() {
                                found_ddl = Some(val);
                                break;
                            }
                        }
                    }
                }

                if found_ddl.is_none() {
                    found_ddl = match obj_type_lower.as_str() {
                        "procedure" | "function" | "trigger" => row
                            .try_get::<String, _>(2)
                            .or_else(|_| row.try_get::<String, _>(1))
                            .ok(),
                        _ => row.try_get::<String, _>(1).ok(),
                    };
                }

                found_ddl.ok_or_else(|| {
                    AppError::Internal("Could not find DDL column in result".into())
                })?
            }
            Err(e) => {
                // Fallback for procedures/functions/views via information_schema
                if obj_type_lower == "procedure" || obj_type_lower == "function" {
                    let routine_type = obj_type_lower.to_uppercase();
                    let fallback_query =
                        "SELECT routine_definition FROM information_schema.routines WHERE routine_name = ? AND routine_schema = IFNULL(?, DATABASE()) AND routine_type = ?";
                    let res = sqlx::query(fallback_query)
                        .bind(name)
                        .bind(schema)
                        .bind(routine_type)
                        .fetch_one(&self.pool)
                        .await;

                    if let Ok(r) = res {
                        let def: Option<String> = r.try_get(0).ok();
                        if let Some(d) = def {
                            d
                        } else {
                            return Err(e.into());
                        }
                    } else {
                        return Err(e.into());
                    }
                } else {
                    return Err(e.into());
                }
            }
        };

        // Prepend DROP IF EXISTS for routines and triggers
        match obj_type_lower.as_str() {
            "procedure" => Ok(format!(
                "DROP PROCEDURE IF EXISTS {};\n\n{}",
                full_name, ddl_base
            )),
            "function" => Ok(format!(
                "DROP FUNCTION IF EXISTS {};\n\n{}",
                full_name, ddl_base
            )),
            "trigger" => Ok(format!(
                "DROP TRIGGER IF EXISTS {};\n\n{}",
                full_name, ddl_base
            )),
            _ => Ok(ddl_base),
        }
    }

    async fn fetch_parameters(
        &self,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let routine_type = match object_type.to_lowercase().as_str() {
            "procedure" => "PROCEDURE",
            "function" => "FUNCTION",
            _ => "",
        };

        let query = "SELECT 
            parameter_name as name, 
            dtd_identifier as type, 
            parameter_mode as mode
            FROM information_schema.parameters 
            WHERE specific_name = ? AND specific_schema = IFNULL(?, DATABASE())
            AND (ROUTINE_TYPE = ? OR ? = '')
            ORDER BY ordinal_position";

        let rows = sqlx::query(query)
            .bind(name)
            .bind(schema)
            .bind(routine_type)
            .bind(routine_type)
            .fetch_all(&self.pool)
            .await?;

        let mut params = Vec::new();
        for row in rows {
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
                    .unwrap_or_else(|| "IN".to_string())
                    .into(),
            );
            params.push(serde_json::Value::Object(map));
        }
        Ok(params)
    }

    async fn close(&self) -> AppResult<()> {
        self.pool.close().await;
        Ok(())
    }
}

#[async_trait]
impl DataReader for MySqlDriver {
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
            format!("{}.{}", quote_mysql(s), quote_mysql(table))
        } else {
            quote_mysql(table)
        };

        let select_clause = if columns.is_empty() {
            "*".to_string()
        } else {
            let cols: Vec<String> = columns.iter().map(|c| quote_mysql(c)).collect();
            cols.join(", ")
        };

        let mut query = if last_key.is_some() {
            format!(
                "SELECT {} FROM {} WHERE {} > ? ORDER BY {} ASC",
                select_clause,
                table_ref,
                quote_mysql(pk_column),
                quote_mysql(pk_column)
            )
        } else {
            format!(
                "SELECT {} FROM {} ORDER BY {} ASC",
                select_clause,
                table_ref,
                quote_mysql(pk_column)
            )
        };

        query = format!("{} LIMIT ?", query);

        let mut qb = sqlx::query(&query);

        if let Some(ref key) = last_key {
            qb = match key {
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        qb.bind(i)
                    } else if let Some(f) = n.as_f64() {
                        qb.bind(f)
                    } else {
                        qb.bind(n.to_string())
                    }
                }
                Value::String(s) => qb.bind(s.clone()),
                Value::Bool(b) => qb.bind(*b),
                other => qb.bind(other.to_string()),
            };
        }

        qb = qb.bind(batch_size as i64);

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
            format!("{}.{}", quote_mysql(s), quote_mysql(table))
        } else {
            quote_mysql(table)
        };

        let row = sqlx::query(&format!("SELECT COUNT(*) as cnt FROM {}", table_ref))
            .fetch_one(&self.pool)
            .await?;

        Ok(row.get::<i64, _>("cnt") as u64)
    }
}

#[async_trait]
impl DataWriter for MySqlDriver {
    async fn upsert_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        _primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<UpsertResult> {
        if rows.is_empty() || columns.is_empty() {
            return Ok(UpsertResult::default());
        }

        let table_ref = if let Some(s) = schema {
            format!("{}.{}", quote_mysql(s), quote_mysql(table))
        } else {
            quote_mysql(table)
        };

        let quoted_cols: Vec<String> = columns.iter().map(|c| quote_mysql(c)).collect();
        let cols_str = quoted_cols.join(", ");
        let placeholders: Vec<String> = (0..columns.len()).map(|_| "?".to_string()).collect();
        let row_placeholders: Vec<String> = (0..rows.len())
            .map(|_| format!("({})", placeholders.join(", ")))
            .collect();
        let values_str = row_placeholders.join(", ");

        let update_parts: Vec<String> = quoted_cols
            .iter()
            .map(|c| format!("{} = VALUES({})", c, c))
            .collect();
        let update_str = update_parts.join(", ");

        let upsert_query = format!(
            "INSERT INTO {} ({}) VALUES {} ON DUPLICATE KEY UPDATE {}",
            table_ref, cols_str, values_str, update_str
        );

        let ignore_query = format!(
            "INSERT IGNORE INTO {} ({}) VALUES {}",
            table_ref, cols_str, values_str
        );

        // Collect bind values once so we can reuse for fallback.
        // Flatten Extended JSON from MongoDB (ObjectId/DateTime) into scalar strings.
        let bind_values: Vec<Option<String>> = rows
            .iter()
            .flat_map(|row| {
                columns
                    .iter()
                    .map(move |col| row.get(col).map(json_value_to_mysql_string).unwrap_or(None))
            })
            .collect();

        // Helper to bind all values onto a query builder
        fn bind_all<'a>(
            mut qb: sqlx::query::Query<'a, sqlx::MySql, sqlx::mysql::MySqlArguments>,
            bind_values: &'a [Option<String>],
        ) -> sqlx::query::Query<'a, sqlx::MySql, sqlx::mysql::MySqlArguments> {
            for val in bind_values {
                qb = qb.bind(val.as_deref());
            }
            qb
        }

        // Try ON DUPLICATE KEY UPDATE first
        let qb = sqlx::query(&upsert_query);
        let qb = bind_all(qb, &bind_values);

        match qb.execute(&self.pool).await {
            Ok(result) => Ok(UpsertResult {
                affected: result.rows_affected(),
                skipped: 0,
            }),
            Err(upsert_err) => {
                tracing::warn!(
                    "[mysql] upsert_rows ON DUPLICATE KEY failed for {}: {} — retrying with INSERT IGNORE",
                    table_ref,
                    upsert_err,
                );
                // Fallback to INSERT IGNORE (skips rows that violate constraints)
                let qb2 = sqlx::query(&ignore_query);
                let qb2 = bind_all(qb2, &bind_values);
                match qb2.execute(&self.pool).await {
                    Ok(result) => {
                        let inserted = result.rows_affected();
                        tracing::warn!(
                            "[mysql] INSERT IGNORE succeeded for {}: {} rows inserted (some may have been skipped)",
                            table_ref,
                            inserted,
                        );
                        Ok(UpsertResult {
                            affected: inserted,
                            skipped: 0,
                        })
                    }
                    Err(ignore_err) => {
                        // Both strategies failed — propagate the original error
                        tracing::error!(
                            "[mysql] Both upsert strategies failed for {}: upsert={}, ignore={}",
                            table_ref,
                            upsert_err,
                            ignore_err,
                        );
                        Err(upsert_err.into())
                    }
                }
            }
        }
    }
}

impl MySqlDriver {
    fn decode_column(&self, row: &MySqlRow, index: usize) -> Value {
        const DECODERS: &[Decoder] = &[
            decode_string,
            decode_i64,
            decode_u8,
            decode_u16,
            decode_u32,
            decode_u64,
            decode_decimal,
            decode_f64,
            decode_bool,
            decode_datetime_utc,
            decode_datetime,
            decode_date,
            decode_time,
            decode_bytes,
        ];

        for decoder in DECODERS {
            if let Some(value) = decoder(row, index) {
                return value;
            }
        }

        let column = &row.columns()[index];

        Value::from(format!("Un-decodable: {}", column.type_info().name()))
    }
}

impl CapabilityProvider for MySqlDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_transactions: true,
            supports_savepoints: true,
            supports_upsert: true,
            upsert_strategy: Some(UpsertStrategy::OnDuplicateKey),
            supports_keyset_pagination: true,
            supports_streaming: true,
            supports_json: true,
            supports_arrays: false,
            supports_returning: false,
            max_batch_size: 1000,
        }
    }
}
