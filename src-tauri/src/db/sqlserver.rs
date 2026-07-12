use crate::db::{CapabilityProvider, DataReader, DataWriter, DbDriver, DbType};
use crate::error::{AppError, AppResult};
use crate::models::sync::{DriverCapabilities, UpsertStrategy};
use crate::models::QueryResult;
use async_trait::async_trait;
use futures::TryStreamExt;
use std::sync::Arc;
use std::time::Instant;
use tiberius::{AuthMethod, Client, Config, EncryptionLevel};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use url::Url;

pub(crate) fn quote_ss(id: &str) -> String {
    format!("[{}]", id.replace(']', "]]"))
}

pub struct SqlServerDriver {
    client: Arc<Mutex<Option<Client<Compat<TcpStream>>>>>,
}

impl SqlServerDriver {
    pub async fn new(url: &str) -> AppResult<Self> {
        let config = Self::parse_url(url)?;
        let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| {
            AppError::Connection(format!(
                "Could not reach SQL Server {}: {}",
                config.get_addr(),
                e
            ))
        })?;

        tcp.set_nodelay(true).map_err(|e| {
            AppError::Connection(format!(
                "Failed to set TCP_NODELAY for SQL Server socket: {}",
                e
            ))
        })?;

        let client = Client::connect(config, tcp.compat_write())
            .await
            .map_err(|e| AppError::Connection(format!("Could not connect to SQL Server: {}", e)))?;

