use crate::models::compare::{DataReport, RowColumnDiff, ScriptOptions, ScriptStatement};

pub fn generate_data_sync(
    data_report: &DataReport,
    target_db_type: &str,
    _options: &ScriptOptions,
) -> Vec<ScriptStatement> {
    let mut stmts = Vec::new();
    let mut stmt_id = 0u32;
    let mut next_id = || {
        stmt_id += 1;
        format!("data_{}", stmt_id)
    };

    let is_mysql = matches!(
        target_db_type.to_lowercase().as_str(),
        "mysql" | "mariadb"
    );

    for table in &data_report.tables {
        if table.status == crate::models::compare::CompareStatus::Equal {
            continue;
        }

        let has_changes = !table.column_diffs.is_empty()
            || !table.source_only_rows.is_empty()
            || !table.target_only_rows.is_empty();
        if !has_changes {
            continue;
        }

        if !table.source_only_rows.is_empty() {
            let grouped = group_by_pk(&table.source_only_rows);
            for (pk_key, rows) in &grouped {
                let all_cols: Vec<&str> = rows.iter().map(|r| r.column.as_str()).collect();

                let col_list = if is_mysql {
                    all_cols.iter()
                        .map(|c| format!("`{}`", c))
                        .collect::<Vec<_>>()
                        .join(", ")
                } else {
                    all_cols.iter()
                        .map(|c| format!("\"{}\"", c))
                        .collect::<Vec<_>>()
                        .join(", ")
                };

                let val_list = rows.iter()
                    .map(|v| format_value(&v.source_value, is_mysql))
                    .collect::<Vec<_>>()
                    .join(", ");

                let pk_display = if table.pk_columns.len() == 1 {
                    format!("{}={}", table.pk_columns[0], pk_key)
                } else {
                    pk_key.clone()
                };

                stmts.push(ScriptStatement {
                    id: next_id(),
                    sql: format!(
                        "-- Source row [{}.{} PK:{}]\nINSERT INTO {} ({}) VALUES ({});",
                        table.table,
                        table.table,
                        pk_display,
                        quote_identifier(&table.table, is_mysql),
                        col_list,
                        val_list,
                    ),
                    description: format!("Insert row into {} (PK: {})", table.table, pk_display),
                    diff_type: "data_insert".into(),
                    object_name: table.table.clone(),
                    object_type: "data".into(),
                    selected: true,
                    preserve_data: false,
                    backup_sql: None,
                });
            }
        }

        if !table.column_diffs.is_empty() {
            let grouped = group_by_pk(&table.column_diffs);
            for (pk_key, diffs) in &grouped {
                let set_clauses: Vec<String> = diffs.iter().map(|d| {
                    let quoted_col = if is_mysql {
                        format!("`{}`", d.column)
                    } else {
                        format!("\"{}\"", d.column)
                    };
                    format!("{} = {}", quoted_col, format_value(&d.target_value, is_mysql))
                }).collect();

                let where_clause = build_pk_where(&table.pk_columns, pk_key, is_mysql);
                let pk_display = if table.pk_columns.len() == 1 {
                    format!("{}={}", table.pk_columns[0], pk_key)
                } else {
                    pk_key.clone()
                };

                stmts.push(ScriptStatement {
                    id: next_id(),
                    sql: format!(
                        "-- Source row [{}.{} PK:{}]\nUPDATE {} SET {} WHERE {};",
                        table.table,
                        table.table,
                        pk_display,
                        quote_identifier(&table.table, is_mysql),
                        set_clauses.join(", "),
                        where_clause,
                    ),
                    description: format!("Update row in {} (PK: {})", table.table, pk_display),
                    diff_type: "data_update".into(),
                    object_name: table.table.clone(),
                    object_type: "data".into(),
                    selected: true,
                    preserve_data: false,
                    backup_sql: None,
                });
            }
        }

        if !table.target_only_rows.is_empty() {
            let grouped = group_by_pk(&table.target_only_rows);
            for (pk_key, _) in &grouped {
                let where_clause = build_pk_where(&table.pk_columns, pk_key, is_mysql);
                let pk_display = if table.pk_columns.len() == 1 {
                    format!("{}={}", table.pk_columns[0], pk_key)
                } else {
                    pk_key.clone()
                };

                stmts.push(ScriptStatement {
                    id: next_id(),
                    sql: format!(
                        "-- Target-only row [{}.{} PK:{}]\nDELETE FROM {} WHERE {};",
                        table.table,
                        table.table,
                        pk_display,
                        quote_identifier(&table.table, is_mysql),
                        where_clause,
                    ),
                    description: format!("Delete row from {} (PK: {})", table.table, pk_display),
                    diff_type: "data_delete".into(),
                    object_name: table.table.clone(),
                    object_type: "data".into(),
                    selected: true,
                    preserve_data: false,
                    backup_sql: None,
                });
            }
        }
    }

    stmts
}

fn group_by_pk(diffs: &[RowColumnDiff]) -> Vec<(String, Vec<RowColumnDiff>)> {
    let mut map: Vec<(String, Vec<RowColumnDiff>)> = Vec::new();
    let mut order: Vec<String> = Vec::new();

    for diff in diffs {
        if let Some(pos) = order.iter().position(|k| k == &diff.pk_value) {
            map[pos].1.push(diff.clone());
        } else {
            order.push(diff.pk_value.clone());
            map.push((diff.pk_value.clone(), vec![diff.clone()]));
        }
    }

    map
}

