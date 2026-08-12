use crate::db::DbType;
use crate::error::{AppError, AppResult};
use crate::models::{CellUpdateInput, RowContext};

pub struct SqlGeneratorService;

impl SqlGeneratorService {
    pub fn generate_select(db_type: DbType, context: &RowContext) -> String {
        let (q_open, q_close) = Self::get_quotes(db_type);
        let table_name = format!("{}{}{}", q_open, context.table, q_close);
        let columns: Vec<String> = context
            .data
            .keys()
            .map(|k| format!("{}{}{}", q_open, k, q_close))
            .collect();
        let where_clause: Vec<String> = context
            .primary_keys
            .iter()
            .map(|(k, v)| format!("{}{}{} = {}", q_open, k, q_close, Self::format_value(v)))
            .collect();

        let sql = format!(
            "SELECT {} FROM {} WHERE {}",
            columns.join(", "),
            table_name,
            where_clause.join(" AND ")
        );
        sql
    }

    pub fn generate_update(db_type: DbType, context: &RowContext) -> String {
        let (q_open, q_close) = Self::get_quotes(db_type);
        let table_name = format!("{}{}{}", q_open, context.table, q_close);
        let updates: Vec<String> = context
            .data
            .iter()
            .filter(|(k, _)| !context.primary_keys.contains_key(*k))
            .map(|(k, v)| format!("{}{}{} = {}", q_open, k, q_close, Self::format_value(v)))
            .collect();
        let where_clause: Vec<String> = context
            .primary_keys
            .iter()
            .map(|(k, v)| format!("{}{}{} = {}", q_open, k, q_close, Self::format_value(v)))
            .collect();

        let sql = format!(
            "UPDATE {} SET {} WHERE {}",
            table_name,
            updates.join(", "),
            where_clause.join(" AND ")
        );
        sql
    }

    pub fn generate_insert(db_type: DbType, context: &RowContext) -> String {
        let (q_open, q_close) = Self::get_quotes(db_type);
        let table_name = format!("{}{}{}", q_open, context.table, q_close);
        let columns: Vec<String> = context
            .data
            .keys()
            .map(|k| format!("{}{}{}", q_open, k, q_close))
            .collect();
        let values: Vec<String> = context.data.values().map(Self::format_value).collect();

        format!(
            "INSERT INTO {} ({}) VALUES ({})",
            table_name,
            columns.join(", "),
            values.join(", ")
        )
    }

    pub fn generate_delete(db_type: DbType, context: &RowContext) -> String {
        let (q_open, q_close) = Self::get_quotes(db_type);
        let table_name = format!("{}{}{}", q_open, context.table, q_close);
        let where_clause: Vec<String> = context
            .primary_keys
            .iter()
            .map(|(k, v)| format!("{}{}{} = {}", q_open, k, q_close, Self::format_value(v)))
            .collect();

        format!(
            "DELETE FROM {} WHERE {}",
            table_name,
            where_clause.join(" AND ")
        )
    }

