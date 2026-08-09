use crate::db::DbDriver;
use crate::error::AppResult;
use std::collections::HashMap;

/// Cache de metadatos de esquema por ejecución de comparación.
///
/// Evita re-consultar `fetch_columns` / `fetch_indexes` / `fetch_constraints`
/// cuando la misma tabla se procesa en varias fases (PK resolution, comparación
/// de columnas, etc.). No es persistente: se invalida al finalizar la ejecución.
#[derive(Default)]
pub struct SchemaMetadataCache {
    columns: HashMap<(String, String), Vec<serde_json::Value>>,
    indexes: HashMap<(String, String), Vec<serde_json::Value>>,
    constraints: HashMap<(String, String), Vec<serde_json::Value>>,
}

impl SchemaMetadataCache {
    pub fn new() -> Self {
        Self::default()
    }

    fn key(table: &str, schema: Option<&str>) -> (String, String) {
        (schema.unwrap_or("").to_string(), table.to_string())
    }

    pub async fn columns(
        &mut self,
        driver: &dyn DbDriver,
        table: &str,
        schema: Option<&str>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let key = Self::key(table, schema);
        if let Some(cached) = self.columns.get(&key) {
            return Ok(cached.clone());
        }
        let cols = driver
            .fetch_columns(table, schema.map(String::from))
            .await?;
        self.columns.insert(key, cols.clone());
        Ok(cols)
    }

    pub async fn indexes(
        &mut self,
        driver: &dyn DbDriver,
        table: &str,
        schema: Option<&str>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let key = Self::key(table, schema);
        if let Some(cached) = self.indexes.get(&key) {
            return Ok(cached.clone());
        }
        let idxs = driver
            .fetch_indexes(table, schema.map(String::from))
            .await?;
        self.indexes.insert(key, idxs.clone());
        Ok(idxs)
    }

    pub async fn constraints(
        &mut self,
        driver: &dyn DbDriver,
        table: &str,
        schema: Option<&str>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let key = Self::key(table, schema);
        if let Some(cached) = self.constraints.get(&key) {
            return Ok(cached.clone());
        }
        let cons = driver
            .fetch_constraints(table, schema.map(String::from))
            .await?;
        self.constraints.insert(key, cons.clone());
        Ok(cons)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_includes_schema_and_table() {
        let key = SchemaMetadataCache::key("orders", Some("public"));
        assert_eq!(key, ("public".to_string(), "orders".to_string()));
        let no_schema = SchemaMetadataCache::key("orders", None);
        assert_eq!(no_schema, (String::new(), "orders".to_string()));
    }

    #[test]
    fn distinct_tables_have_distinct_keys() {
        let a = SchemaMetadataCache::key("a", None);
        let b = SchemaMetadataCache::key("b", None);
        assert_ne!(a, b);
    }
}
