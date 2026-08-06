use crate::error::AppResult;
use async_trait::async_trait;

/// Resultado de un batch de extracción.
pub struct ExtractOutput {
    pub rows: Vec<serde_json::Value>,
    pub next_key: Option<serde_json::Value>,
    pub has_more: bool,
    pub batch_number: u64,
}

/// Estrategia de extracción con paginación.
#[async_trait]
pub trait DataExtractor: Send + Sync {
    async fn extract(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
        batch_number: u64,
    ) -> AppResult<ExtractOutput>;
    async fn count(&self, table: &str, schema: Option<&str>) -> AppResult<u64>;
}

pub use sql_extractor::SqlExtractor;
pub use mongo_extractor::MongoExtractor;

pub mod sql_extractor;
pub mod mongo_extractor;