        Ok(Self {
            client: Arc::new(Mutex::new(Some(client))),
        })
    }

    fn parse_url(url: &str) -> Result<Config, AppError> {
        let parsed = Url::parse(url)
            .map_err(|e| AppError::Connection(format!("Invalid SQL Server URL: {}", e)))?;

        if parsed.scheme() != "sqlserver" {
            return Err(AppError::Connection(
                "SQL Server URL scheme must be sqlserver".into(),
            ));
        }

        let host = parsed
            .host_str()
            .ok_or_else(|| AppError::Connection("SQL Server URL missing host".into()))?;
        let port = parsed.port().unwrap_or(1433);
        let user = parsed.username();

        if user.is_empty() {
            return Err(AppError::Connection("SQL Server URL missing user".into()));
        }

        let password = parsed.password().unwrap_or("");
        let database = parsed.path().trim_start_matches('/').to_string();

        let mut config = Config::new();
        config.host(host);
        config.port(port);
        config.authentication(AuthMethod::sql_server(user, password));

        if !database.is_empty() {
            config.database(database);
        }

        let encrypt = parsed
            .query_pairs()
            .find(|(k, _)| k == "encrypt")
            .map(|(_, v)| v.to_ascii_lowercase());
        if let Some(value) = encrypt {
            if value == "true" || value == "require" || value == "required" {
                config.encryption(EncryptionLevel::Required);
                config.trust_cert();
            } else {
                config.encryption(EncryptionLevel::NotSupported);
            }
        } else {
            config.encryption(EncryptionLevel::NotSupported);
        }

        Ok(config)
    }

    fn escape_sql(value: &str) -> String {
        value.replace('\'', "''")
    }

    fn decode_column(row: &tiberius::Row, idx: usize) -> serde_json::Value {
        if let Some(value) = row.get::<&str, _>(idx) {
            return serde_json::Value::String(value.to_string());
        }
        if let Some(value) = row.get::<i64, _>(idx) {
            return serde_json::Value::Number(value.into());
        }
        if let Some(value) = row.get::<f64, _>(idx) {
            return serde_json::Number::from_f64(value)
                .map_or(serde_json::Value::Null, serde_json::Value::Number);
        }
        if let Some(value) = row.get::<bool, _>(idx) {
            return serde_json::Value::Bool(value);
        }
        serde_json::Value::Null
    }

    async fn run_query(&self, query: &str) -> AppResult<Vec<serde_json::Value>> {
        let mut guard = self.client.lock().await;
        let client = guard.as_mut().ok_or_else(|| {
            AppError::Internal("SQL Server client is closed".into())
        })?;
        let mut stream = client
            .query(query, &[])
            .await
            .map_err(|e| AppError::Database(format!("SQL Server query failed: {}", e)))?
            .into_row_stream();

        let mut rows = Vec::new();
        while let Some(row) = stream
            .try_next()
            .await
            .map_err(|e| AppError::Database(format!("SQL Server query stream failed: {}", e)))?
        {
            let mut map = serde_json::Map::new();
            for (idx, col) in row.columns().iter().enumerate() {
                map.insert(col.name().to_string(), Self::decode_column(&row, idx));
            }
            rows.push(serde_json::Value::Object(map));
        }

        Ok(rows)
    }

    async fn fetch_table_ddl(&self, name: &str, schema: &str) -> AppResult<String> {
        let col_query = format!(
            "SELECT 
                c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH,
                c.NUMERIC_PRECISION, c.NUMERIC_SCALE, c.IS_NULLABLE,
                c.COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS c
            WHERE c.TABLE_NAME = '{}' AND c.TABLE_SCHEMA = '{}'
            ORDER BY c.ORDINAL_POSITION",
            Self::escape_sql(name),
            Self::escape_sql(schema)
        );

        let columns = self.run_query(&col_query).await?;
        if columns.is_empty() {
            return Ok(format!("-- Table {}.{} not found", schema, name));
        }

        let pk_query = format!(
            "SELECT ccu.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu 
                ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME 
                AND tc.TABLE_SCHEMA = ccu.TABLE_SCHEMA
            WHERE tc.TABLE_NAME = '{}' 
              AND tc.TABLE_SCHEMA = '{}' 
              AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ORDER BY ccu.COLUMN_NAME",
            Self::escape_sql(name),
            Self::escape_sql(schema)
        );

        let pk_rows = self.run_query(&pk_query).await?;
        let pk_cols: Vec<String> = pk_rows.iter()
            .filter_map(|r| r.get("COLUMN_NAME").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect();

        let mut col_defs = Vec::new();
        for row in &columns {
            let col_name = row.get("COLUMN_NAME").and_then(|v| v.as_str()).unwrap_or("");
            let data_type = row.get("DATA_TYPE").and_then(|v| v.as_str()).unwrap_or("");
            let char_max_len = row.get("CHARACTER_MAXIMUM_LENGTH").and_then(|v| v.as_i64());
            let num_prec = row.get("NUMERIC_PRECISION").and_then(|v| v.as_i64());
            let num_scale = row.get("NUMERIC_SCALE").and_then(|v| v.as_i64());
            let is_nullable = row.get("IS_NULLABLE").and_then(|v| v.as_str()).unwrap_or("YES");
            let default_val = row.get("COLUMN_DEFAULT").and_then(|v| v.as_str());

            let sql_type = match data_type {
                "varchar" | "nvarchar" | "varbinary" => {
                    if let Some(max_len) = char_max_len {
                        if max_len == -1 {
                            format!("{}(MAX)", data_type.to_uppercase())
                        } else {
                            format!("{}({})", data_type.to_uppercase(), max_len)
                        }
                    } else {
                        data_type.to_uppercase().to_string()
                    }
                }
                "char" | "nchar" => {
                    if let Some(max_len) = char_max_len {
                        format!("{}({})", data_type.to_uppercase(), max_len)
                    } else {
                        data_type.to_uppercase().to_string()
                    }
                }
                "decimal" | "numeric" => {
                    if let (Some(p), Some(s)) = (num_prec, num_scale) {
                        format!("{}({}, {})", data_type.to_uppercase(), p, s)
                    } else if let Some(p) = num_prec {
                        format!("{}({})", data_type.to_uppercase(), p)
                    } else {
                        data_type.to_uppercase().to_string()
                    }
                }
                _ => data_type.to_uppercase().to_string(),
            };

            let mut def = format!("    [{}] {}", col_name, sql_type);

            if is_nullable == "NO" {
                def.push_str(" NOT NULL");
            }

            if let Some(d) = default_val {
                if !d.is_empty() {
                    def.push_str(&format!(" DEFAULT {}", d));
                }
            }

            col_defs.push(def);
        }

        if !pk_cols.is_empty() {
            let pk_list: Vec<String> = pk_cols.iter().map(|c| format!("[{}]", c)).collect();
            col_defs.push(format!("    PRIMARY KEY ({})", pk_list.join(", ")));
        }

        let schema_quoted = schema.replace(']', "]]");
        let name_quoted = name.replace(']', "]]");

        Ok(format!(
            "CREATE TABLE [{}].[{}] (\n{}\n);",
            schema_quoted, name_quoted, col_defs.join(",\n")
        ))
    }
}

