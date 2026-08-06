use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::compare::{ColumnDiffDetail, CompareStatus, ObjectDiff, TableDiff};
use std::collections::{BTreeMap, BTreeSet};

/// Column snapshot used for pure comparison (driver-agnostic).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnInfo {
    pub name: String,
    pub col_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
}

/// Parse a `fetch_columns` JSON row into `ColumnInfo`.
pub fn parse_column(value: &serde_json::Value) -> Option<ColumnInfo> {
    let name = value.get("name")?.as_str()?.to_string();
    let col_type = value
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let nullable = value
        .get("isNullable")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let default_value = value.get("defaultValue").and_then(|v| match v {
        serde_json::Value::Null => None,
        serde_json::Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    });
    Some(ColumnInfo {
        name,
        col_type: normalize_type(&col_type),
        nullable,
        default_value: default_value.map(|d| normalize_default(&d)),
    })
}

/// Normalize type strings so `INT(11)` and `int(11)` compare equal.
fn normalize_type(t: &str) -> String {
    t.trim().to_lowercase()
}

/// Normalize default literals for comparison.
fn normalize_default(d: &str) -> String {
    let s = d.trim();
    // Strip surrounding quotes commonly added by drivers
    if (s.starts_with('\'') && s.ends_with('\'')) || (s.starts_with('"') && s.ends_with('"')) {
        return s[1..s.len() - 1].to_string();
    }
    // MySQL / PG null default variants
    if s.eq_ignore_ascii_case("null") {
        return String::new();
    }
    s.to_string()
}

fn columns_to_map(cols: &[serde_json::Value]) -> BTreeMap<String, ColumnInfo> {
    let mut map = BTreeMap::new();
    for c in cols {
        if let Some(info) = parse_column(c) {
            map.insert(info.name.to_lowercase(), info);
        }
    }
    map
}

/// Pure comparison of two column sets for one table.
pub fn compare_columns(
    source_cols: &[serde_json::Value],
    target_cols: &[serde_json::Value],
) -> TableDiff {
    let source = columns_to_map(source_cols);
    let target = columns_to_map(target_cols);

    let mut names: BTreeSet<String> = BTreeSet::new();
    names.extend(source.keys().cloned());
    names.extend(target.keys().cloned());

    let mut columns = Vec::new();
    for name in names {
        match (source.get(&name), target.get(&name)) {
            (Some(s), Some(t)) => {
                let type_eq = s.col_type == t.col_type;
                let null_eq = s.nullable == t.nullable;
                let def_eq = s.default_value == t.default_value;
                if type_eq && null_eq && def_eq {
                    columns.push(ColumnDiffDetail {
                        name: s.name.clone(),
                        status: CompareStatus::Equal,
                        source_type: Some(s.col_type.clone()),
                        target_type: Some(t.col_type.clone()),
                        source_nullable: Some(s.nullable),
                        target_nullable: Some(t.nullable),
                        source_default: s.default_value.clone(),
                        target_default: t.default_value.clone(),
                    });
                } else {
                    columns.push(ColumnDiffDetail {
                        name: s.name.clone(),
                        status: CompareStatus::Modified,
                        source_type: Some(s.col_type.clone()),
                        target_type: Some(t.col_type.clone()),
                        source_nullable: Some(s.nullable),
                        target_nullable: Some(t.nullable),
                        source_default: s.default_value.clone(),
                        target_default: t.default_value.clone(),
                    });
                }
            }
            (Some(s), None) => {
                columns.push(ColumnDiffDetail {
                    name: s.name.clone(),
                    status: CompareStatus::Missing,
                    source_type: Some(s.col_type.clone()),
                    target_type: None,
                    source_nullable: Some(s.nullable),
                    target_nullable: None,
                    source_default: s.default_value.clone(),
                    target_default: None,
                });
            }
            (None, Some(t)) => {
                columns.push(ColumnDiffDetail {
                    name: t.name.clone(),
                    status: CompareStatus::New,
                    source_type: None,
                    target_type: Some(t.col_type.clone()),
                    source_nullable: None,
                    target_nullable: Some(t.nullable),
                    source_default: None,
                    target_default: t.default_value.clone(),
                });
            }
            (None, None) => unreachable!(),
        }
    }

    let has_diff = columns.iter().any(|c| c.status != CompareStatus::Equal);
    TableDiff {
        status: if has_diff {
            CompareStatus::Modified
        } else {
            CompareStatus::Equal
        },
        columns,
        engine_changed: None,
        charset_changed: None,
        collation_changed: None,
        comment_changed: None,
    }
}

/// Compare table presence + column structure between two drivers.
pub async fn compare_table(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    table: &str,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    exists_in_source: bool,
    exists_in_target: bool,
) -> AppResult<ObjectDiff> {
    match (exists_in_source, exists_in_target) {
        (true, false) => Ok(ObjectDiff {
            name: table.to_string(),
            status: CompareStatus::Missing,
            details: None,
        }),
        (false, true) => Ok(ObjectDiff {
            name: table.to_string(),
            status: CompareStatus::New,
            details: None,
        }),
        (false, false) => Ok(ObjectDiff {
            name: table.to_string(),
            status: CompareStatus::Equal,
            details: None,
        }),
        (true, true) => {
            let src_cols = source
                .fetch_columns(table, source_schema.map(str::to_string))
                .await?;
            let tgt_cols = target
                .fetch_columns(table, target_schema.map(str::to_string))
                .await?;
            let diff = compare_columns(&src_cols, &tgt_cols);
            Ok(ObjectDiff {
                name: table.to_string(),
                status: diff.status.clone(),
                details: Some(serde_json::to_value(&diff).unwrap_or_default()),
            })
        }
    }
}

