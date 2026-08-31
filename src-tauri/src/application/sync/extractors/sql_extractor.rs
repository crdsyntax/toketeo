use crate::application::sync::extractors::{DataExtractor, ExtractOutput};
use crate::db::DataReader;
use crate::error::AppResult;

pub struct SqlExtractor<'a> {
    reader: &'a dyn DataReader,
}

impl<'a> SqlExtractor<'a> {
    pub fn new(reader: &'a dyn DataReader) -> Self {
        Self { reader }
    }
}

#[async_trait::async_trait]
impl DataExtractor for SqlExtractor<'_> {
    async fn extract(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
        batch_number: u64,
    ) -> AppResult<ExtractOutput> {
        let mut rows = self
            .reader
            .fetch_rows(table, schema, columns, pk_column, last_key, batch_size + 1)
            .await?;

        let has_more = rows.len() > batch_size;

        if has_more {
            rows.truncate(batch_size);
        }

        let next_key = rows.last().and_then(|r| r.get(pk_column)).cloned();

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
