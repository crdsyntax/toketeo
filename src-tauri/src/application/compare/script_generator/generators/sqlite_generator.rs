use crate::models::compare::{CompareStatus, SchemaReport, ScriptOptions, ScriptStatement};

pub fn generate(report: &SchemaReport, options: &ScriptOptions) -> Vec<ScriptStatement> {
    let mut stmts = Vec::new();
    let mut stmt_id = 0u32;

    let mut next_id = || {
        stmt_id += 1;
        format!("stmt_{}", stmt_id)
    };

    for obj in &report.tables {
        match obj.status {
            CompareStatus::New => {
                if options.include_creates {
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("-- TODO: CREATE TABLE \"{}\" (requires DDL from source)", obj.name),
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
                        sql: format!("DROP TABLE IF EXISTS \"{}\";", obj.name),
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
                    stmts.push(ScriptStatement {
                        id: next_id(),
                        sql: format!("-- SQLite: recreate table \"{}\" (ALTER TABLE limited)\n-- TODO: Generate full table recreation", obj.name),
                        description: format!("Recreate table {} for SQLite", obj.name),
                        diff_type: "recreate_table".into(),
                        object_name: obj.name.clone(),
                        object_type: "table".into(),
                        selected: true,
                    });
                }
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

    #[test]
    fn sqlite_modified_recreate() {
        let mut report = SchemaReport {
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
        };
        report.tables.push(ObjectDiff {
            name: "users".into(),
            status: CompareStatus::Modified,
            details: None,
        });
        let opts = ScriptOptions::default();
        let stmts = generate(&report, &opts);
        assert!(stmts.iter().any(|s| s.sql.contains("recreate")));
    }
}
