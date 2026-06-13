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
                // Aquí simplificamos la conversión a JSON. En una implementación real,
                // deberíamos manejar cada tipo de dato de Postgres correctamente.
                let val: Option<String> = row.try_get(i).ok();
                row_map.insert(col_name.clone(), serde_json::Value::from(val));
            }
            result_rows.push(serde_json::Value::Object(row_map));
        }

        Ok(QueryResult {
            columns,
            rows: result_rows,
            execution_time_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn fetch_tables(&self) -> AppResult<Vec<String>> {
        let rows = sqlx::query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get(0)).collect())
    }

    async fn close(&self) -> AppResult<()> {
        self.pool.close().await;
        Ok(())
    }
}
