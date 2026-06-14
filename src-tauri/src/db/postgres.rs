use async_trait::async_trait;
use sqlx::{PgPool, Row, Column};
use std::time::Instant;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::QueryResult;

pub struct PostgresDriver {
    pool: PgPool,
}

impl PostgresDriver {
    pub async fn new(url: &str) -> AppResult<Self> {
        let pool = PgPool::connect(url).await?;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DbDriver for PostgresDriver {
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

        // Try to identify PKs
        let mut primary_keys = None;
        if let Some(table_name) = self.extract_table_name(query) {
            let pk_query = r#"
                SELECT a.attname
                FROM   pg_index i
                JOIN   pg_attribute a ON a.attrelid = i.indrelid
                                     AND a.attnum = ANY(i.indkey)
                WHERE  i.indrelid = $1::regclass
                AND    i.indisprimary;
            "#;
            let pk_rows = sqlx::query(pk_query)
                .bind(&table_name)
                .fetch_all(&self.pool)
                .await
                .ok();

            if let Some(pks) = pk_rows {
                let keys: Vec<String> = pks.iter().map(|r| r.get(0)).collect();
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
        let rows = sqlx::query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_tables(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'"
        )
        .bind(schema_name)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_views(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'VIEW'"
        )
        .bind(schema_name)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_procedures(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'PROCEDURE'"
        )
        .bind(schema_name)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_triggers(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = $1"
        )
        .bind(schema_name)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_functions(&self, schema: Option<String>) -> AppResult<Vec<String>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let rows = sqlx::query(
            "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION'"
        )
        .bind(schema_name)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn fetch_columns(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let query = r#"
            SELECT 
                column_name as name, 
                data_type as type, 
                is_nullable = 'YES' as is_nullable,
                EXISTS (
                    SELECT 1 FROM information_schema.key_column_usage kcu
                    JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
                    WHERE kcu.table_name = $1 AND kcu.table_schema = $2 AND kcu.column_name = cols.column_name AND tc.constraint_type = 'PRIMARY KEY'
                ) as is_pk,
                column_default as default_value
            FROM information_schema.columns cols
            WHERE table_name = $1 AND table_schema = $2
            ORDER BY ordinal_position
        "#;
        
        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema_name)
            .fetch_all(&self.pool)
            .await?;

        let mut cols = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("type".into(), row.get::<String, _>("type").into());
            map.insert("isNullable".into(), row.get::<bool, _>("is_nullable").into());
            map.insert("isPrimaryKey".into(), row.get::<bool, _>("is_pk").into());
            map.insert("defaultValue".into(), row.get::<Option<String>, _>("default_value").into());
            map.insert("comment".into(), serde_json::Value::Null); // TODO: fetch column comments
            cols.push(serde_json::Value::Object(map));
        }
        Ok(cols)
    }

    async fn fetch_indexes(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let query = r#"
            SELECT
                i.relname as name,
                a.attname as column,
                ix.indisunique as is_unique
            FROM
                pg_class t,
                pg_class i,
                pg_index ix,
                pg_attribute a,
                pg_namespace n
            WHERE
                t.oid = ix.indrelid
                AND i.oid = ix.indexrelid
                AND a.attrelid = t.oid
                AND a.attnum = ANY(ix.indkey)
                AND t.relkind = 'r'
                AND n.oid = t.relnamespace
                AND n.nspname = $2
                AND t.relname = $1
        "#;
        
        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema_name)
            .fetch_all(&self.pool)
            .await?;

        let mut idxs = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<String, _>("name").into());
            map.insert("column".into(), row.get::<String, _>("column").into());
            map.insert("isUnique".into(), row.get::<bool, _>("is_unique").into());
            map.insert("type".into(), "btree".into()); // Default for Postgres
            idxs.push(serde_json::Value::Object(map));
        }
        Ok(idxs)
    }

    async fn fetch_foreign_keys(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let query = r#"
            SELECT
                tc.constraint_name as constraint_name,
                kcu.column_name as column_name,
                ccu.table_name AS referenced_table,
                ccu.column_name AS referenced_column
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = $2
        "#;
        
        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema_name)
            .fetch_all(&self.pool)
            .await?;

        let mut fks = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("constraintName".into(), row.get::<String, _>("constraint_name").into());
            map.insert("columnName".into(), row.get::<String, _>("column_name").into());
            map.insert("referencedTable".into(), row.get::<String, _>("referenced_table").into());
            map.insert("referencedColumn".into(), row.get::<String, _>("referenced_column").into());
            fks.push(serde_json::Value::Object(map));
        }
        Ok(fks)
    }

    async fn fetch_constraints(&self, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let query = "SELECT constraint_name as name, constraint_type as type 
                    FROM information_schema.table_constraints 
                    WHERE table_name = $1 AND table_schema = $2";
        
        let rows = sqlx::query(query)
            .bind(table)
            .bind(schema_name)
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

    async fn fetch_ddl(&self, name: &str, object_type: &str, schema: Option<String>) -> AppResult<String> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        // Postgres doesn't have a simple SHOW CREATE TABLE. We'd need to query pg_catalog.
        // For now, return a placeholder or a simple query.
        match object_type.to_lowercase().as_str() {
            "view" => {
                let row = sqlx::query("SELECT view_definition FROM information_schema.views WHERE table_name = $1 AND table_schema = $2")
                    .bind(name)
                    .bind(schema_name)
                    .fetch_one(&self.pool)
                    .await?;
                Ok(row.get(0))
            },
            "procedure" | "function" => {
                let row = sqlx::query("SELECT routine_definition FROM information_schema.routines WHERE routine_name = $1 AND routine_schema = $2")
                    .bind(name)
                    .bind(schema_name)
                    .fetch_one(&self.pool)
                    .await?;
                Ok(row.get(0))
            },
            _ => Ok(format!("-- DDL for {} {} not implemented for Postgres yet", object_type, name)),
        }
    }

    async fn fetch_parameters(&self, name: &str, _object_type: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let schema_name = schema.unwrap_or_else(|| "public".to_string());
        let query = "SELECT parameter_name as name, data_type as type, parameter_mode as mode 
                    FROM information_schema.parameters 
                    WHERE specific_name = $1 AND specific_schema = $2
                    ORDER BY ordinal_position";
        
        let rows = sqlx::query(query)
            .bind(name)
            .bind(schema_name)
            .fetch_all(&self.pool)
            .await?;

        let mut params = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), row.get::<Option<String>, _>("name").unwrap_or_default().into());
            map.insert("type".into(), row.get::<String, _>("type").into());
            map.insert("mode".into(), row.get::<String, _>("mode").into());
            params.push(serde_json::Value::Object(map));
        }
        Ok(params)
    }

    async fn switch_schema(&self, schema: &str) -> AppResult<()> {
        let query = format!("SET search_path TO \"{}\"", schema.replace('"', "\"\""));
        sqlx::query(&query).execute(&self.pool).await?;
        Ok(())
    }

    async fn close(&self) -> AppResult<()> {
        self.pool.close().await;
        Ok(())
    }
}

impl PostgresDriver {
    fn decode_column(&self, row: &sqlx::postgres::PgRow, i: usize) -> serde_json::Value {
        use sqlx::TypeInfo;

        let col = &row.columns()[i];
        let type_name = col.type_info().name();

        match type_name {
            "INT2" | "INT4" | "INT8" | "OID" => {
                if let Ok(val) = row.try_get::<i64, _>(i) {
                    return serde_json::Value::from(val);
                }
            }
            "FLOAT4" | "FLOAT8" | "NUMERIC" => {
                if let Ok(val) = row.try_get::<f64, _>(i) {
                    return serde_json::Value::from(val);
                }
            }
            "BOOL" => {
                if let Ok(val) = row.try_get::<bool, _>(i) {
                    return serde_json::Value::from(val);
                }
            }
            "JSON" | "JSONB" => {
                if let Ok(val) = row.try_get::<serde_json::Value, _>(i) {
                    return val;
                }
            }
            _ => {}
        }

        // Fallback to string
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
                    let table = parts[pos + 1].replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '.', "");
                    return Some(table);
                }
            }
        }
        None
    }
}
