use crate::models::compare::{CompareStatus, SchemaReport, ScriptOptions, ScriptStatement};

fn backup_table_name(table: &str) -> String {
    format!("{}_bak", table)
}

fn source_comment(source_name: &str, table: &str, object_name: &str, kind: Option<&str>) -> String {
    let obj_kind = kind.unwrap_or("object");
    if table.is_empty() {
        format!("-- Source: [{}] {} \"{}\"", source_name, obj_kind, object_name)
    } else {
        format!("-- Source: [{}] {} \"{}.{}\"", source_name, obj_kind, table, object_name)
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
                        sql: format!("{}\n-- TODO: CREATE TABLE \"{}\" (requires DDL from source)", comment, obj.name),
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
                        (format!("{}\nDROP TABLE IF EXISTS \"{}\";", comment, obj.name), None)
                    };
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql,
                        description: format!("Drop table {}{}", obj.name, if options.data_preservation { " (with backup)" } else { "" }),
                        diff_type: "drop".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
                        preserve_data: options.data_preservation,
                        backup_sql,
                    });
                }
            }
            CompareStatus::Modified => {
                if options.include_alters {
                    if let Some(details) = &obj.details {
                        if let Some(cols) = details.get("columns").and_then(|c| c.as_array()) {
                            for col in cols {
                                let col_name = col.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                let col_status = col.get("status").and_then(|s| s.as_str()).unwrap_or("");
                                match col_status {
                                    "modified" => {
                                        if let Some(t_type) = col.get("target_type").and_then(|t| t.as_str()) {
                                            let nullable = col.get("target_nullable").and_then(|n| n.as_bool()).unwrap_or(true);
                                            let backup_name = backup_table_name(&obj.name);
                                            let (type_sql, null_sql) = if nullable {
                                                (
                                                    format!("ALTER TABLE \"{}\" ALTER COLUMN \"{}\" TYPE {};", obj.name, col_name, t_type),
                                                    format!("ALTER TABLE \"{}\" ALTER COLUMN \"{}\" DROP NOT NULL;", obj.name, col_name),
                                                )
                                            } else {
                                                (
                                                    format!("ALTER TABLE \"{}\" ALTER COLUMN \"{}\" TYPE {};", obj.name, col_name, t_type),
                                                    format!("ALTER TABLE \"{}\" ALTER COLUMN \"{}\" SET NOT NULL;", obj.name, col_name),
                                                )
                                            };
                                let comment = source_comment(&report.source_name, &obj.name, col_name, Some("column"));
                                let (sql, backup_sql) = if options.data_preservation {
                                    (
                                        format!("{}\nCREATE TABLE \"{}\" AS SELECT * FROM \"{}\";\n{}\n{}", comment, backup_name, obj.name, type_sql, null_sql),
                                                    Some(format!("-- Backup of \"{}\" before column modification stored as \"{}\"", obj.name, backup_name)),
                                                )
                                } else {
                                    (format!("{}\n{}\n{}", comment, type_sql, null_sql), None)
                                };
                                            stmts.push(ScriptStatement {
                                                id: next_id(),
                                                sql,
                                                description: format!("Alter column {}.{}{}", obj.name, col_name, if options.data_preservation { " (with backup)" } else { "" }),
                                                diff_type: "alter".into(),
                                                object_name: col_name.to_string(),
                                                object_type: "column".into(),
                                                selected: true,
                                                preserve_data: options.data_preservation,
                                                backup_sql,
                                            });
                                        }
                                    }
                                    "missing" => {
                                        if let Some(t_type) = col.get("source_type").and_then(|t| t.as_str()) {
                                            let comment = source_comment(&report.source_name, &obj.name, col_name, Some("column"));
                                            stmts.push(ScriptStatement {
                                                id: next_id(),
                                                sql: format!("{}\nALTER TABLE \"{}\" ADD COLUMN \"{}\" {};", comment, obj.name, col_name, t_type),
                                                description: format!("Add column {}.{}", obj.name, col_name),
                                                diff_type: "alter_add".into(),
                                                object_name: col_name.to_string(),
                                                object_type: "column".into(),
                                                selected: true,
                                                preserve_data: false,
                                                backup_sql: None,
                                            });
                                        }
                                    }
                                    "new" => {
                                        if options.drop_target_extras {
                                            let comment = source_comment(&report.source_name, &obj.name, col_name, Some("column"));
                                            let backup_name = backup_table_name(&obj.name);
                                            let (sql, backup_sql) = if options.data_preservation {
                                                (
                                                    format!("{}\nCREATE TABLE \"{}\" AS SELECT * FROM \"{}\";\nALTER TABLE \"{}\" DROP COLUMN \"{}\";", comment, backup_name, obj.name, obj.name, col_name),
                                                    Some(format!("-- Backup of \"{}\" before dropping column \"{}\" stored as \"{}\"", obj.name, col_name, backup_name)),
                                                )
                                            } else {
                                                (format!("{}\nALTER TABLE \"{}\" DROP COLUMN \"{}\";", comment, obj.name, col_name), None)
                                            };
                                            stmts.push(ScriptStatement {
                                                id: next_id(),
                                                sql,
                                                description: format!("Drop column {}.{}{}", obj.name, col_name, if options.data_preservation { " (with backup)" } else { "" }),
                                                diff_type: "alter_drop".into(),
                                                object_name: col_name.to_string(),
                                                object_type: "column".into(),
                                                selected: true,
                                                preserve_data: options.data_preservation,
                                                backup_sql,
                                            });
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if options.include_indexes {
        for idx in &report.indexes {
            match idx.status {
                CompareStatus::Missing => {
                    let cols = idx.columns_changed.as_ref().map(|c| &c.0).cloned().unwrap_or_default();
                    let unique = if idx.unique_changed.as_ref().map(|u| u.0).unwrap_or(false) { "UNIQUE " } else { "" };
                    let comment = source_comment(&report.source_name, &idx.table, &idx.name, Some("index"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("{}\nCREATE {}INDEX \"{}\" ON \"{}\" (\"{}\");", comment, unique, idx.name, idx.table, cols.join("\", \"")),
                        description: format!("Create index {}", idx.name),
                        diff_type: "create_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
                CompareStatus::New => {
                    if options.drop_target_extras {
                        let comment = source_comment(&report.source_name, &idx.table, &idx.name, Some("index"));
                        stmts.push(ScriptStatement {
                            id: next_id(),
                            sql: format!("{}\nDROP INDEX \"{}\";", comment, idx.name),
                            description: format!("Drop index {}", idx.name),
                            diff_type: "drop_index".into(),
                            object_name: idx.name.clone(),
                            object_type: "index".into(),
                            selected: true,
                            preserve_data: false,
                            backup_sql: None,
                        });
                    }
                }
                CompareStatus::Modified => {
                    let cols = idx.columns_changed.as_ref()
                        .map(|c| &c.1).or_else(|| idx.columns_changed.as_ref().map(|c| &c.0))
                        .cloned().unwrap_or_default();
                    let unique = idx.unique_changed.as_ref().map(|u| u.1).unwrap_or(false);
                    let unique_kw = if unique { "UNIQUE " } else { "" };
                    let comment = source_comment(&report.source_name, &idx.table, &idx.name, Some("index"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("{}\nDROP INDEX \"{}\";\nCREATE {}INDEX \"{}\" ON \"{}\" (\"{}\");", comment, idx.name, unique_kw, idx.name, idx.table, cols.join("\", \"")),
                        description: format!("Recreate index {}", idx.name),
                        diff_type: "recreate_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
                _ => {}
            }
        }
    }

    if options.include_constraints {
        for fk in &report.foreign_keys {
            match fk.status {
                CompareStatus::Missing => {
                    let cols = fk.columns.as_ref().map(|c| &c.0).cloned().unwrap_or_default();
                    let ref_table = fk.referenced_table.as_ref().map(|r| &r.0).cloned().unwrap_or_default();
                    let on_delete = fk.on_delete.as_ref().map(|d| format!("ON DELETE {}", d.0)).unwrap_or_default();
                    let on_update = fk.on_update.as_ref().map(|u| format!("ON UPDATE {}", u.0)).unwrap_or_default();
                    let comment = source_comment(&report.source_name, &fk.table, &fk.name, Some("foreign key"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("{}\nALTER TABLE \"{}\" ADD CONSTRAINT \"{}\" FOREIGN KEY (\"{}\") REFERENCES \"{}\"(\"{}\") {} {};", comment, fk.table, fk.name, cols.join("\", \""), ref_table, cols.first().cloned().unwrap_or_default(), on_delete, on_update),
                        description: format!("Add foreign key {}", fk.name),
                        diff_type: "add_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
                CompareStatus::New => {
                    if options.drop_target_extras {
                        let comment = source_comment(&report.source_name, &fk.table, &fk.name, Some("foreign key"));
                        stmts.push(ScriptStatement {
                            id: next_id(),
                            sql: format!("{}\nALTER TABLE \"{}\" DROP CONSTRAINT \"{}\";", comment, fk.table, fk.name),
                            description: format!("Drop foreign key {}", fk.name),
                            diff_type: "drop_fk".into(),
                            object_name: fk.name.clone(),
                            object_type: "foreign_key".into(),
                            selected: true,
                            preserve_data: false,
                            backup_sql: None,
                        });
                    }
                }
                CompareStatus::Modified => {
                    let comment = source_comment(&report.source_name, &fk.table, &fk.name, Some("foreign key"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("{}\nALTER TABLE \"{}\" DROP CONSTRAINT \"{}\";\n-- Re-add with new definition", comment, fk.table, fk.name),
                        description: format!("Recreate foreign key {}", fk.name),
                        diff_type: "recreate_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
                _ => {}
            }
        }
    }

    if options.include_views {
        for view in &report.views {
            match view.status {
                CompareStatus::Missing | CompareStatus::Modified => {
                    let comment = source_comment(&report.source_name, "", &view.name, Some("view"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("{}\n-- TODO: CREATE OR REPLACE VIEW \"{}\" (requires DDL from source)", comment, view.name),
                        description: format!("Recreate view {}", view.name),
                        diff_type: "create_view".into(),
                        object_name: view.name.clone(),
                        object_type: "view".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
                CompareStatus::New => {
                    if options.drop_target_extras {
                        let comment = source_comment(&report.source_name, "", &view.name, Some("view"));
                        stmts.push(ScriptStatement {
                            id: next_id(),
                            sql: format!("{}\nDROP VIEW IF EXISTS \"{}\";", comment, view.name),
                            description: format!("Drop view {}", view.name),
                            diff_type: "drop_view".into(),
                            object_name: view.name.clone(),
                            object_type: "view".into(),
                            selected: true,
                            preserve_data: false,
                            backup_sql: None,
                        });
                    }
                }
                _ => {}
            }
        }
    }

    if options.include_routines {
        for proc in &report.procedures {
            match proc.status {
                CompareStatus::Missing | CompareStatus::Modified => {
                    let comment = source_comment(&report.source_name, "", &proc.name, Some("procedure"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("{}\n-- TODO: CREATE OR REPLACE PROCEDURE \"{}\" (requires DDL from source)", comment, proc.name),
                        description: format!("Recreate procedure {}", proc.name),
                        diff_type: "create_procedure".into(),
                        object_name: proc.name.clone(),
                        object_type: "procedure".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
                CompareStatus::New => {
                    if options.drop_target_extras {
                        let comment = source_comment(&report.source_name, "", &proc.name, Some("procedure"));
                        stmts.push(ScriptStatement {
                            id: next_id(),
                            sql: format!("{}\nDROP PROCEDURE IF EXISTS \"{}\";", comment, proc.name),
                            description: format!("Drop procedure {}", proc.name),
                            diff_type: "drop_procedure".into(),
                            object_name: proc.name.clone(),
                            object_type: "procedure".into(),
                            selected: true,
                            preserve_data: false,
                            backup_sql: None,
                        });
                    }
                }
                _ => {}
            }
        }
        for func in &report.functions {
            match func.status {
                CompareStatus::Missing | CompareStatus::Modified => {
                    let comment = source_comment(&report.source_name, "", &func.name, Some("function"));
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("{}\n-- TODO: CREATE OR REPLACE FUNCTION \"{}\" (requires DDL from source)", comment, func.name),
                        description: format!("Recreate function {}", func.name),
                        diff_type: "create_function".into(),
                        object_name: func.name.clone(),
                        object_type: "function".into(),
                        selected: true,
                        preserve_data: false,
                        backup_sql: None,
                    });
                }
                CompareStatus::New => {
                    if options.drop_target_extras {
                        let comment = source_comment(&report.source_name, "", &func.name, Some("function"));
                        stmts.push(ScriptStatement {
                            id: next_id(),
                            sql: format!("{}\nDROP FUNCTION IF EXISTS \"{}\";", comment, func.name),
                            description: format!("Drop function {}", func.name),
                            diff_type: "drop_function".into(),
                            object_name: func.name.clone(),
                            object_type: "function".into(),
                            selected: true,
                            preserve_data: false,
                            backup_sql: None,
                        });
                    }
                }
                _ => {}
            }
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
        }
    }

    #[test]
    fn postgres_uses_quoted_identifiers() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "legacy".into(),
            status: CompareStatus::Missing,
            details: None,
        });
        let opts = ScriptOptions::default();
        let stmts = generate(&report, &opts);
        assert!(stmts.iter().any(|s| s.sql.contains("\"legacy\"")));
        assert!(stmts.iter().any(|s| s.sql.contains("CREATE TABLE") || s.sql.contains("TODO: CREATE TABLE")));
    }

    #[test]
    fn postgres_new_table_no_drop_by_default() {
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
    fn postgres_new_table_drops_with_flag() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "extra".into(),
            status: CompareStatus::New,
            details: None,
        });
        let opts = ScriptOptions { drop_target_extras: true, data_preservation: false, ..Default::default() };
        let stmts = generate(&report, &opts);
        assert!(stmts.iter().any(|s| s.sql.contains("DROP TABLE")));
    }

    #[test]
    fn postgres_missing_table_with_preservation() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "users".into(),
            status: CompareStatus::Missing,
            details: None,
        });
        let opts = ScriptOptions { include_creates: false, ..Default::default() };
        let stmts = generate(&report, &opts);
        assert!(!stmts.iter().any(|s| s.sql.contains("CREATE TABLE")));
    }
}
