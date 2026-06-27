use crate::db::DataReader;
use crate::error::AppResult;
use crate::application::sync::extractors::{DataExtractor, ExtractOutput};

/// Extractor para MongoDB.
///
/// Usa paginación por `_id`:
/// ```js
/// { _id: { $gt: last_id } }
/// ```
pub struct MongoExtractor<'a> {
    reader: &'a dyn DataReader,
}

impl<'a> MongoExtractor<'a> {
    pub fn new(reader: &'a dyn DataReader) -> Self {
        Self { reader }
    }
}

#[async_trait::async_trait]
impl DataExtractor for MongoExtractor<'_> {
    async fn extract(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        _pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
        batch_number: u64,
    ) -> AppResult<ExtractOutput> {
        let mut rows = self.reader
            .fetch_rows(table, schema, columns, "_id", last_key, batch_size + 1)
            .await?;

        let has_more = rows.len() > batch_size;

        if has_more {
            rows.truncate(batch_size);
        }

        let next_key = rows
            .last()
            .and_then(|r| r.get("_id"))
            .cloned();

        Ok(ExtractOutput {
            rows,
            next_key,
            has_more,
            batch_number,
        })
    }

    async fn count(&self, table: &str, schema: Option<&str>) -> AppResult<u64> {
        self.reader.count_rows(table, schema).await
    }
}
