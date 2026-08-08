use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::models::compare::RowColumnDiff;

/// Lado(s) en los que existe un lote de PKs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BatchSide {
    /// Existe en ambos lados (hash divergente): comparar columna a columna.
    Both,
    /// Solo existe en source: emitir diffs con target_value = None.
    SourceOnly,
    /// Solo existe en target: emitir diffs con source_value = None.
    TargetOnly,
}

/// Compara un lote de filas entre source y target en 1-2 queries por lado
/// (`WHERE pk IN (...)`), reemplazando el N+1 de `compare_row_columns`.
///
/// Para `BatchSide::SourceOnly` / `TargetOnly` solo consulta el lado presente,
/// eliminando la query innecesaria al otro lado.
pub async fn compare_rows_batch(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_table: &str,
    target_table: &str,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    pk_columns: &[String],
    pks: &[String],
    all_columns: &[String],
    side: BatchSide,
) -> AppResult<Vec<RowColumnDiff>> {
    if pks.is_empty() {
        return Ok(Vec::new());
    }

    let src_where = build_in_clause(pk_columns, pks, source.db_type());
    let tgt_where = build_in_clause(pk_columns, pks, target.db_type());

    // Incluir siempre las PKs en el SELECT para poder indexar cada fila.
    let mut sel_columns: Vec<String> = all_columns.to_vec();
    for pk in pk_columns {
        if !sel_columns.iter().any(|c| c.eq_ignore_ascii_case(pk)) {
            sel_columns.push(pk.clone());
        }
    }

    let src_cols: Vec<String> = sel_columns
        .iter()
        .map(|c| quote_column(c, &source.db_type()))
        .collect();
    let tgt_cols: Vec<String> = sel_columns
        .iter()
        .map(|c| quote_column(c, &target.db_type()))
        .collect();

    let src_schema = source_schema
        .map(|s| format!("{}.", quote_column(s, &source.db_type())))
        .unwrap_or_default();
    let tgt_schema = target_schema
        .map(|s| format!("{}.", quote_column(s, &target.db_type())))
        .unwrap_or_default();

    let src_rows = if side != BatchSide::TargetOnly {
        let query = format!(
            "SELECT {} FROM {}{} WHERE {}",
            src_cols.join(", "),
            src_schema,
            quote_column(source_table, &source.db_type()),
            src_where
        );
        let result = source.execute(&query).await?;
        index_rows(result.rows, pk_columns)
    } else {
        Vec::new()
    };

    let tgt_rows = if side != BatchSide::SourceOnly {
        let query = format!(
            "SELECT {} FROM {}{} WHERE {}",
            tgt_cols.join(", "),
            tgt_schema,
            quote_column(target_table, &target.db_type()),
            tgt_where
        );
        let result = target.execute(&query).await?;
        index_rows(result.rows, pk_columns)
    } else {
        Vec::new()
    };

    let mut diffs = Vec::new();
    for pk in pks {
        let src_row = src_rows.iter().find(|(k, _)| k == pk).map(|(_, r)| r);
        let tgt_row = tgt_rows.iter().find(|(k, _)| k == pk).map(|(_, r)| r);

        match (src_row, tgt_row) {
            (Some(src), Some(tgt)) => {
                for col in all_columns {
                    let src_val = src.get(col);
                    let tgt_val = tgt.get(col);
                    if !values_equal(src_val, tgt_val) {
                        diffs.push(RowColumnDiff {
                            pk_value: pk.clone(),
                            column: col.clone(),
                            source_value: src_val.cloned(),
                            target_value: tgt_val.cloned(),
                        });
                    }
                }
            }
            (Some(src), None) => {
                for col in all_columns {
                    diffs.push(RowColumnDiff {
                        pk_value: pk.clone(),
                        column: col.clone(),
                        source_value: src.get(col).cloned(),
                        target_value: None,
                    });
                }
            }
            (None, Some(tgt)) => {
                for col in all_columns {
                    diffs.push(RowColumnDiff {
                        pk_value: pk.clone(),
                        column: col.clone(),
                        source_value: None,
                        target_value: tgt.get(col).cloned(),
                    });
                }
            }
            (None, None) => {}
        }
    }

    Ok(diffs)
}

/// Indexa filas del QueryResult por el valor string de su(s) PK(s).
fn index_rows(
    rows: Vec<serde_json::Value>,
    pk_columns: &[String],
) -> Vec<(String, serde_json::Map<String, serde_json::Value>)> {
    rows.into_iter()
        .filter_map(|row| {
            let row_obj = match row.as_object() {
                Some(obj) => obj.clone(),
                None => return None,
            };
            let key = if pk_columns.len() == 1 {
                row_obj
                    .get(&pk_columns[0])
                    .map(pk_cell_to_string)
                    .unwrap_or_default()
            } else {
                pk_columns
                    .iter()
                    .map(|c| row_obj.get(c).map(pk_cell_to_string).unwrap_or_default())
                    .collect::<Vec<_>>()
                    .join("|")
            };
            if key.is_empty() {
                None
            } else {
                Some((key, row_obj))
            }
        })
        .collect()
}

