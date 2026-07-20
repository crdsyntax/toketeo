use crate::models::compare::{CompareStatus, SchemaReport, ScriptOptions, ScriptStatement};

pub fn generate(report: &SchemaReport, options: &ScriptOptions) -> Vec<ScriptStatement> {
    let mut stmts = Vec::new();
    let mut stmt_id = 0u32;

    let mut next_id = || {
        stmt_id += 1;
        format!("stmt_{}", stmt_id)
    };

    // Tables
    for obj in &report.tables {
        match obj.status {
            CompareStatus::New => {
                if options.include_creates {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("-- TODO: CREATE TABLE `{}` (requires DDL from source)", obj.name),
                        description: format!("Create table {}", obj.name),
                        diff_type: "create".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
                    });
                }
            }
            CompareStatus::Missing => {
                if options.include_drops {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("DROP TABLE IF EXISTS `{}`;", obj.name),
                        description: format!("Drop table {}", obj.name),
                        diff_type: "drop".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
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
                                            let not_null = if !nullable { " NOT NULL" } else { "" };
                                            stmts.push(ScriptStatement {
                                                id: next_id(),
                                                sql: format!("ALTER TABLE `{}` MODIFY COLUMN `{}` {};", obj.name, col_name, t_type) + not_null,
                                                description: format!("Modify column {}.{}", obj.name, col_name),
                                                diff_type: "alter".into(),
                                                object_name: col_name.to_string(),
                                                object_type: "column".into(),
                                                selected: true,
                                            });
                                        }
                                    }
                                    "new" => {
                                        if let Some(t_type) = col.get("target_type").and_then(|t| t.as_str()) {
                                            stmts.push(ScriptStatement {
                                                id: next_id(),
                                                sql: format!("ALTER TABLE `{}` ADD COLUMN `{}` {};", obj.name, col_name, t_type),
                                                description: format!("Add column {}.{}", obj.name, col_name),
                                                diff_type: "alter_add".into(),
                                                object_name: col_name.to_string(),
                                                object_type: "column".into(),
                                                selected: true,
                                            });
                                        }
                                    }
                                    "missing" => {
                                        stmts.push(ScriptStatement {
                                            id: next_id(),
                                            sql: format!("ALTER TABLE `{}` DROP COLUMN `{}`;", obj.name, col_name),
                                            description: format!("Drop column {}.{}", obj.name, col_name),
                                            diff_type: "alter_drop".into(),
                                            object_name: col_name.to_string(),
                                            object_type: "column".into(),
                                            selected: true,
                                        });
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

    // Indexes
    if options.include_indexes {
        for idx in &report.indexes {
            match idx.status {
                CompareStatus::New => {
                    let cols = idx.columns_changed.as_ref().map(|c| &c.1).cloned().unwrap_or_default();
                    let unique = if idx.unique_changed.as_ref().map(|u| u.1).unwrap_or(false) { "UNIQUE " } else { "" };
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("CREATE {}INDEX `{}` ON `{}` (`{}`);", unique, idx.name, idx.table, cols.join("`, `")),
                        description: format!("Create index {}", idx.name),
                        diff_type: "create_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("DROP INDEX `{}` ON `{}`;", idx.name, idx.table),
                        description: format!("Drop index {}", idx.name),
                        diff_type: "drop_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                    });
                }
                CompareStatus::Modified => {
                    let cols = idx.columns_changed.as_ref()
                        .map(|c| &c.1).or_else(|| idx.columns_changed.as_ref().map(|c| &c.0))
                        .cloned().unwrap_or_default();
                    let unique = idx.unique_changed.as_ref().map(|u| u.1).unwrap_or(false);
                    let unique_kw = if unique { "UNIQUE " } else { "" };
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("DROP INDEX `{}` ON `{}`;\nCREATE {}INDEX `{}` ON `{}` (`{}`);", idx.name, idx.table, unique_kw, idx.name, idx.table, cols.join("`, `")),
                        description: format!("Recreate index {}", idx.name),
                        diff_type: "recreate_index".into(),
                        object_name: idx.name.clone(),
                        object_type: "index".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
    }

    // Foreign Keys
    if options.include_constraints {
        for fk in &report.foreign_keys {
            match fk.status {
                CompareStatus::New => {
                    let cols = fk.columns.as_ref().map(|c| &c.1).cloned().unwrap_or_default();
                    let ref_table = fk.referenced_table.as_ref().map(|r| &r.1).cloned().unwrap_or_default();
                    let on_delete = fk.on_delete.as_ref().map(|d| format!("ON DELETE {}", d.1)).unwrap_or_default();
                    let on_update = fk.on_update.as_ref().map(|u| format!("ON UPDATE {}", u.1)).unwrap_or_default();
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("ALTER TABLE `{}` ADD CONSTRAINT `{}` FOREIGN KEY (`{}`) REFERENCES `{}`(`{}`) {} {};", fk.table, fk.name, cols.join("`, `"), ref_table, cols.first().cloned().unwrap_or_default(), on_delete, on_update),
                        description: format!("Add foreign key {}", fk.name),
                        diff_type: "add_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("ALTER TABLE `{}` DROP FOREIGN KEY `{}`;", fk.table, fk.name),
                        description: format!("Drop foreign key {}", fk.name),
                        diff_type: "drop_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                    });
                }
                CompareStatus::Modified => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("ALTER TABLE `{}` DROP FOREIGN KEY `{}`;\n-- Re-add with new definition", fk.table, fk.name),
                        description: format!("Recreate foreign key {}", fk.name),
                        diff_type: "recreate_fk".into(),
                        object_name: fk.name.clone(),
                        object_type: "foreign_key".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
    }

    // Views
    if options.include_views {
        for view in &report.views {
            match view.status {
                CompareStatus::New | CompareStatus::Modified => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("-- TODO: Recreate view `{}` (requires DDL from source)", view.name),
                        description: format!("Recreate view {}", view.name),
                        diff_type: "create_view".into(),
                        object_name: view.name.clone(),
                        object_type: "view".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("DROP VIEW IF EXISTS `{}`;", view.name),
                        description: format!("Drop view {}", view.name),
                        diff_type: "drop_view".into(),
                        object_name: view.name.clone(),
                        object_type: "view".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
    }

    // Procedures & Functions
    if options.include_routines {
        for proc in &report.procedures {
            match proc.status {
                CompareStatus::New | CompareStatus::Modified => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("-- TODO: Recreate procedure `{}` (requires DDL from source)", proc.name),
                        description: format!("Recreate procedure {}", proc.name),
                        diff_type: "create_procedure".into(),
                        object_name: proc.name.clone(),
                        object_type: "procedure".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("DROP PROCEDURE IF EXISTS `{}`;", proc.name),
                        description: format!("Drop procedure {}", proc.name),
                        diff_type: "drop_procedure".into(),
                        object_name: proc.name.clone(),
                        object_type: "procedure".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
        for func in &report.functions {
            match func.status {
                CompareStatus::New | CompareStatus::Modified => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("-- TODO: Recreate function `{}` (requires DDL from source)", func.name),
                        description: format!("Recreate function {}", func.name),
                        diff_type: "create_function".into(),
                        object_name: func.name.clone(),
                        object_type: "function".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("DROP FUNCTION IF EXISTS `{}`;", func.name),
                        description: format!("Drop function {}", func.name),
                        diff_type: "drop_function".into(),
                        object_name: func.name.clone(),
                        object_type: "function".into(),
                        selected: true,
                    });
                }
                _ => {}
            }
        }
    }

    // Triggers
    if options.include_routines {
        for trigger in &report.triggers {
            match trigger.status {
                CompareStatus::New | CompareStatus::Modified => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("-- TODO: Recreate trigger `{}` (requires DDL from source)", trigger.name),
                        description: format!("Recreate trigger {}", trigger.name),
                        diff_type: "create_trigger".into(),
                        object_name: trigger.name.clone(),
                        object_type: "trigger".into(),
                        selected: true,
                    });
                }
                CompareStatus::Missing => {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("DROP TRIGGER IF EXISTS `{}`;", trigger.name),
                        description: format!("Drop trigger {}", trigger.name),
                        diff_type: "drop_trigger".into(),
                        object_name: trigger.name.clone(),
                        object_type: "trigger".into(),
                        selected: true,
                    });
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
    fn empty_report_no_statements() {
        let report = empty_report();
        let opts = ScriptOptions::default();
        let stmts = generate(&report, &opts);
        assert!(stmts.is_empty());
    }

    #[test]
    fn missing_table_generates_drop() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "legacy".into(),
            status: CompareStatus::Missing,
            details: None,
        });
        let opts = ScriptOptions::default();
        let stmts = generate(&report, &opts);
        assert!(stmts.iter().any(|s| s.sql.contains("DROP TABLE")));
    }

    #[test]
    fn options_exclude_drops() {
        let mut report = empty_report();
        report.tables.push(ObjectDiff {
            name: "legacy".into(),
            status: CompareStatus::Missing,
            details: None,
        });
        let opts = ScriptOptions { include_drops: false, ..Default::default() };
        let stmts = generate(&report, &opts);
        assert!(!stmts.iter().any(|s| s.sql.contains("DROP TABLE")));
    }
}
