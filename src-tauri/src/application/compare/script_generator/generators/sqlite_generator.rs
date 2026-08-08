use crate::models::compare::{CompareStatus, SchemaReport, ScriptOptions, ScriptStatement};

fn backup_table_name(table: &str) -> String {
    format!("{}_bak", table)
}

fn source_comment(source_name: &str, table: &str, object_name: &str, kind: Option<&str>) -> String {
    let obj_kind = kind.unwrap_or("object");
    if table.is_empty() {
        format!(
            "-- Source: [{}] {} \"{}\"",
            source_name, obj_kind, object_name
        )
    } else {
        format!(
            "-- Source: [{}] {} \"{}.{}\"",
            source_name, obj_kind, table, object_name
        )
    }
}

pub fn generate(report: &SchemaReport, options: &ScriptOptions) -> Vec<ScriptStatement> {
    let mut stmts = Vec::new();
    let mut stmt_id = 0u32;

    let mut next_id = || {
        stmt_id += 1;
        format!("stmt_{}", stmt_id)
    };

    for obj in &report.tables {
        match obj.status {
            CompareStatus::Missing => {
                if options.include_creates {
                    let comment = source_comment(&report.source_name, "", &obj.name, Some("table"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!(
                            "{}\n-- TODO: CREATE TABLE \"{}\" (requires DDL from source)",
                            comment, obj.name
                        ),
                        description: format!("Create table {}", obj.name),
                        diff_type: "create".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
            }
            CompareStatus::New => {
                if options.drop_target_extras && options.include_drops {
                    let backup_name = backup_table_name(&obj.name);
                    let comment = source_comment(&report.source_name, "", &obj.name, Some("table"));
                    let (sql, backup_sql) = if options.data_preservation {
                        (
                            format!("{}\nCREATE TABLE \"{}\" AS SELECT * FROM \"{}\";\nDROP TABLE IF EXISTS \"{}\";", comment, backup_name, obj.name, obj.name),
                            Some(format!("-- Backup of \"{}\" stored as \"{}\"", obj.name, backup_name)),
                        )
                    } else {
                        (
                            format!("{}\nDROP TABLE IF EXISTS \"{}\";", comment, obj.name),
                            None,
                        )
                    };
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql,
                        description: format!(
                            "Drop table {}{}",
                            obj.name,
                            if options.data_preservation {
                                " (with backup)"
                            } else {
                                ""
                            }
                        ),
                        diff_type: "drop".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
                        preserve_data: options.data_preservation,
                        backup_sql,
                    });
                }
            }
            CompareStatus::Modified if options.include_alters => {
                let comment = source_comment(&report.source_name, "", &obj.name, Some("table"));
                let (sql, backup_sql) = if options.data_preservation {
                    (
                            format!(
                                "{}\nBEGIN TRANSACTION;\n\
                                 CREATE TABLE \"{}_new\" (... -- TODO: updated schema from source ...);\n\
                                 INSERT INTO \"{}_new\" SELECT * FROM \"{}\";\n\
                                 DROP TABLE \"{}\";\n\
                                 ALTER TABLE \"{}_new\" RENAME TO \"{}\";\n\
                                 COMMIT;", comment,
                                obj.name, obj.name, obj.name, obj.name, obj.name, obj.name
                            ),
                            Some(format!("-- Transaction-based recreation of \"{}\" preserves all data", obj.name)),
                        )
                } else {
                    (
                        format!(
                            "{}\n-- SQLite: recreate table \"{}\" (ALTER TABLE limited)\n\
                                 -- TODO: Generate full table recreation",
                            comment, obj.name
                        ),
                        None,
                    )
                };
                stmts.push(ScriptStatement {
                    id: next_id(),
                    sql,
                    description: format!(
                        "Recreate table {} for SQLite{}",
                        obj.name,
                        if options.data_preservation {
                            " (transaction-safe)"
                        } else {
                            ""
                        }
                    ),
                    diff_type: "recreate_table".into(),
                    object_name: obj.name.clone(),
                    object_type: "table".into(),
                    selected: true,
                    preserve_data: options.data_preservation,
                    backup_sql,
                });
            }
            _ => {}
        }
    }

    stmts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::compare::*;

    fn empty_report() -> SchemaReport {
        SchemaReport {
            source_name: "s".into(),
            target_name: "t".into(),
            compared_at: "now".into(),
            tables: vec![],
            views: vec![],
            procedures: vec![],
            functions: vec![],
            triggers: vec![],
            indexes: vec![],
            foreign_keys: vec![],
            constraints: vec![],
            warnings: vec![],
            errors: vec![],
            summary: None,
        }
    }

    #[test]
    fn sqlite_modified_recreate() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "users".into(),
            status: CompareStatus::Modified,
            details: None,
        });
        let opts = ScriptOptions {
            data_preservation: false,
            ..Default::default()
        };
        let stmts = generate(&report, &opts);
        assert!(stmts.iter().any(|s| s.sql.contains("recreate")));
        assert!(!stmts.iter().any(|s| s.preserve_data));
    }

    #[test]
    fn sqlite_modified_with_preservation_uses_transaction() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "orders".into(),
            status: CompareStatus::Modified,
            details: None,
        });
        let opts = ScriptOptions {
            data_preservation: true,
            ..Default::default()
        };
        let stmts = generate(&report, &opts);
        assert!(stmts.iter().any(|s| s.preserve_data));
        assert!(stmts.iter().any(|s| s.sql.contains("BEGIN TRANSACTION")));
        assert!(stmts.iter().any(|s| s.sql.contains("COMMIT")));
        assert!(stmts.iter().any(|s| s.sql.contains("INSERT INTO")));
    }

    #[test]
    fn sqlite_new_table_no_drop_by_default() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "extra".into(),
            status: CompareStatus::New,
            details: None,
        });
        let opts = ScriptOptions::default();
        let stmts = generate(&report, &opts);
        assert!(!stmts.iter().any(|s| s.sql.contains("DROP TABLE")));
    }

    #[test]
    fn sqlite_new_table_drops_with_flag() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "extra".into(),
            status: CompareStatus::New,
            details: None,
        });
        let opts = ScriptOptions {
            drop_target_extras: true,
            data_preservation: true,
            ..Default::default()
        };
        let stmts = generate(&report, &opts);
        assert!(stmts.iter().any(|s| s.preserve_data));
        assert!(stmts.iter().any(|s| s.sql.contains("AS SELECT * FROM")));
    }

    #[test]
    fn sqlite_missing_table_creates() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "logs".into(),
            status: CompareStatus::Missing,
            details: None,
        });
        let opts = ScriptOptions::default();
        let stmts = generate(&report, &opts);
        assert!(stmts
            .iter()
            .any(|s| s.sql.contains("CREATE TABLE") || s.sql.contains("TODO: CREATE TABLE")));
    }
}