#[async_trait]
impl DbDriver for SqlServerDriver {
    fn db_type(&self) -> DbType {
        DbType::Sqlserver
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
            rows,
            execution_time_ms: start.elapsed().as_millis() as u64,
            primary_keys: None,
            rows_affected: 0,
        })
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        let rows = self
            .run_query("SELECT name FROM sys.schemas ORDER BY name")
            .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        let rows = self.run_query("SELECT name FROM sys.databases").await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_tables(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = '{}' ORDER BY TABLE_NAME",
            Self::escape_sql(&schema_name)
        );
        let rows = self.run_query(&query).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("TABLE_NAME")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_views(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = '{}' ORDER BY TABLE_NAME",
            Self::escape_sql(&schema_name)
        );
        let rows = self.run_query(&query).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("TABLE_NAME")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_procedures(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_SCHEMA = '{}' ORDER BY ROUTINE_NAME",
            Self::escape_sql(&schema_name)
        );
        let rows = self.run_query(&query).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("ROUTINE_NAME")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_triggers(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let rows = self
            .run_query("SELECT name FROM sys.triggers ORDER BY name")
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
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION' AND ROUTINE_SCHEMA = '{}' ORDER BY ROUTINE_NAME",
            Self::escape_sql(&schema_name)
        );
        let rows = self.run_query(&query).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.get("ROUTINE_NAME")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
            })
            .collect())
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT \
                c.COLUMN_NAME AS name, \
                c.DATA_TYPE AS type, \
                CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS isNullable, \
                c.COLUMN_DEFAULT AS defaultValue, \
                c.CHARACTER_MAXIMUM_LENGTH AS maxLength, \
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey \
            FROM INFORMATION_SCHEMA.COLUMNS c \
            LEFT JOIN ( \
                SELECT kcu.COLUMN_NAME \
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc \
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu \
                    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME \
                    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA \
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' \
                    AND tc.TABLE_NAME = '{}' \
                    AND tc.TABLE_SCHEMA = '{}' \
            ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME \
            WHERE c.TABLE_NAME = '{}' AND c.TABLE_SCHEMA = '{}' \
            ORDER BY c.ORDINAL_POSITION",
            Self::escape_sql(table),
            Self::escape_sql(&schema_name),
            Self::escape_sql(table),
            Self::escape_sql(&schema_name)
        );
        self.run_query(&query).await
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT i.name AS name, c.name AS column_name, i.is_unique AS is_unique, i.type_desc AS type FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id JOIN sys.tables t ON i.object_id = t.object_id WHERE t.name = '{}' AND SCHEMA_NAME(t.schema_id) = '{}' ORDER BY i.name",
            Self::escape_sql(table),
            Self::escape_sql(&schema_name)
        );
        self.run_query(&query).await
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT fk.name AS constraintName, tp.name AS tableName, cp.name AS columnName, tr.name AS referencedTableName, cr.name AS referencedColumnName FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id WHERE tp.name = '{}' AND SCHEMA_NAME(tp.schema_id) = '{}' ORDER BY fk.name",
            Self::escape_sql(table),
            Self::escape_sql(&schema_name)
        );
        self.run_query(&query).await
    }

    async fn fetch_constraints(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_NAME = '{}' AND TABLE_SCHEMA = '{}' ORDER BY CONSTRAINT_NAME",
            Self::escape_sql(table),
            Self::escape_sql(&schema_name)
        );
        self.run_query(&query).await
    }

    async fn fetch_ddl(
        &self,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<String> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());

        let obj_type_lower = object_type.to_lowercase();

        if obj_type_lower == "table" {
            return self.fetch_table_ddl(name, &schema_name).await;
        }

        // OBJECT_DEFINITION can be NULL if the user doesn't have permissions or for certain object types.
        // sys.sql_modules is generally more reliable for code-based objects.
        let query = format!(
            "SELECT m.definition FROM sys.sql_modules m JOIN sys.objects o ON m.object_id = o.object_id WHERE o.name = '{}' AND SCHEMA_NAME(o.schema_id) = '{}'",
            Self::escape_sql(name),
            Self::escape_sql(&schema_name)
        );

        let rows = self.run_query(&query).await?;
        if let Some(row) = rows.first() {
            if let Some(def) = row.get("definition").and_then(|v| v.as_str()) {
                return Ok(def.to_string());
            }
        }

        Err(AppError::Internal(format!(
            "Could not retrieve DDL for {} {}.{}",
            object_type, schema_name, name
        )))
    }

    async fn fetch_parameters(
        &self,
        name: &str,
        _object_type: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "dbo".to_string());
        let query = format!(
            "SELECT PARAMETER_NAME AS name, DATA_TYPE AS type, PARAMETER_MODE AS mode FROM INFORMATION_SCHEMA.PARAMETERS WHERE SPECIFIC_NAME = '{}' AND SPECIFIC_SCHEMA = '{}' ORDER BY ORDINAL_POSITION",
            Self::escape_sql(name),
            Self::escape_sql(&schema_name)
        );
        self.run_query(&query).await
    }

    async fn close(&self) -> AppResult<()> {
        let mut guard = self.client.lock().await;
        if let Some(client) = guard.take() {
            client.close().await.map_err(|e| {
                AppError::Internal(format!("SQL Server close error: {}", e))
            })?;
        }
        Ok(())
    }
}