/// Compare the full table name sets and return per-table ObjectDiffs.
pub async fn compare_tables(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    table_filter: Option<&[String]>,
) -> AppResult<Vec<ObjectDiff>> {
    let mut src_tables = source
        .fetch_tables(source_schema.map(str::to_string), None)
        .await?;
    let mut tgt_tables = target
        .fetch_tables(target_schema.map(str::to_string), None)
        .await?;

    if let Some(filter) = table_filter {
        let set: BTreeSet<String> = filter.iter().map(|t| t.to_lowercase()).collect();
        src_tables.retain(|t| set.contains(&t.to_lowercase()));
        tgt_tables.retain(|t| set.contains(&t.to_lowercase()));
    }

    let src_set: BTreeSet<String> = src_tables.iter().map(|t| t.to_lowercase()).collect();
    let tgt_set: BTreeSet<String> = tgt_tables.iter().map(|t| t.to_lowercase()).collect();

    // Preserve original casing from source when available, else target
    let mut name_map: BTreeMap<String, String> = BTreeMap::new();
    for t in &src_tables {
        name_map.insert(t.to_lowercase(), t.clone());
    }
    for t in &tgt_tables {
        name_map
            .entry(t.to_lowercase())
            .or_insert_with(|| t.clone());
    }

    let mut all_names: BTreeSet<String> = BTreeSet::new();
    all_names.extend(src_set.iter().cloned());
    all_names.extend(tgt_set.iter().cloned());

    let mut results = Vec::new();
    for key in all_names {
        let display = name_map.get(&key).cloned().unwrap_or_else(|| key.clone());
        let diff = compare_table(
            source,
            target,
            &display,
            source_schema,
            target_schema,
            src_set.contains(&key),
            tgt_set.contains(&key),
        )
        .await?;
        results.push(diff);
    }

    results.sort_by_key(|a| a.name.to_lowercase());
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn col(name: &str, typ: &str, nullable: bool, default: Option<&str>) -> serde_json::Value {
        json!({
            "name": name,
            "type": typ,
            "isNullable": nullable,
            "defaultValue": default,
        })
    }

    #[test]
    fn equal_columns() {
        let src = vec![
            col("id", "INT", false, None),
            col("name", "VARCHAR(50)", true, None),
        ];
        let tgt = vec![
            col("id", "int", false, None),
            col("name", "varchar(50)", true, None),
        ];
        let diff = compare_columns(&src, &tgt);
        assert_eq!(diff.status, CompareStatus::Equal);
        assert!(diff
            .columns
            .iter()
            .all(|c| c.status == CompareStatus::Equal));
    }

    #[test]
    fn modified_type() {
        let src = vec![col("id", "INT", false, None)];
        let tgt = vec![col("id", "BIGINT", false, None)];
        let diff = compare_columns(&src, &tgt);
        assert_eq!(diff.status, CompareStatus::Modified);
        assert_eq!(diff.columns[0].status, CompareStatus::Modified);
        assert_eq!(diff.columns[0].source_type.as_deref(), Some("int"));
        assert_eq!(diff.columns[0].target_type.as_deref(), Some("bigint"));
    }

    #[test]
    fn missing_and_new_columns() {
        let src = vec![col("a", "INT", false, None), col("b", "TEXT", true, None)];
        let tgt = vec![col("a", "INT", false, None), col("c", "TEXT", true, None)];
        let diff = compare_columns(&src, &tgt);
        assert_eq!(diff.status, CompareStatus::Modified);
        let by_name: BTreeMap<_, _> = diff
            .columns
            .iter()
            .map(|c| (c.name.as_str(), c.status.clone()))
            .collect();
        assert_eq!(by_name["a"], CompareStatus::Equal);
        assert_eq!(by_name["b"], CompareStatus::Missing);
        assert_eq!(by_name["c"], CompareStatus::New);
    }

    #[test]
    fn nullable_change_is_modified() {
        let src = vec![col("email", "VARCHAR(100)", true, None)];
        let tgt = vec![col("email", "VARCHAR(100)", false, None)];
        let diff = compare_columns(&src, &tgt);
        assert_eq!(diff.columns[0].status, CompareStatus::Modified);
    }

    #[test]
    fn default_normalization() {
        let src = vec![col("flag", "CHAR(1)", true, Some("'Y'"))];
        let tgt = vec![col("flag", "CHAR(1)", true, Some("Y"))];
        let diff = compare_columns(&src, &tgt);
        assert_eq!(diff.columns[0].status, CompareStatus::Equal);
    }

    #[test]
    fn parse_column_handles_null_default() {
        let v = json!({"name": "x", "type": "int", "isNullable": false, "defaultValue": null});
        let info = parse_column(&v).unwrap();
        assert_eq!(info.name, "x");
        assert!(info.default_value.is_none());
    }
}