fn format_value(val: &Option<serde_json::Value>, is_mysql: bool) -> String {
    match val {
        None | Some(serde_json::Value::Null) => "NULL".to_string(),
        Some(serde_json::Value::String(s)) => {
            let escaped = s.replace('\'', "''");
            format!("'{}'", escaped)
        }
        Some(serde_json::Value::Number(n)) => n.to_string(),
        Some(serde_json::Value::Bool(b)) => {
            if is_mysql {
                if *b { "1" } else { "0" }.to_string()
            } else {
                if *b { "true" } else { "false" }.to_string()
            }
        }
        Some(v) => {
            let s = v.to_string().replace('\'', "''");
            format!("'{}'", s)
        }
    }
}

fn quote_identifier(name: &str, is_mysql: bool) -> String {
    if is_mysql {
        format!("`{}`", name)
    } else {
        format!("\"{}\"", name)
    }
}

fn build_pk_where(pk_columns: &[String], pk_value: &str, is_mysql: bool) -> String {
    if pk_columns.len() == 1 {
        let quoted = quote_identifier(&pk_columns[0], is_mysql);
        format!("{} = {}", quoted, format_pk_value(pk_value, is_mysql))
    } else {
        let values: Vec<&str> = pk_value.split("||").collect();
        pk_columns.iter().enumerate().map(|(i, col)| {
            let quoted = quote_identifier(col, is_mysql);
            let val = values.get(i).unwrap_or(&"");
            format!("{} = {}", quoted, format_pk_value(val, is_mysql))
        }).collect::<Vec<_>>().join(" AND ")
    }
}

fn format_pk_value(val: &str, _is_mysql: bool) -> String {
    if val == "NULL" {
        return "NULL".to_string();
    }
    if val.parse::<i64>().is_ok() || val.parse::<f64>().is_ok() {
        return val.to_string();
    }
    let escaped = val.replace('\'', "''");
    format!("'{}'", escaped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::compare::*;

    fn sample_report() -> DataReport {
        DataReport {
            tables: vec![TableDataDiff {
                table: "users".into(),
                status: CompareStatus::Modified,
                source_count: 3,
                target_count: 2,
                rows_equal: 1,
                rows_modified: 1,
                rows_only_in_source: 1,
                rows_only_in_target: 0,
                pk_columns: vec!["id".into()],
                column_diffs: vec![RowColumnDiff {
                    pk_value: "2".into(),
                    column: "name".into(),
                    source_value: Some(serde_json::Value::String("Alice Updated".into())),
                    target_value: Some(serde_json::Value::String("Alice".into())),
                }],
                source_only_rows: vec![RowColumnDiff {
                    pk_value: "3".into(),
                    column: "id".into(),
                    source_value: Some(serde_json::json!(3)),
                    target_value: None,
                }, RowColumnDiff {
                    pk_value: "3".into(),
                    column: "name".into(),
                    source_value: Some(serde_json::Value::String("Bob".into())),
                    target_value: None,
                }],
                target_only_rows: vec![],
            }],
        }
    }

    #[test]
    fn generates_update_for_modified_rows() {
        let report = sample_report();
        let stmts = generate_data_sync(&report, "mysql", &ScriptOptions::default());
        let updates: Vec<_> = stmts.iter().filter(|s| s.diff_type == "data_update").collect();
        assert_eq!(updates.len(), 1);
        assert!(updates[0].sql.contains("UPDATE `users` SET"));
        assert!(updates[0].sql.contains("WHERE `id` = 2"));
    }

    #[test]
    fn generates_insert_for_source_only_rows() {
        let report = sample_report();
        let stmts = generate_data_sync(&report, "mysql", &ScriptOptions::default());
        let inserts: Vec<_> = stmts.iter().filter(|s| s.diff_type == "data_insert").collect();
        assert_eq!(inserts.len(), 1);
        assert!(inserts[0].sql.contains("INSERT INTO `users`"));
    }

    #[test]
    fn generates_delete_for_target_only_rows() {
        let mut report = sample_report();
        report.tables[0].target_only_rows = vec![RowColumnDiff {
            pk_value: "1".into(),
            column: "id".into(),
            source_value: None,
            target_value: Some(serde_json::json!(1)),
        }];
        let stmts = generate_data_sync(&report, "postgres", &ScriptOptions::default());
        let deletes: Vec<_> = stmts.iter().filter(|s| s.diff_type == "data_delete").collect();
        assert_eq!(deletes.len(), 1);
        assert!(deletes[0].sql.contains("DELETE FROM \"users\""));
        assert!(deletes[0].sql.contains("\"id\" = 1"));
    }

    #[test]
    fn skips_equal_tables() {
        let report = DataReport {
            tables: vec![TableDataDiff {
                table: "t1".into(),
                status: CompareStatus::Equal,
                source_count: 5,
                target_count: 5,
                rows_equal: 5,
                rows_modified: 0,
                rows_only_in_source: 0,
                rows_only_in_target: 0,
                pk_columns: vec!["id".into()],
                column_diffs: vec![],
                source_only_rows: vec![],
                target_only_rows: vec![],
            }],
        };
        let stmts = generate_data_sync(&report, "mysql", &ScriptOptions::default());
        assert!(stmts.is_empty());
    }

    #[test]
    fn postgres_uses_quoted_identifiers() {
        let report = sample_report();
        let stmts = generate_data_sync(&report, "postgres", &ScriptOptions::default());
        assert!(stmts.iter().any(|s| s.sql.contains("\"users\"")));
        assert!(stmts.iter().any(|s| s.sql.contains("\"name\"")));
    }
}
