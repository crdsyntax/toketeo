use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::compare::{CompareStatus, IndexDiff};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
struct IndexInfo {
    columns: Vec<String>,
    is_unique: bool,
    index_type: String,
}

fn get_str(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

fn get_bool(value: &serde_json::Value, keys: &[&str]) -> bool {
    for key in keys {
        if let Some(v) = value.get(*key) {
            return match v {
                serde_json::Value::Bool(b) => *b,
                serde_json::Value::Number(n) => n.as_i64().unwrap_or(0) == 1,
                _ => false,
            };
        }
    }
    false
}

fn parse_index_row(value: &serde_json::Value) -> Option<(String, String, bool)> {
    let name = get_str(value, &["name"])?;
    let column = get_str(value, &["column", "column_name"]).unwrap_or_default();
    let is_unique = get_bool(value, &["isUnique", "is_unique"]);
    Some((name, column, is_unique))
}

fn group_indexes(rows: &[serde_json::Value]) -> BTreeMap<String, IndexInfo> {
    let mut map: BTreeMap<String, IndexInfo> = BTreeMap::new();
    for row in rows {
        if let Some((name, column, is_unique)) = parse_index_row(row) {
            let index_type = get_str(row, &["type"]).unwrap_or_else(|| "btree".to_string());
            let entry = map.entry(name.clone()).or_insert_with(|| IndexInfo {
                columns: Vec::new(),
                is_unique,
                index_type,
            });
            if !column.is_empty() {
                entry.columns.push(column);
            }
        }
    }
    map
}

pub fn compare_indexes_for_table(
    source_rows: &[serde_json::Value],
    target_rows: &[serde_json::Value],
    table: &str,
) -> Vec<IndexDiff> {
    let source = group_indexes(source_rows);
    let target = group_indexes(target_rows);
    let mut results = Vec::new();

    let mut all_names: BTreeSet<String> = BTreeSet::new();
    all_names.extend(source.keys().cloned());
    all_names.extend(target.keys().cloned());

    for name in all_names {
        match (source.get(&name), target.get(&name)) {
            (Some(s), Some(t)) => {
                let mut columns_changed = None;
                let mut unique_changed = None;
                let mut type_changed = None;
                let mut has_diff = false;

                if s.columns != t.columns {
                    columns_changed = Some((s.columns.clone(), t.columns.clone()));
                    has_diff = true;
                }
                if s.is_unique != t.is_unique {
                    unique_changed = Some((s.is_unique, t.is_unique));
                    has_diff = true;
                }
                if s.index_type.to_lowercase() != t.index_type.to_lowercase() {
                    type_changed = Some((s.index_type.clone(), t.index_type.clone()));
                    has_diff = true;
                }

                results.push(IndexDiff {
                    name,
                    table: table.to_string(),
                    status: if has_diff {
                        CompareStatus::Modified
                    } else {
                        CompareStatus::Equal
                    },
                    columns_changed,
                    unique_changed,
                    type_changed,
                });
            }
            (Some(s), None) => {
                results.push(IndexDiff {
                    name,
                    table: table.to_string(),
                    status: CompareStatus::Missing,
                    columns_changed: Some((s.columns.clone(), vec![])),
                    unique_changed: Some((s.is_unique, false)),
                    type_changed: None,
                });
            }
            (None, Some(t)) => {
                results.push(IndexDiff {
                    name,
                    table: table.to_string(),
                    status: CompareStatus::New,
                    columns_changed: Some((vec![], t.columns.clone())),
                    unique_changed: Some((false, t.is_unique)),
                    type_changed: None,
                });
            }
            (None, None) => unreachable!(),
        }
    }

    results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    results
}

pub async fn compare_table_indexes(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    table: &str,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
) -> AppResult<Vec<IndexDiff>> {
    let src_rows = source
        .fetch_indexes(table, source_schema.map(str::to_string))
        .await?;
    let tgt_rows = target
        .fetch_indexes(table, target_schema.map(str::to_string))
        .await?;
    Ok(compare_indexes_for_table(&src_rows, &tgt_rows, table))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn idx_row(name: &str, column: &str, is_unique: bool, typ: &str) -> serde_json::Value {
        json!({
            "name": name,
            "column": column,
            "isUnique": is_unique,
            "type": typ,
        })
    }

    fn idx_row_alt(name: &str, column: &str, is_unique: bool, typ: &str) -> serde_json::Value {
        json!({
            "name": name,
            "column_name": column,
            "is_unique": is_unique,
            "type": typ,
        })
    }

    #[test]
    fn equal_single_column_index() {
        let src = vec![idx_row("idx_email", "email", true, "btree")];
        let tgt = vec![idx_row("idx_email", "email", true, "btree")];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn equal_multi_column_index() {
        let src = vec![
            idx_row("idx_name_email", "name", false, "btree"),
            idx_row("idx_name_email", "email", false, "btree"),
        ];
        let tgt = vec![
            idx_row("idx_name_email", "name", false, "btree"),
            idx_row("idx_name_email", "email", false, "btree"),
        ];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn missing_index() {
        let src = vec![idx_row("idx_email", "email", true, "btree")];
        let tgt: Vec<serde_json::Value> = vec![];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Missing);
        assert_eq!(diffs[0].columns_changed.as_ref().unwrap().0, vec!["email"]);
        assert!(diffs[0].columns_changed.as_ref().unwrap().1.is_empty());
    }

    #[test]
    fn new_index() {
        let src: Vec<serde_json::Value> = vec![];
        let tgt = vec![idx_row("idx_email", "email", true, "btree")];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::New);
        assert!(diffs[0].columns_changed.as_ref().unwrap().0.is_empty());
        assert_eq!(diffs[0].columns_changed.as_ref().unwrap().1, vec!["email"]);
    }

    #[test]
    fn unique_changed() {
        let src = vec![idx_row("idx_email", "email", true, "btree")];
        let tgt = vec![idx_row("idx_email", "email", false, "btree")];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert_eq!(diffs[0].unique_changed, Some((true, false)));
    }

    #[test]
    fn type_changed() {
        let src = vec![idx_row("idx_email", "email", false, "btree")];
        let tgt = vec![idx_row("idx_email", "email", false, "hash")];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert_eq!(diffs[0].type_changed, Some(("btree".into(), "hash".into())));
    }

    #[test]
    fn columns_order_changed() {
        let src = vec![
            idx_row("idx_ab", "a", false, "btree"),
            idx_row("idx_ab", "b", false, "btree"),
        ];
        let tgt = vec![
            idx_row("idx_ab", "b", false, "btree"),
            idx_row("idx_ab", "a", false, "btree"),
        ];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert_eq!(
            diffs[0].columns_changed,
            Some((vec!["a".into(), "b".into()], vec!["b".into(), "a".into()]))
        );
    }

    #[test]
    fn mixed_scenario() {
        let src = vec![
            idx_row("idx_email", "email", true, "btree"),
            idx_row("idx_old", "created_at", false, "btree"),
        ];
        let tgt = vec![
            idx_row("idx_email", "email", false, "btree"),
            idx_row("idx_new", "name", true, "hash"),
        ];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs.len(), 3);
        let by_name: BTreeMap<_, _> = diffs.iter().map(|d| (d.name.as_str(), &d.status)).collect();
        assert_eq!(by_name["idx_email"], &CompareStatus::Modified);
        assert_eq!(by_name["idx_old"], &CompareStatus::Missing);
        assert_eq!(by_name["idx_new"], &CompareStatus::New);
    }

    #[test]
    fn type_comparison_is_case_insensitive() {
        let src = vec![idx_row("idx_foo", "id", false, "BTREE")];
        let tgt = vec![idx_row("idx_foo", "id", false, "btree")];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn group_indexes_combines_multi_column() {
        let rows = vec![
            idx_row("idx_abc", "a", false, "btree"),
            idx_row("idx_abc", "b", false, "btree"),
            idx_row("idx_abc", "c", false, "btree"),
        ];
        let grouped = group_indexes(&rows);
        assert_eq!(grouped.len(), 1);
        assert_eq!(grouped["idx_abc"].columns, vec!["a", "b", "c"]);
    }

    #[test]
    fn alt_field_names_work() {
        let src = vec![idx_row_alt("idx_x", "email", true, "btree")];
        let tgt = vec![idx_row("idx_x", "email", true, "btree")];
        let diffs = compare_indexes_for_table(&src, &tgt, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }
}
