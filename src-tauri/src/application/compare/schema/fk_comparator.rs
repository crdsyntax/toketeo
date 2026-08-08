use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::models::compare::{CompareStatus, FkDiff};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
struct FkInfo {
    constraint_name: String,
    columns: Vec<String>,
    referenced_table: String,
    referenced_columns: Vec<String>,
}

fn get_str(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

fn parse_fk_row(value: &serde_json::Value) -> Option<FkInfo> {
    let constraint_name = get_str(value, &["constraintName", "constraint_name"])?;
    let column = get_str(value, &["columnName", "column_name", "from"]).unwrap_or_default();
    let referenced_table = get_str(
        value,
        &[
            "referencedTable",
            "referenced_table",
            "referencedTableName",
            "table",
        ],
    )?;
    let referenced_column = get_str(
        value,
        &[
            "referencedColumn",
            "referenced_column",
            "referencedColumnName",
            "to",
        ],
    )
    .unwrap_or_default();

    Some(FkInfo {
        constraint_name,
        columns: if column.is_empty() {
            vec![]
        } else {
            vec![column]
        },
        referenced_table,
        referenced_columns: if referenced_column.is_empty() {
            vec![]
        } else {
            vec![referenced_column]
        },
    })
}

fn group_foreign_keys(rows: &[serde_json::Value]) -> BTreeMap<String, FkInfo> {
    let mut map: BTreeMap<String, FkInfo> = BTreeMap::new();
    for row in rows {
        if let Some(mut info) = parse_fk_row(row) {
            let key = info.constraint_name.clone();
            let entry = map.entry(key).or_insert_with(|| FkInfo {
                constraint_name: info.constraint_name,
                columns: Vec::new(),
                referenced_table: info.referenced_table,
                referenced_columns: Vec::new(),
            });
            if !info.columns.is_empty() {
                entry.columns.append(&mut info.columns);
            }
            if !info.referenced_columns.is_empty() {
                entry
                    .referenced_columns
                    .append(&mut info.referenced_columns);
            }
        }
    }
    map
}

fn mysql_on_delete_update_query() -> &'static str {
    "SELECT rc.CONSTRAINT_NAME as constraintName, rc.UPDATE_RULE as onUpdate, rc.DELETE_RULE as onDelete \
     FROM information_schema.REFERENTIAL_CONSTRAINTS rc \
     WHERE rc.TABLE_NAME = ? AND rc.CONSTRAINT_SCHEMA = IFNULL(?, DATABASE())"
}

fn postgres_on_delete_update_query() -> &'static str {
    "SELECT conname as \"constraintName\", \
            CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' \
             WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END as \"onDelete\", \
            CASE confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' \
             WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END as \"onUpdate\" \
     FROM pg_constraint \
     WHERE conrelid = (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid \
                       WHERE c.relname = $1 AND n.nspname = COALESCE($2, current_schema())) \
       AND contype = 'f'"
}

fn sqlserver_on_delete_update_query(table: &str, schema: &str) -> String {
    format!(
        "SELECT fk.name AS constraintName, \
                OBJECT_NAME(fk.delete_referencing_object_id) AS onDelete, \
                OBJECT_NAME(fk.update_referencing_object_id) AS onUpdate \
         FROM sys.foreign_keys fk \
         JOIN sys.tables t ON fk.parent_object_id = t.object_id \
         WHERE t.name = '{}' AND SCHEMA_NAME(t.schema_id) = '{}'",
        table.replace('\'', "''"),
        schema.replace('\'', "''"),
    )
}

async fn fetch_on_delete_update(
    driver: &dyn DbDriver,
    table: &str,
    schema: Option<&str>,
) -> AppResult<BTreeMap<String, (String, String)>> {
    let db_type = driver.db_type();
    let mut map = BTreeMap::new();

    match db_type {
        DbType::Mysql | DbType::Mariadb => {
            let result = driver
                .execute_with_params(
                    mysql_on_delete_update_query(),
                    &[Some(table.to_string()), schema.map(str::to_string)],
                )
                .await?;
            for row in &result.rows {
                if let (Some(name), Some(on_delete), Some(on_update)) = (
                    row.get("constraintName").and_then(|v| v.as_str()),
                    row.get("onDelete").and_then(|v| v.as_str()),
                    row.get("onUpdate").and_then(|v| v.as_str()),
                ) {
                    map.insert(
                        name.to_string(),
                        (on_delete.to_string(), on_update.to_string()),
                    );
                }
            }
        }
        DbType::Postgres => {
            let result = driver
                .execute_with_params(
                    postgres_on_delete_update_query(),
                    &[Some(table.to_string()), schema.map(str::to_string)],
                )
                .await?;
            for row in &result.rows {
                if let (Some(name), Some(on_delete), Some(on_update)) = (
                    row.get("constraintName").and_then(|v| v.as_str()),
                    row.get("onDelete").and_then(|v| v.as_str()),
                    row.get("onUpdate").and_then(|v| v.as_str()),
                ) {
                    map.insert(
                        name.to_string(),
                        (on_delete.to_string(), on_update.to_string()),
                    );
                }
            }
        }
        DbType::Sqlserver => {
            let schema_name = schema.unwrap_or("dbo");
            let query = sqlserver_on_delete_update_query(table, schema_name);
            let result = driver.execute(&query).await?;
            for row in &result.rows {
                if let (Some(name), Some(on_delete), Some(on_update)) = (
                    row.get("constraintName").and_then(|v| v.as_str()),
                    row.get("onDelete").and_then(|v| v.as_str()),
                    row.get("onUpdate").and_then(|v| v.as_str()),
                ) {
                    map.insert(
                        name.to_string(),
                        (on_delete.to_string(), on_update.to_string()),
                    );
                }
            }
        }
        _ => {}
    }

    Ok(map)
}