#[async_trait]
impl DataReader for SqlServerDriver {
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
            format!("{}.[{}]", quote_ss(s), quote_ss(table))
        } else {
            quote_ss(table)
        };

        let cols: Vec<String> = columns.iter().map(|c| quote_ss(c)).collect();
        let cols_str = cols.join(", ");

        let query = if let Some(ref key) = last_key {
            let key_str = json_to_ss_string(key);
            format!(
                "SELECT TOP ({}) {} FROM {} WHERE {} > {} ORDER BY {} ASC",
                batch_size,
                cols_str,
                table_ref,
                quote_ss(pk_column),
                key_str,
                quote_ss(pk_column),
            )
        } else {
            format!(
                "SELECT TOP ({}) {} FROM {} ORDER BY {} ASC",
                batch_size, cols_str, table_ref, quote_ss(pk_column),
            )
        };

        self.run_query(&query).await
    }

    async fn count_rows(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> AppResult<u64> {
        let table_ref = if let Some(s) = schema {
            format!("{}.[{}]", quote_ss(s), quote_ss(table))
        } else {
            quote_ss(table)
        };

        let rows = self.run_query(&format!("SELECT COUNT(*) as cnt FROM {}", table_ref)).await?;
        Ok(rows
            .first()
            .and_then(|r| r.get("cnt").and_then(|v| v.as_i64()))
            .unwrap_or(0) as u64)
    }
}

fn json_to_ss_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => {
            if *b { "1".to_string() } else { "0".to_string() }
        }
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

fn json_to_ss_values(row: &serde_json::Value, columns: &[String]) -> String {
    columns
        .iter()
        .map(|col| {
            let value = row.get(col).unwrap_or(&serde_json::Value::Null);
            json_to_ss_string(value)
        })
        .collect::<Vec<_>>()
        .join(", ")
}

#[async_trait]
impl DataWriter for SqlServerDriver {
    async fn upsert_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<u64> {
        if rows.is_empty() || columns.is_empty() {
            return Ok(0);
        }

        let table_ref = if let Some(s) = schema {
            format!("{}.[{}]", quote_ss(s), quote_ss(table))
        } else {
            quote_ss(table)
        };

        let quoted_cols: Vec<String> = columns.iter().map(|c| quote_ss(c)).collect();
        let cols_str = quoted_cols.join(", ");

        let pk_cols: Vec<String> = primary_keys.iter().map(|k| quote_ss(k)).collect();
        let pk_condition = pk_cols
            .iter()
            .map(|pk| {
                format!(
                    "target.{pk} = source.{pk}"
                )
            })
            .collect::<Vec<_>>()
            .join(" AND ");

        let update_set: Vec<String> = quoted_cols
            .iter()
            .map(|c| format!("target.{c} = source.{c}"))
            .collect();
        let update_str = update_set.join(", ");

        let mut total_affected = 0u64;

        for row in rows {
            let values = json_to_ss_values(row, columns);

            let source_cols = quoted_cols.join(", ");

            let query = format!(
                "MERGE {} AS target \
                 USING (VALUES ({values})) AS source ({cols_str}) \
                 ON {pk_condition} \
                 WHEN MATCHED THEN UPDATE SET {update_str} \
                 WHEN NOT MATCHED THEN INSERT ({cols_str}) VALUES ({source_cols});",
                table_ref,
                values = values,
                cols_str = cols_str,
                pk_condition = pk_condition,
                update_str = update_str,
                source_cols = source_cols,
            );

            let mut guard = self.client.lock().await;
            let client = guard.as_mut().ok_or_else(|| {
                AppError::Internal("SQL Server client is closed".into())
            })?;

            let result = client
                .execute(&query, &[])
                .await
                .map_err(|e| AppError::Database(format!("SQL Server upsert failed: {}", e)))?;

            total_affected += result.total();
        }

        Ok(total_affected)
    }
}

impl CapabilityProvider for SqlServerDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_transactions: true,
            supports_savepoints: true,
            supports_upsert: true,
            upsert_strategy: Some(UpsertStrategy::Merge),
            supports_keyset_pagination: true,
            supports_streaming: false,
            supports_json: false,
            supports_arrays: false,
            supports_returning: false,
            max_batch_size: 500,
        }
    }
}
