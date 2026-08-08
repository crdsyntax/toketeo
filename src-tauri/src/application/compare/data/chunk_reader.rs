use crate::db::DbDriver;
use crate::error::AppResult;

pub struct ChunkReader {
    pub chunk_size: usize,
}

impl ChunkReader {
    pub fn new(chunk_size: usize) -> Self {
        Self { chunk_size }
    }

    pub async fn read_chunk(
        &self,
        driver: &dyn DbDriver,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
    ) -> AppResult<(Vec<serde_json::Value>, Option<serde_json::Value>)> {
        let mut rows = driver
            .fetch_rows(
                table,
                schema,
                columns,
                pk_column,
                last_key,
                self.chunk_size + 1,
            )
            .await?;

        let has_more = rows.len() > self.chunk_size;
        if has_more {
            rows.pop();
        }

        let next_key = rows.last().and_then(|r| r.get(pk_column)).cloned();

        Ok((rows, if has_more { next_key } else { None }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_size_default() {
        let reader = ChunkReader::new(10000);
        assert_eq!(reader.chunk_size, 10000);
    }

    #[test]
    fn small_chunk() {
        let reader = ChunkReader::new(100);
        assert_eq!(reader.chunk_size, 100);
    }
}