pub fn compare_foreign_keys_for_table(
    source_rows: &[serde_json::Value],
    target_rows: &[serde_json::Value],
    source_on_delete: &BTreeMap<String, (String, String)>,
    target_on_delete: &BTreeMap<String, (String, String)>,
    table: &str,
) -> Vec<FkDiff> {
    let source = group_foreign_keys(source_rows);
    let target = group_foreign_keys(target_rows);
    let mut results = Vec::new();

    let mut all_names: BTreeSet<String> = BTreeSet::new();
    all_names.extend(source.keys().cloned());
    all_names.extend(target.keys().cloned());

    for name in all_names {
        match (source.get(&name), target.get(&name)) {
            (Some(s), Some(t)) => {
                let mut columns_changed = None;
                let mut referenced_changed = None;
                let mut on_delete_changed = None;
                let mut on_update_changed = None;
                let mut has_diff = false;

                if s.columns != t.columns || s.referenced_columns != t.referenced_columns {
                    columns_changed = Some((s.columns.clone(), t.columns.clone()));
                    has_diff = true;
                }
                if s.referenced_table != t.referenced_table {
                    referenced_changed =
                        Some((s.referenced_table.clone(), t.referenced_table.clone()));
                    has_diff = true;
                }

                let s_on_delete = source_on_delete.get(&name).map(|(d, _)| d.clone());
                let s_on_update = source_on_delete.get(&name).map(|(_, u)| u.clone());
                let t_on_delete = target_on_delete.get(&name).map(|(d, _)| d.clone());
                let t_on_update = target_on_delete.get(&name).map(|(_, u)| u.clone());

                if (s_on_delete.is_some() || t_on_delete.is_some()) && s_on_delete != t_on_delete {
                    on_delete_changed = Some((
                        s_on_delete.unwrap_or_default(),
                        t_on_delete.unwrap_or_default(),
                    ));
                    has_diff = true;
                }
                if (s_on_update.is_some() || t_on_update.is_some()) && s_on_update != t_on_update {
                    on_update_changed = Some((
                        s_on_update.unwrap_or_default(),
                        t_on_update.unwrap_or_default(),
                    ));
                    has_diff = true;
                }

                results.push(FkDiff {
                    name,
                    table: table.to_string(),
                    status: if has_diff {
                        CompareStatus::Modified
                    } else {
                        CompareStatus::Equal
                    },
                    referenced_table: referenced_changed,
                    on_delete: on_delete_changed,
                    on_update: on_update_changed,
                    columns: columns_changed,
                });
            }
            (Some(s), None) => {
                let od = source_on_delete
                    .get(&name)
                    .map(|(d, _)| (d.clone(), String::new()));
                let ou = source_on_delete
                    .get(&name)
                    .map(|(_, u)| (u.clone(), String::new()));
                results.push(FkDiff {
                    name,
                    table: table.to_string(),
                    status: CompareStatus::Missing,
                    referenced_table: Some((s.referenced_table.clone(), String::new())),
                    on_delete: od,
                    on_update: ou,
                    columns: Some((s.columns.clone(), vec![])),
                });
            }
            (None, Some(t)) => {
                let od = target_on_delete
                    .get(&name)
                    .map(|(d, _)| (String::new(), d.clone()));
                let ou = target_on_delete
                    .get(&name)
                    .map(|(_, u)| (String::new(), u.clone()));
                results.push(FkDiff {
                    name,
                    table: table.to_string(),
                    status: CompareStatus::New,
                    referenced_table: Some((String::new(), t.referenced_table.clone())),
                    on_delete: od,
                    on_update: ou,
                    columns: Some((vec![], t.columns.clone())),
                });
            }
            (None, None) => unreachable!(),
        }
    }

    results.sort_by_key(|a| a.name.to_lowercase());
    results
}