fn pk_cell_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

fn values_equal(a: Option<&serde_json::Value>, b: Option<&serde_json::Value>) -> bool {
    match (a, b) {
        (None, None) => true,
        (None, Some(v)) | (Some(v), None) => v.is_null(),
        (Some(a), Some(b)) => a == b,
    }
}

fn quote_column(col: &str, db_type: &DbType) -> String {
    match db_type {
        DbType::Mysql | DbType::Mariadb => format!("`{}`", col),
        DbType::Postgres => format!("\"{}\"", col),
        DbType::Sqlite => format!("\"{}\"", col),
        DbType::Sqlserver => format!("[{}]", col),
        _ => col.to_string(),
    }
}

/// Construye `pk IN ('a','b')` para PK simple o `(pk1, pk2) IN (('a',1),('b',2))`
/// para PK compuesta.
fn build_in_clause(pk_columns: &[String], pks: &[String], db_type: DbType) -> String {
    let quoted_cols: Vec<String> = pk_columns
        .iter()
        .map(|c| quote_column(c, &db_type))
        .collect();

    let values: Vec<String> = pks
        .iter()
        .map(|pk| {
            let cells: Vec<&str> = if pk_columns.len() > 1 {
                pk.split('|').collect()
            } else {
                vec![pk.as_str()]
            };
            let parts: Vec<String> = cells
                .iter()
                .map(|cell| {
                    if *cell == "null" {
                        "NULL".to_string()
                    } else if !cell.is_empty()
                        && cell
                            .chars()
                            .all(|c| c.is_ascii_digit() || c == '-' || c == '.')
                        && cell.parse::<f64>().is_ok()
                    {
                        cell.to_string()
                    } else {
                        let escaped = cell.replace('\'', "''");
                        match db_type {
                            DbType::Sqlserver => format!("N'{}'", escaped),
                            _ => format!("'{}'", escaped),
                        }
                    }
                })
                .collect();
            if parts.len() == 1 {
                parts[0].clone()
            } else {
                format!("({})", parts.join(", "))
            }
        })
        .collect();

    if quoted_cols.len() == 1 {
        format!("{} IN ({})", quoted_cols[0], values.join(", "))
    } else {
        format!("({}) IN ({})", quoted_cols.join(", "), values.join(", "))
    }
}

/// Compara los valores de una fila específica entre source y target columna por columna.
pub async fn compare_row_columns(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_table: &str,
    target_table: &str,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    pk_columns: &[String],
    pk_values: &serde_json::Value,
    all_columns: &[String],
) -> AppResult<Vec<RowColumnDiff>> {
    let where_clause = build_where_clause(pk_columns, pk_values, source.db_type());
    let target_where = build_where_clause(pk_columns, pk_values, target.db_type());

    let src_cols: Vec<String> = all_columns
        .iter()
        .map(|c| quote_column(c, &source.db_type()))
        .collect();
    let tgt_cols: Vec<String> = all_columns
        .iter()
        .map(|c| quote_column(c, &target.db_type()))
        .collect();

    let src_schema = source_schema
        .map(|s| format!("{}.", quote_column(s, &source.db_type())))
        .unwrap_or_default();
    let tgt_schema = target_schema
        .map(|s| format!("{}.", quote_column(s, &target.db_type())))
        .unwrap_or_default();

    let src_query = format!(
        "SELECT {} FROM {}{} WHERE {} LIMIT 1",
        src_cols.join(", "),
        src_schema,
        quote_column(source_table, &source.db_type()),
        where_clause
    );
    let tgt_query = format!(
        "SELECT {} FROM {}{} WHERE {} LIMIT 1",
        tgt_cols.join(", "),
        tgt_schema,
        quote_column(target_table, &target.db_type()),
        target_where
    );

    let src_result = source.execute(&src_query).await?;
    let tgt_result = target.execute(&tgt_query).await?;

    let src_row = src_result.rows.first();
    let tgt_row = tgt_result.rows.first();

    let pk_string = pk_values.to_string();

    match (src_row, tgt_row) {
        (Some(src), Some(tgt)) => {
            let mut diffs = Vec::new();
            for col in all_columns {
                let src_val = src.get(col);
                let tgt_val = tgt.get(col);
                if !values_equal(src_val, tgt_val) {
                    diffs.push(RowColumnDiff {
                        pk_value: pk_string.clone(),
                        column: col.clone(),
                        source_value: src_val.cloned(),
                        target_value: tgt_val.cloned(),
                    });
                }
            }
            Ok(diffs)
        }
        (Some(src), None) => Ok(all_columns
            .iter()
            .map(|col| RowColumnDiff {
                pk_value: pk_string.clone(),
                column: col.clone(),
                source_value: src.get(col).cloned(),
                target_value: None,
            })
            .collect()),
        (None, Some(tgt)) => Ok(all_columns
            .iter()
            .map(|col| RowColumnDiff {
                pk_value: pk_string.clone(),
                column: col.clone(),
                source_value: None,
                target_value: tgt.get(col).cloned(),
            })
            .collect()),
        (None, None) => Ok(Vec::new()),
    }
}

