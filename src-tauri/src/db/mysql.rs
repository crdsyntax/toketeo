use async_trait::async_trait;
use sqlx::{MySqlPool, Row, Column};
use std::time::Instant;
use crate::db::DbDriver;
use crate::error::{AppError, AppResult};
use crate::models::QueryResult;

pub struct MySqlDriver {
    pool: MySqlPool,
}

impl MySqlDriver {
    pub async fn new(url: &str) -> AppResult<Self> {
        let pool = MySqlPool::connect(url).await?;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DbDriver for MySqlDriver {
    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        let start = Instant::now();
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

        let mut result_rows = Vec::new();
        for row in rows {
            let mut row_map = serde_json::Map::new();
            for (i, col_name) in columns.iter().enumerate() {
                let value = self.decode_column(&row, i);
                row_map.insert(col_name.clone(), value);
            }
            result_rows.push(serde_json::Value::Object(row_map));
        }

        // Try to identify PKs for simple SELECT * FROM table queries
        let mut primary_keys = None;
        if let Some(table_name) = self.extract_table_name(query) {
             let pk_rows = sqlx::query("SHOW KEYS FROM ?? WHERE Key_name = 'PRIMARY'")
                .bind(&table_name)
                .fetch_all(&self.pool)
                .await
                .ok();
            
            if let Some(pks) = pk_rows {
                let keys: Vec<String> = pks.iter().map(|r| r.get::<String, _>("Column_name")).collect();
                if !keys.is_empty() {
                    primary_keys = Some(keys);
                }
            }
        }

        Ok(QueryResult {
            columns,
            rows: result_rows,
            execution_time_ms: start.elapsed().as_millis() as u64,
            primary_keys,
        })
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        let rows = sqlx::query("SHOW DATABASES")
            .fetch_all(&self.pool)
            .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_tables(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let rows = if let Some(schema_name) = schema {
            sqlx::query("SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'")
                .bind(schema_name)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
                .fetch_all(&self.pool)
                .await?
        };

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_views(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let rows = if let Some(schema_name) = schema {
            sqlx::query("SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'VIEW'")
                .bind(schema_name)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query("SHOW FULL TABLES WHERE Table_type = 'VIEW'")
                .fetch_all(&self.pool)
                .await?
        };
        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_procedures(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let query = if let Some(schema_name) = schema {
            sqlx::query("SHOW PROCEDURE STATUS WHERE Db = ?").bind(schema_name)
        } else {
            sqlx::query("SHOW PROCEDURE STATUS")
        };
        let rows = query.fetch_all(&self.pool).await?;
        Ok(rows.iter().map(|r| r.get::<String, _>("Name")).collect())
    }

    async fn fetch_triggers(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let query = if let Some(schema_name) = schema {
            sqlx::query("SHOW TRIGGERS FROM ??").bind(schema_name)
        } else {
            sqlx::query("SHOW TRIGGERS")
        };
        let rows = query.fetch_all(&self.pool).await?;
        Ok(rows.iter().map(|r| r.get::<String, _>("Trigger")).collect())
    }

    async fn fetch_functions(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let query = if let Some(schema_name) = schema {
            sqlx::query("SHOW FUNCTION STATUS WHERE Db = ?").bind(schema_name)
        } else {
            sqlx::query("SHOW FUNCTION STATUS")
        };
        let rows = query.fetch_all(&self.pool).await?;
        Ok(rows.iter().map(|r| r.get::<String, _>("Name")).collect())
    }

    async fn fetch_columns(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let query = "SELECT 
            column_name as name, 
            column_type as type, 
            is_nullable = 'YES' as isNullable, 
            column_key = 'PRI' as isPrimaryKey, 
            column_default as defaultValue, 
            column_comment as comment
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
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("type".into(), row.get::<String, _>("type").into());
            
            let is_nullable = row.try_get::<i64, _>("isNullable").unwrap_or(0) == 1 
                           || row.try_get::<i32, _>("isNullable").unwrap_or(0) == 1;
            map.insert("isNullable".into(), is_nullable.into());
            
            let is_pk = row.try_get::<i64, _>("isPrimaryKey").unwrap_or(0) == 1 
                     || row.try_get::<i32, _>("isPrimaryKey").unwrap_or(0) == 1;
            map.insert("isPrimaryKey".into(), is_pk.into());

            map.insert("defaultValue".into(), row.get::<Option<String>, _>("defaultValue").into());
            map.insert("comment".into(), row.get::<Option<String>, _>("comment").into());
            cols.push(serde_json::Value::Object(map));
        }
        Ok(cols)
    }

    async fn fetch_indexes(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
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

    async fn fetch_foreign_keys(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let query = "SELECT 
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
            map.insert("constraintName".into(), row.get::<String, _>("constraintName").into());
            map.insert("columnName".into(), row.get::<String, _>("columnName").into());
            map.insert("referencedTable".into(), row.get::<String, _>("referencedTable").into());
            map.insert("referencedColumn".into(), row.get::<String, _>("referencedColumn").into());
            fks.push(serde_json::Value::Object(map));
        }
        Ok(fks)
    }

    async fn fetch_constraints(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
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

    async fn fetch_ddl(&self, name: &str, object_type: &str, _schema: Option<String>) -> AppResult<String> {
        let query = match object_type.to_lowercase().as_str() {
            "table" => format!("SHOW CREATE TABLE `{}`", name),
            "view" => format!("SHOW CREATE VIEW `{}`", name),
            "procedure" => format!("SHOW CREATE PROCEDURE `{}`", name),
            "function" => format!("SHOW CREATE FUNCTION `{}`", name),
            "trigger" => format!("SHOW CREATE TRIGGER `{}`", name),
            _ => return Err(AppError::Internal("Unsupported object type for DDL".into())),
        };
        
        let row = sqlx::query(&query).fetch_one(&self.pool).await?;
        Ok(row.get(1))
    }

    async fn fetch_parameters(&self, name: &str, _object_type: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let query = "SELECT 
            parameter_name as name, 
            dtd_identifier as type, 
            parameter_mode as mode
            FROM information_schema.parameters 
            WHERE specific_name = ? AND specific_schema = IFNULL(?, DATABASE())
            ORDER BY ordinal_position";
        
        let rows = sqlx::query(query)
            .bind(name)
            .bind(schema)
            .fetch_all(&self.pool)
            .await?;

        let mut params = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<Option<String>, _>("name").unwrap_or_default().into());
            map.insert("type".into(), row.get::<String, _>("type").into());
            map.insert("mode".into(), row.get::<Option<String>, _>("mode").unwrap_or_else(|| "IN".to_string()).into());
            params.push(serde_json::Value::Object(map));
        }
        Ok(params)
    }

    async fn switch_schema(&self, schema: &str) -> AppResult<()> {
        let query = format!("USE `{}`", schema.replace('`', "``"));
        sqlx::query(&query).execute(&self.pool).await?;
        Ok(())
    }

    async fn close(&self) -> AppResult<()> {
        self.pool.close().await;
        Ok(())
    }
}

impl MySqlDriver {
    fn decode_column(&self, row: &sqlx::mysql::MySqlRow, i: usize) -> serde_json::Value {
        use sqlx::TypeInfo;

        let col = &row.columns()[i];
        let type_name = col.type_info().name();

        match type_name {
            "TINYINT" | "SMALLINT" | "INT" | "MEDIUMINT" | "BIGINT" | "DECIMAL" => {
                if let Ok(val) = row.try_get::<i64, _>(i) {
                    return serde_json::Value::from(val);
                }
                if let Ok(val) = row.try_get::<u64, _>(i) {
                    return serde_json::Value::from(val);
                }
            }
            "FLOAT" | "DOUBLE" => {
                if let Ok(val) = row.try_get::<f64, _>(i) {
                    return serde_json::Value::from(val);
                }
            }
            "BIT" | "BOOLEAN" => {
                if let Ok(val) = row.try_get::<bool, _>(i) {
                    return serde_json::Value::from(val);
                }
            }
            _ => {}
        }

        // Fallback to string for everything else
        if let Ok(val) = row.try_get::<String, _>(i) {
            return serde_json::Value::from(val);
        }

        serde_json::Value::Null
    }

    fn extract_table_name(&self, query: &str) -> Option<String> {
        let query = query.trim().to_uppercase();
        if query.starts_with("SELECT") && query.contains("FROM") {
            let parts: Vec<&str> = query.split_whitespace().collect();
            if let Some(pos) = parts.iter().position(|&p| p == "FROM") {
                if pos + 1 < parts.len() {
                    let table = parts[pos + 1].replace(|c: char| !c.is_alphanumeric() && c != '_', "");
                    return Some(table);
                }
            }
        }
        None
    }
}