pub async fn compare_table_foreign_keys(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    table: &str,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
) -> AppResult<Vec<FkDiff>> {
    let src_rows = source
        .fetch_foreign_keys(table, source_schema.map(str::to_string))
        .await?;
    let tgt_rows = target
        .fetch_foreign_keys(table, target_schema.map(str::to_string))
        .await?;

    let src_on_delete = fetch_on_delete_update(source, table, source_schema).await?;
    let tgt_on_delete = fetch_on_delete_update(target, table, target_schema).await?;

    Ok(compare_foreign_keys_for_table(
        &src_rows,
        &tgt_rows,
        &src_on_delete,
        &tgt_on_delete,
        table,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fk_row_mysql(
        constraint: &str,
        col: &str,
        ref_table: &str,
        ref_col: &str,
    ) -> serde_json::Value {
        json!({
            "constraintName": constraint,
            "columnName": col,
            "referencedTable": ref_table,
            "referencedColumn": ref_col,
        })
    }

    fn fk_row_postgres(
        constraint: &str,
        col: &str,
        ref_table: &str,
        ref_col: &str,
    ) -> serde_json::Value {
        json!({
            "constraint_name": constraint,
            "column_name": col,
            "referenced_table": ref_table,
            "referenced_column": ref_col,
        })
    }

    fn fk_row_sqlserver(
        constraint: &str,
        col: &str,
        ref_table: &str,
        ref_col: &str,
    ) -> serde_json::Value {
        json!({
            "constraintName": constraint,
            "columnName": col,
            "referencedTableName": ref_table,
            "referencedColumnName": ref_col,
        })
    }

    #[test]
    fn equal_single_fk() {
        let src = vec![fk_row_mysql("fk_user_dept", "dept_id", "departments", "id")];
        let tgt = vec![fk_row_mysql("fk_user_dept", "dept_id", "departments", "id")];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn missing_fk() {
        let src = vec![fk_row_mysql("fk_user_dept", "dept_id", "departments", "id")];
        let tgt: Vec<serde_json::Value> = vec![];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Missing);
        assert_eq!(diffs[0].referenced_table.as_ref().unwrap().0, "departments");
    }

    #[test]
    fn new_fk() {
        let src: Vec<serde_json::Value> = vec![];
        let tgt = vec![fk_row_mysql("fk_user_role", "role_id", "roles", "id")];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::New);
        assert_eq!(diffs[0].referenced_table.as_ref().unwrap().1, "roles");
    }

    #[test]
    fn referenced_table_changed() {
        let src = vec![fk_row_mysql("fk_1", "dept_id", "departments", "id")];
        let tgt = vec![fk_row_mysql("fk_1", "dept_id", "divisions", "id")];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert_eq!(
            diffs[0].referenced_table,
            Some(("departments".into(), "divisions".into()))
        );
    }

    #[test]
    fn on_delete_changed() {
        let src = vec![fk_row_mysql("fk_1", "dept_id", "departments", "id")];
        let tgt = vec![fk_row_mysql("fk_1", "dept_id", "departments", "id")];
        let mut src_od = BTreeMap::new();
        src_od.insert("fk_1".into(), ("CASCADE".into(), "NO ACTION".into()));
        let tgt_od = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &src_od, &tgt_od, "users");
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert_eq!(diffs[0].on_delete, Some(("CASCADE".into(), String::new())));
    }

    #[test]
    fn on_update_changed() {
        let src = vec![fk_row_mysql("fk_1", "dept_id", "departments", "id")];
        let tgt = vec![fk_row_mysql("fk_1", "dept_id", "departments", "id")];
        let mut src_od = BTreeMap::new();
        src_od.insert("fk_1".into(), ("NO ACTION".into(), "SET NULL".into()));
        let tgt_od = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &src_od, &tgt_od, "users");
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert_eq!(diffs[0].on_update, Some(("SET NULL".into(), String::new())));
    }

    #[test]
    fn mixed_scenario() {
        let src = vec![
            fk_row_mysql("fk_a", "a_id", "table_a", "id"),
            fk_row_mysql("fk_b", "b_id", "table_b", "id"),
        ];
        let tgt = vec![
            fk_row_mysql("fk_a", "a_id", "table_a", "id"),
            fk_row_mysql("fk_c", "c_id", "table_c", "id"),
        ];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 3);
        let by_name: BTreeMap<_, _> = diffs.iter().map(|d| (d.name.as_str(), &d.status)).collect();
        assert_eq!(by_name["fk_a"], &CompareStatus::Equal);
        assert_eq!(by_name["fk_b"], &CompareStatus::Missing);
        assert_eq!(by_name["fk_c"], &CompareStatus::New);
    }

    #[test]
    fn postgres_field_names_work() {
        let src = vec![fk_row_postgres("fk_p", "user_id", "users", "id")];
        let tgt = vec![fk_row_mysql("fk_p", "user_id", "users", "id")];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "orders");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn sqlserver_field_names_work() {
        let src = vec![fk_row_sqlserver("fk_s", "order_id", "orders", "id")];
        let tgt = vec![fk_row_mysql("fk_s", "order_id", "orders", "id")];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "order_items");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn multi_column_fk() {
        let src = vec![
            fk_row_mysql("fk_mc", "a", "parent", "pa"),
            fk_row_mysql("fk_mc", "b", "parent", "pb"),
        ];
        let tgt = vec![
            fk_row_mysql("fk_mc", "a", "parent", "pa"),
            fk_row_mysql("fk_mc", "b", "parent", "pb"),
        ];
        let empty = BTreeMap::new();
        let diffs = compare_foreign_keys_for_table(&src, &tgt, &empty, &empty, "child");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
        assert!(diffs[0].columns.is_none());
    }
}
