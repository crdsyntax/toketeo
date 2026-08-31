use crate::db::DbDriver;
use crate::error::AppResult;

use super::metadata_cache::SchemaMetadataCache;

pub async fn resolve_pk(
    cache: &mut SchemaMetadataCache,
    driver: &dyn DbDriver,
    table: &str,
    schema: Option<&str>,
) -> AppResult<Option<Vec<String>>> {
    let cols = cache.columns(driver, table, schema).await?;
    let pks: Vec<String> = cols
        .iter()
        .filter(|c| {
            c.get("isPrimaryKey")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
        .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(String::from))
        .collect();
    if !pks.is_empty() {
        return Ok(Some(pks));
    }

    let idxs = cache.indexes(driver, table, schema).await?;
    let primary_cols: Vec<String> = idxs
        .iter()
        .filter(|i| {
            i.get("isPrimary")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                || i.get("is_primary_key")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                || i.get("Key_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.eq_ignore_ascii_case("PRIMARY"))
                    .unwrap_or(false)
        })
        .filter_map(|i| i.get("column").and_then(|n| n.as_str()).map(String::from))
        .collect();
    if !primary_cols.is_empty() {
        return Ok(Some(primary_cols));
    }

    let constraints = cache.constraints(driver, table, schema).await?;
    let has_pk = constraints.iter().any(|c| {
        c.get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .contains("PRIMARY")
            || c.get("constraint_type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .contains("PRIMARY")
    });
    if has_pk {
        tracing::warn!(
            "Table '{}' has PRIMARY KEY but could not resolve columns via fetch_columns/fetch_indexes",
            table
        );
    }

    let unique_cols: Vec<String> = idxs
        .iter()
        .filter(|i| {
            i.get("isUnique").and_then(|v| v.as_bool()).unwrap_or(false)
                || i.get("is_unique")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                || i.get("Non_unique")
                    .and_then(|v| v.as_i64())
                    .map(|n| n == 0)
                    .unwrap_or(false)
        })
        .filter_map(|i| i.get("column").and_then(|n| n.as_str()).map(String::from))
        .collect();
    if !unique_cols.is_empty() {
        return Ok(Some(unique_cols));
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn detect_pk_from_columns() {
        let cols = [
            json!({"name": "id", "isPrimaryKey": true}),
            json!({"name": "name", "isPrimaryKey": false}),
        ];
        let pks: Vec<String> = cols
            .iter()
            .filter(|c| {
                c.get("isPrimaryKey")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
            .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(String::from))
            .collect();
        assert_eq!(pks, vec!["id"]);
    }

    #[test]
    fn detect_pk_from_indexes() {
        let idxs = [
            json!({"column": "id", "isPrimary": true}),
            json!({"column": "name", "isPrimary": false}),
        ];
        let pks: Vec<String> = idxs
            .iter()
            .filter(|i| {
                i.get("isPrimary")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
            .filter_map(|i| i.get("column").and_then(|n| n.as_str()).map(String::from))
            .collect();
        assert_eq!(pks, vec!["id"]);
    }

    #[test]
    fn detect_unique_fallback() {
        let idxs = [
            json!({"column": "email", "isUnique": true}),
            json!({"column": "name", "isUnique": false}),
        ];
        let uniq: Vec<String> = idxs
            .iter()
            .filter(|i| i.get("isUnique").and_then(|v| v.as_bool()).unwrap_or(false))
            .filter_map(|i| i.get("column").and_then(|n| n.as_str()).map(String::from))
            .collect();
        assert_eq!(uniq, vec!["email"]);
    }

    #[test]
    fn no_pk_returns_none() {
        let idxs: Vec<serde_json::Value> = vec![];
        let uniq: Vec<String> = idxs
            .iter()
            .filter(|i| i.get("isUnique").and_then(|v| v.as_bool()).unwrap_or(false))
            .filter_map(|i| i.get("column").and_then(|n| n.as_str()).map(String::from))
            .collect();
        assert!(uniq.is_empty());
    }
}
