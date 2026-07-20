use crate::db::{DbType, DbDriver};
use crate::error::AppResult;
use crate::models::compare::{CompareStatus, ConstraintDiff};
use std::collections::{BTreeMap, BTreeSet};

use super::normalizer::{hash_sql, normalize_sql};

fn get_str(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

fn get_constraint_type(value: &serde_json::Value) -> Option<String> {
    get_str(value, &["type", "constraint_type", "CONSTRAINT_TYPE"])
}

fn is_pk_or_fk(typ: &str) -> bool {
    let upper = typ.to_uppercase();
    upper.contains("PRIMARY") || upper.contains("FOREIGN")
}

fn mysql_check_definitions_query() -> &'static str {
    "SELECT cc.CONSTRAINT_NAME as name, cc.CHECK_CLAUSE as definition \
     FROM information_schema.CHECK_CONSTRAINTS cc \
     JOIN information_schema.TABLE_CONSTRAINTS tc \
       ON cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
       AND cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA \
     WHERE tc.TABLE_NAME = ? AND tc.CONSTRAINT_SCHEMA = IFNULL(?, DATABASE()) \
       AND tc.CONSTRAINT_TYPE = 'CHECK'"
}

fn postgres_check_definitions_query() -> &'static str {
    "SELECT conname as name, pg_get_constraintdef(oid) as definition \
     FROM pg_constraint \
     WHERE conrelid = (SELECT oid FROM pg_class WHERE relname = $1) \
       AND contype = 'c'"
}

async fn fetch_check_definitions(
    driver: &dyn DbDriver,
    table: &str,
    _schema: Option<&str>,
) -> AppResult<BTreeMap<String, String>> {
    let db_type = driver.db_type();
    let mut map = BTreeMap::new();

    let result = match db_type {
        DbType::Mysql | DbType::Mariadb => {
            driver.execute(mysql_check_definitions_query()).await?
        }
        DbType::Postgres => {
            driver.execute_with_schema(postgres_check_definitions_query(), table).await?
        }
        _ => return Ok(map),
    };

    for row in &result.rows {
        if let (Some(name), Some(def)) = (
            row.get("name").and_then(|v| v.as_str()),
            row.get("definition").and_then(|v| v.as_str()),
        ) {
            map.insert(name.to_string(), def.to_string());
        }
    }
    Ok(map)
}

pub fn compare_constraints_for_table(
    source_rows: &[serde_json::Value],
    target_rows: &[serde_json::Value],
    source_defs: &BTreeMap<String, String>,
    target_defs: &BTreeMap<String, String>,
    table: &str,
) -> Vec<ConstraintDiff> {
    let src_map: BTreeMap<String, String> = source_rows
        .iter()
        .filter_map(|v| {
            let name = get_str(v, &["name"])?;
            let typ = get_constraint_type(v)?;
            if is_pk_or_fk(&typ) {
                return None;
            }
            Some((name, typ))
        })
        .collect();

    let tgt_map: BTreeMap<String, String> = target_rows
        .iter()
        .filter_map(|v| {
            let name = get_str(v, &["name"])?;
            let typ = get_constraint_type(v)?;
            if is_pk_or_fk(&typ) {
                return None;
            }
            Some((name, typ))
        })
        .collect();

    let mut all_names: BTreeSet<String> = BTreeSet::new();
    all_names.extend(src_map.keys().cloned());
    all_names.extend(tgt_map.keys().cloned());

    let mut results = Vec::new();
    for name in all_names {
        match (src_map.get(&name), tgt_map.get(&name)) {
            (Some(s_type), Some(t_type)) => {
                let mut has_diff = false;
                let mut definition_changed = None;

                if s_type.to_uppercase() != t_type.to_uppercase() {
                    has_diff = true;
                }

                if s_type.eq_ignore_ascii_case("CHECK") {
                    let src_def = source_defs.get(&name).cloned().unwrap_or_default();
                    let tgt_def = target_defs.get(&name).cloned().unwrap_or_default();
                    let src_hash = hash_sql(&normalize_sql(&src_def));
                    let tgt_hash = hash_sql(&normalize_sql(&tgt_def));
                    if src_hash != tgt_hash && (!src_def.is_empty() || !tgt_def.is_empty()) {
                        definition_changed = Some((src_hash, tgt_hash));
                        has_diff = true;
                    }
                }

                results.push(ConstraintDiff {
                    name,
                    table: table.to_string(),
                    status: if has_diff {
                        CompareStatus::Modified
                    } else {
                        CompareStatus::Equal
                    },
                    constraint_type: Some(s_type.clone()),
                    definition_changed,
                });
            }
            (Some(s_type), None) => {
                results.push(ConstraintDiff {
                    name,
                    table: table.to_string(),
                    status: CompareStatus::Missing,
                    constraint_type: Some(s_type.clone()),
                    definition_changed: None,
                });
            }
            (None, Some(t_type)) => {
                results.push(ConstraintDiff {
                    name,
                    table: table.to_string(),
                    status: CompareStatus::New,
                    constraint_type: Some(t_type.clone()),
                    definition_changed: None,
                });
            }
            (None, None) => unreachable!(),
        }
    }

    results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    results
}