fn build_where_clause(
    pk_columns: &[String],
    pk_values: &serde_json::Value,
    db_type: DbType,
) -> String {
    pk_columns
        .iter()
        .map(|col| {
            let quoted = quote_column(col, &db_type);
            // pk_values can be a String (single PK as raw value) or Object (composite PK)
            let val = match pk_values {
                serde_json::Value::Object(map) => map.get(col),
                serde_json::Value::String(s) if pk_columns.len() == 1 => {
                    Some(&serde_json::Value::String(s.clone()))
                }
                _ => pk_values.get(col),
            };
            match val {
                Some(serde_json::Value::String(s)) => {
                    format!("{} = '{}'", quoted, s.replace('\'', "''"))
                }
                Some(serde_json::Value::Number(n)) => format!("{} = {}", quoted, n),
                Some(serde_json::Value::Null) => format!("{} IS NULL", quoted),
                Some(v) => format!("{} = '{}'", quoted, v.to_string().replace('\'', "''")),
                None => format!(
                    "{} = '{}'",
                    quoted,
                    pk_values.to_string().replace('\'', "''")
                ),
            }
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn values_equal_both_null() {
        assert!(values_equal(None, None));
    }

    #[test]
    fn values_equal_one_null_other_null_json() {
        assert!(values_equal(None, Some(&serde_json::Value::Null)));
        assert!(values_equal(Some(&serde_json::Value::Null), None));
    }

    #[test]
    fn values_equal_same() {
        assert!(values_equal(Some(&json!(42)), Some(&json!(42))));
        assert!(values_equal(Some(&json!("hello")), Some(&json!("hello"))));
    }

    #[test]
    fn values_different() {
        assert!(!values_equal(Some(&json!(42)), Some(&json!(43))));
    }

    #[test]
    fn where_clause_single_pk_string() {
        let pk_cols = vec!["id".to_string()];
        let pk_val = json!({"id": "abc"});
        let result = build_where_clause(&pk_cols, &pk_val, crate::db::DbType::Mysql);
        assert_eq!(result, "`id` = 'abc'");
    }

    #[test]
    fn where_clause_number() {
        let pk_cols = vec!["id".to_string()];
        let pk_val = json!({"id": 42});
        let result = build_where_clause(&pk_cols, &pk_val, crate::db::DbType::Postgres);
        assert_eq!(result, "\"id\" = 42");
    }

    #[test]
    fn where_clause_composite() {
        let pk_cols = vec!["a".to_string(), "b".to_string()];
        let pk_val = json!({"a": "x", "b": 1});
        let result = build_where_clause(&pk_cols, &pk_val, crate::db::DbType::Sqlserver);
        assert_eq!(result, "[a] = 'x' AND [b] = 1");
    }

    #[test]
    fn in_clause_single_pk() {
        let pk_cols = vec!["id".to_string()];
        let pks = vec!["abc".to_string(), "42".to_string()];
        let result = build_in_clause(&pk_cols, &pks, crate::db::DbType::Mysql);
        assert_eq!(result, "`id` IN ('abc', 42)");
    }

    #[test]
    fn in_clause_escapes_quotes() {
        let pk_cols = vec!["id".to_string()];
        let pks = vec!["o'brien".to_string()];
        let result = build_in_clause(&pk_cols, &pks, crate::db::DbType::Postgres);
        assert_eq!(result, "\"id\" IN ('o''brien')");
    }

    #[test]
    fn in_clause_composite() {
        let pk_cols = vec!["a".to_string(), "b".to_string()];
        let pks = vec!["x|1".to_string(), "y|2".to_string()];
        let result = build_in_clause(&pk_cols, &pks, crate::db::DbType::Postgres);
        assert_eq!(result, "(\"a\", \"b\") IN (('x', 1), ('y', 2))");
    }

    #[test]
    fn in_clause_sqlserver_nvarchar() {
        let pk_cols = vec!["id".to_string()];
        let pks = vec!["abc".to_string()];
        let result = build_in_clause(&pk_cols, &pks, crate::db::DbType::Sqlserver);
        assert_eq!(result, "[id] IN (N'abc')");
    }

    #[test]
    fn index_rows_by_pk() {
        let rows = vec![json!({"id": 1, "name": "a"}), json!({"id": 2, "name": "b"})];
        let pk_cols = vec!["id".to_string()];
        let indexed = index_rows(rows, &pk_cols);
        assert_eq!(indexed.len(), 2);
        assert_eq!(indexed[0].0, "1");
        assert_eq!(indexed[1].0, "2");
    }
}