    /// Generate a safe delete SQL script that first deletes from tables with
    /// foreign keys referencing the target table, then deletes from the target table.
    /// Wraps everything in a transaction.
    ///
    /// When `where_clause` is provided (the WHERE of the original DELETE, e.g.
    /// `id IN (252, 236)`), the dependent-table deletes are filtered to only
    /// remove the rows referencing the target rows matched by that clause:
    /// `DELETE FROM ref WHERE fk IN (SELECT pk FROM target WHERE <clause>);`.
    /// Without it (deleting the whole table), dependent tables are cleared.
    pub fn generate_safe_delete(
        db_type: DbType,
        table: &str,
        schema: Option<&str>,
        referenced_by: &[serde_json::Value],
        where_clause: Option<&str>,
    ) -> String {
        let (q_open, q_close) = Self::get_quotes(db_type);
        let qualified = |name: &str| {
            format!(
                "{}{}{}",
                q_open,
                Self::escape_identifier(name, q_close),
                q_close
            )
        };
        let target_qualified = if let Some(s) = schema {
            format!("{}.{}", qualified(s), qualified(table))
        } else {
            qualified(table)
        };
        let mut parts = Vec::new();

        parts.push("BEGIN;".to_string());
        parts.push(String::new());

        // Group referencing columns per table (composite FKs yield several rows).
        let mut refs: std::collections::BTreeMap<String, Vec<(String, String)>> =
            std::collections::BTreeMap::new();
        for fk in referenced_by {
            if let Some(table_name) = fk.get("referencingTable").and_then(|v| v.as_str()) {
                let column = fk
                    .get("columnName")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let referenced_column = fk
                    .get("referencingColumn")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                refs.entry(table_name.to_string())
                    .or_default()
                    .push((column, referenced_column));
            }
        }

        let wcl = where_clause.map(str::trim).filter(|c| !c.is_empty());

        if !refs.is_empty() {
            parts.push("-- Step 1: Delete dependent rows".to_string());
            for (ref_table, cols) in &refs {
                let ref_qualified = qualified(ref_table);
                if let Some(wcl) = wcl {
                    // Only delete the dependent rows referencing the rows
                    // matched by the original WHERE clause.
                    if cols.len() == 1 {
                        let (fk_col, pk_col) = &cols[0];
                        parts.push(format!(
                            "DELETE FROM {} WHERE {} IN (SELECT {} FROM {} WHERE {});",
                            ref_qualified,
                            qualified(fk_col),
                            qualified(pk_col),
                            target_qualified,
                            wcl,
                        ));
                    } else {
                        parts.push(format!(
                            "-- WARNING: {} references {} via a composite FK that cannot be filtered safely; skipping",
                            ref_table, table,
                        ));
                    }
                } else {
                    parts.push(format!("DELETE FROM {};", ref_qualified));
                }
            }
            parts.push(String::new());
        }

        parts.push("-- Step 2: Delete target rows".to_string());
        if let Some(wcl) = wcl {
            parts.push(format!("DELETE FROM {} WHERE {};", target_qualified, wcl));
        } else {
            parts.push(format!("DELETE FROM {};", target_qualified));
        }
        parts.push(String::new());
        parts.push("COMMIT;".to_string());

        parts.join("\n")
    }

    pub fn generate_cell_update(db_type: DbType, input: &CellUpdateInput) -> AppResult<String> {
        let (q_open, q_close) = Self::get_quotes(db_type);
        let table_name = match input
            .schema
            .as_deref()
            .filter(|schema| !schema.trim().is_empty())
        {
            Some(schema) => format!(
                "{}{}{}.{}{}{}",
                q_open,
                Self::escape_identifier(schema, q_close),
                q_close,
                q_open,
                Self::escape_identifier(&input.table, q_close),
                q_close,
            ),
            None => format!(
                "{}{}{}",
                q_open,
                Self::escape_identifier(&input.table, q_close),
                q_close,
            ),
        };
        let column_name = format!(
            "{}{}{}",
            q_open,
            Self::escape_identifier(&input.column, q_close),
            q_close,
        );
        let where_clause = Self::cell_update_where_clause(q_open, q_close, input)?;

        Ok(format!(
            "UPDATE {} SET {} = {} WHERE {};",
            table_name,
            column_name,
            Self::format_value(&input.new_value),
            where_clause,
        ))
    }

    fn cell_update_where_clause(
        q_open: &str,
        q_close: &str,
        input: &CellUpdateInput,
    ) -> AppResult<String> {
        let primary_key_clauses: Vec<String> = input
            .primary_keys
            .iter()
            .filter_map(|key| input.row.get(key).map(|value| (key, value)))
            .map(|(key, value)| Self::comparison_clause(q_open, q_close, key, value))
            .collect();

        if !primary_key_clauses.is_empty() {
            return Ok(primary_key_clauses.join(" AND "));
        }

        let fallback_clauses: Vec<String> = input
            .row
            .iter()
            .map(|(key, value)| Self::comparison_clause(q_open, q_close, key, value))
            .collect();

        if fallback_clauses.is_empty() {
            return Err(AppError::Validation(
                "Cannot update a cell without row identity data".into(),
            ));
        }

        Ok(fallback_clauses.join(" AND "))
    }

    fn comparison_clause(
        q_open: &str,
        q_close: &str,
        key: &str,
        value: &serde_json::Value,
    ) -> String {
        let column = format!(
            "{}{}{}",
            q_open,
            Self::escape_identifier(key, q_close),
            q_close
        );
        if value.is_null() {
            format!("{} IS NULL", column)
        } else {
            format!("{} = {}", column, Self::format_value(value))
        }
    }

