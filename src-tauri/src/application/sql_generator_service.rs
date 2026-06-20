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
            .map(|(k, v)| format!("{}{} = {}", q_open, k, Self::format_value(v)))
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
        let values: Vec<String> = context
            .data
            .values()
            .map(|v| Self::format_value(v))
            .collect();

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
            serde_json::Value::String(s) => format!("'{}'", s.replace("'", "''")),
            _ => format!("'{}'", value.to_string().replace("'", "''")),
        }
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
    fn test_generate_update_mariadb() {
        let ctx = mock_context();
        let sql = SqlGeneratorService::generate_update(DbType::Mariadb, &ctx);
        assert!(sql.contains("`users`"));
        assert!(sql.contains("`name` = 'test'"));
        assert!(sql.contains("WHERE `id` = 1"));
    }
}
