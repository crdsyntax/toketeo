use crate::db::{CapabilityProvider, DbDriver, DbType};
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

        // Fallback for tables or objects not in sql_modules
        if object_type.to_lowercase() == "table" {
            return Ok(format!(
                "-- DDL for table {}.{} not IMPLEMENTED for SQL Server yet\n-- Use a specialized tool for full table DDL",
                schema_name, name
            ));
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
