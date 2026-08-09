use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::sync::{ColumnDiff, DiffType, TableValidation};

/// Compara esquemas entre origen y destino.
pub struct SchemaDiff;

impl SchemaDiff {
    /// Compara las columnas de una tabla entre source y target.
    pub async fn compare_tables(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        source_table: &str,
        target_table: &str,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
    ) -> AppResult<TableValidation> {
        let source_cols = source
            .fetch_columns(source_table, source_schema.map(String::from))
            .await?;
        let target_cols = target
            .fetch_columns(target_table, target_schema.map(String::from))
            .await?;

        let mut column_diffs = Vec::new();
        let mut issues = Vec::new();

        let source_map: std::collections::HashMap<&str, &serde_json::Value> = source_cols
            .iter()
            .filter_map(|col| col.get("name").and_then(|n| n.as_str()).map(|n| (n, col)))
            .collect();

        let target_map: std::collections::HashMap<&str, &serde_json::Value> = target_cols
            .iter()
            .filter_map(|col| col.get("name").and_then(|n| n.as_str()).map(|n| (n, col)))
            .collect();

        // Columnas en source que no están en target
        for (name, src_col) in &source_map {
            if !target_map.contains_key(name) {
                let src_type = src_col
                    .get("type")
                    .and_then(|t| t.as_str())
                    .map(String::from);
                column_diffs.push(ColumnDiff {
                    column_name: name.to_string(),
                    source_type: src_type,
                    target_type: None,
                    source_nullable: src_col.get("isNullable").and_then(|n| n.as_bool()),
                    target_nullable: None,
                    diff_type: DiffType::MissingInTarget,
                });
            }
        }

        // Columnas en target que no están en source
        for (name, tgt_col) in &target_map {
            if !source_map.contains_key(name) {
                let tgt_type = tgt_col
                    .get("type")
                    .and_then(|t| t.as_str())
                    .map(String::from);
                column_diffs.push(ColumnDiff {
                    column_name: name.to_string(),
                    source_type: None,
                    target_type: tgt_type,
                    source_nullable: None,
                    target_nullable: tgt_col.get("isNullable").and_then(|n| n.as_bool()),
                    diff_type: DiffType::MissingInSource,
                });
            }
        }

        // Columnas presentes en ambos — comparar tipos y nullable
        for (name, src_col) in &source_map {
            if let Some(tgt_col) = target_map.get(name) {
                let src_type = src_col.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let tgt_type = tgt_col.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let src_nullable = src_col
                    .get("isNullable")
                    .and_then(|n| n.as_bool())
                    .unwrap_or(false);
                let tgt_nullable = tgt_col
                    .get("isNullable")
                    .and_then(|n| n.as_bool())
                    .unwrap_or(false);

                if src_type != tgt_type {
                    column_diffs.push(ColumnDiff {
                        column_name: name.to_string(),
                        source_type: Some(src_type.to_string()),
                        target_type: Some(tgt_type.to_string()),
                        source_nullable: Some(src_nullable),
                        target_nullable: Some(tgt_nullable),
                        diff_type: DiffType::TypeMismatch,
                    });
                }

                if src_nullable != tgt_nullable {
                    column_diffs.push(ColumnDiff {
                        column_name: name.to_string(),
                        source_type: Some(src_type.to_string()),
                        target_type: Some(tgt_type.to_string()),
                        source_nullable: Some(src_nullable),
                        target_nullable: Some(tgt_nullable),
                        diff_type: DiffType::NullableMismatch,
                    });
                }
            }
        }

        // Detectar diferencias de PK (basado en isPrimaryKey de cada columna)
        let source_pks: Vec<&str> = source_cols
            .iter()
            .filter(|col| {
                col.get("isPrimaryKey")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
            .filter_map(|col| col.get("name").and_then(|n| n.as_str()))
            .collect();

        let target_pks: Vec<&str> = target_cols
            .iter()
            .filter(|col| {
                col.get("isPrimaryKey")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
            .filter_map(|col| col.get("name").and_then(|n| n.as_str()))
            .collect();

        let primary_key_match = source_pks == target_pks;
        if !primary_key_match {
            issues.push(format!(
                "Primary key mismatch: source={:?}, target={:?}",
                source_pks, target_pks
            ));
        }

        let columns_match = column_diffs.is_empty();

        Ok(TableValidation {
            table_name: source_table.to_string(),
            exists_on_source: true,
            exists_on_target: true,
            columns_match,
            column_diffs,
            primary_key_match,
            issues,
        })
    }
}