    fn format_value(value: &serde_json::Value) -> String {
        match value {
            serde_json::Value::Null => "NULL".to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
            serde_json::Value::Object(map) => {
                // Expresión SQL segura vía { "__expr": "NOW()" } (menú
                // contextual de celdas de fecha/hora). Solo se permite una
                // allowlist estricta para evitar inyección.
                if let Some(expr) = map.get("__expr").and_then(|v| v.as_str()) {
                    let e = expr.trim();
                    if Self::is_safe_sql_expr(e) {
                        return e.to_string();
                    }
                }
                format!("'{}'", value.to_string().replace('\'', "''"))
            }
            _ => format!("'{}'", value.to_string().replace('\'', "''")),
        }
    }

    /// Allowlist de expresiones SQL inofensivas permitidas vía `{ "__expr" }`.
    fn is_safe_sql_expr(expr: &str) -> bool {
        matches!(
            expr.to_ascii_lowercase().as_str(),
            "now"
                | "now()"
                | "current_timestamp"
                | "current_timestamp()"
                | "current_date"
                | "current_date()"
                | "current_time"
                | "current_time()"
        )
    }

    fn escape_identifier(identifier: &str, q_close: &str) -> String {
        identifier.replace(q_close, &format!("{}{}", q_close, q_close))
    }
    // ... (código existente)
    fn get_quotes(db_type: DbType) -> (&'static str, &'static str) {
        match db_type {
            DbType::Postgres => ("\"", "\""),
            DbType::Mysql | DbType::Mariadb => ("`", "`"),
            _ => ("\"", "\""),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbType;
    use std::collections::HashMap;

    fn mock_context() -> RowContext {
        let mut primary_keys = HashMap::new();
        primary_keys.insert("id".to_string(), serde_json::json!(1));

        let mut data = HashMap::new();
        data.insert("id".to_string(), serde_json::json!(1));
        data.insert("name".to_string(), serde_json::json!("test"));

        RowContext {
            schema: None,
            table: "users".to_string(),
            primary_keys,
            data,
        }
    }

    #[test]
    fn test_generate_select_postgres() {
        let ctx = mock_context();
        let sql = SqlGeneratorService::generate_select(DbType::Postgres, &ctx);
        assert!(sql.contains(r#""users""#));
        assert!(sql.contains(r#""id""#));
        assert!(sql.contains(r#""name""#));
        assert!(sql.contains(r#""id""#));
    }

    #[test]
    fn test_generate_select_where_uses_closed_quotes() {
        let ctx = mock_context();
        let sql = SqlGeneratorService::generate_select(DbType::Postgres, &ctx);
        // El WHERE debe ser `"id" = 1`, nunca `"id = 1` (comilla sin cerrar).
        assert!(sql.contains(r#""id" = 1"#), "malformed WHERE: {sql}");
        assert!(!sql.contains(r#""id ="#), "unclosed quote in WHERE: {sql}");
    }

    #[test]
    fn test_generate_update_mariadb() {
        let ctx = mock_context();
        let sql = SqlGeneratorService::generate_update(DbType::Mariadb, &ctx);
        assert!(sql.contains("`users`"));
        assert!(sql.contains("`name` = 'test'"));
        assert!(sql.contains("WHERE `id` = 1"));
    }

    #[test]
    fn format_value_emits_safe_sql_expressions() {
        assert_eq!(
            SqlGeneratorService::format_value(&serde_json::json!({ "__expr": "NOW()" })),
            "NOW()"
        );
        assert_eq!(
            SqlGeneratorService::format_value(
                &serde_json::json!({ "__expr": "current_timestamp" })
            ),
            "current_timestamp"
        );
    }

    #[test]
    fn format_value_quotes_unsafe_expressions() {
        // Una expresión fuera de la allowlist NO se emite cruda.
        assert_eq!(
            SqlGeneratorService::format_value(&serde_json::json!({ "__expr": "DROP TABLE users" })),
            "'{\"__expr\":\"DROP TABLE users\"}'"
        );
        // Objetos sin __expr se serializan como literal.
        assert_eq!(
            SqlGeneratorService::format_value(&serde_json::json!({ "a": 1 })),
            "'{\"a\":1}'"
        );
    }
}