pub async fn compare_table_constraints(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    table: &str,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
) -> AppResult<Vec<ConstraintDiff>> {
    let src_rows = source
        .fetch_constraints(table, source_schema.map(str::to_string))
        .await?;
    let tgt_rows = target
        .fetch_constraints(table, target_schema.map(str::to_string))
        .await?;

    let src_defs = fetch_check_definitions(source, table, source_schema).await?;
    let tgt_defs = fetch_check_definitions(target, table, target_schema).await?;

    Ok(compare_constraints_for_table(
        &src_rows,
        &tgt_rows,
        &src_defs,
        &tgt_defs,
        table,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn constraint_row(name: &str, typ: &str) -> serde_json::Value {
        json!({ "name": name, "type": typ })
    }

    fn constraint_row_alt(name: &str, typ: &str) -> serde_json::Value {
        json!({ "name": name, "constraint_type": typ })
    }

    #[test]
    fn equal_unique_constraints() {
        let src = vec![constraint_row("uq_email", "UNIQUE")];
        let tgt = vec![constraint_row("uq_email", "UNIQUE")];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn missing_constraint() {
        let src = vec![constraint_row("uq_email", "UNIQUE")];
        let tgt: Vec<serde_json::Value> = vec![];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Missing);
    }

    #[test]
    fn new_constraint() {
        let src: Vec<serde_json::Value> = vec![];
        let tgt = vec![constraint_row("uq_name", "UNIQUE")];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::New);
    }

    #[test]
    fn type_changed() {
        let src = vec![constraint_row("chk_1", "CHECK")];
        let tgt = vec![constraint_row("chk_1", "UNIQUE")];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
    }

    #[test]
    fn check_definition_changed() {
        let src = vec![constraint_row("chk_age", "CHECK")];
        let tgt = vec![constraint_row("chk_age", "CHECK")];
        let mut src_defs = BTreeMap::new();
        src_defs.insert("chk_age".into(), "age > 0".into());
        let mut tgt_defs = BTreeMap::new();
        tgt_defs.insert("chk_age".into(), "age >= 18".into());
        let diffs = compare_constraints_for_table(&src, &tgt, &src_defs, &tgt_defs, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert!(diffs[0].definition_changed.is_some());
    }

    #[test]
    fn check_definition_equal() {
        let src = vec![constraint_row("chk_age", "CHECK")];
        let tgt = vec![constraint_row("chk_age", "CHECK")];
        let mut src_defs = BTreeMap::new();
        src_defs.insert("chk_age".into(), "age > 0".into());
        let mut tgt_defs = BTreeMap::new();
        tgt_defs.insert("chk_age".into(), "age > 0".into());
        let diffs = compare_constraints_for_table(&src, &tgt, &src_defs, &tgt_defs, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
        assert!(diffs[0].definition_changed.is_none());
    }

    #[test]
    fn pk_and_fk_excluded() {
        let src = vec![
            constraint_row("PRIMARY", "PRIMARY KEY"),
            constraint_row("fk_dept", "FOREIGN KEY"),
            constraint_row("uq_email", "UNIQUE"),
        ];
        let tgt: Vec<serde_json::Value> = vec![];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].name, "uq_email");
    }

    #[test]
    fn mixed_constraints() {
        let src = vec![
            constraint_row("uq_common", "UNIQUE"),
            constraint_row("uq_old", "UNIQUE"),
        ];
        let tgt = vec![
            constraint_row("uq_common", "UNIQUE"),
            constraint_row("uq_new", "CHECK"),
        ];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 3);
        let by_name: BTreeMap<_, _> = diffs.iter().map(|d| (d.name.as_str(), &d.status)).collect();
        assert_eq!(by_name["uq_common"], &CompareStatus::Equal);
        assert_eq!(by_name["uq_old"], &CompareStatus::Missing);
        assert_eq!(by_name["uq_new"], &CompareStatus::New);
    }

    #[test]
    fn alt_field_names() {
        let src = vec![constraint_row_alt("uq_1", "UNIQUE")];
        let tgt = vec![constraint_row("uq_1", "UNIQUE")];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn case_insensitive_type() {
        let src = vec![constraint_row("chk_1", "check")];
        let tgt = vec![constraint_row("chk_1", "CHECK")];
        let empty = BTreeMap::new();
        let diffs = compare_constraints_for_table(&src, &tgt, &empty, &empty, "users");
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }
}
