use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::compare::{CompareStatus, ObjectDiff};
use std::collections::{BTreeMap, BTreeSet};

use super::normalizer::{hash_sql, normalize_sql};

fn compute_routine_hashes(
    names: &[String],
    ddl_cache: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    let mut hashes = BTreeMap::new();
    for name in names {
        let key = name.to_lowercase();
        if let Some(ddl) = ddl_cache.get(name.as_str()) {
            let normalized = normalize_sql(ddl);
            hashes.insert(key, hash_sql(&normalized));
        } else {
            hashes.insert(key, String::new());
        }
    }
    hashes
}

fn compare_routine_names(
    source_names: &[String],
    target_names: &[String],
    source_hashes: &BTreeMap<String, String>,
    target_hashes: &BTreeMap<String, String>,
) -> Vec<ObjectDiff> {
    let src_set: BTreeSet<String> = source_names.iter().map(|v| v.to_lowercase()).collect();
    let tgt_set: BTreeSet<String> = target_names.iter().map(|v| v.to_lowercase()).collect();

    let mut name_map: BTreeMap<String, String> = BTreeMap::new();
    for v in source_names {
        name_map.insert(v.to_lowercase(), v.clone());
    }
    for v in target_names {
        name_map.entry(v.to_lowercase()).or_insert_with(|| v.clone());
    }

    let mut all_keys: BTreeSet<String> = BTreeSet::new();
    all_keys.extend(src_set.iter().cloned());
    all_keys.extend(tgt_set.iter().cloned());

    let mut results = Vec::new();
    for key in all_keys {
        let display = name_map.get(&key).cloned().unwrap_or_else(|| key.clone());
        let in_source = src_set.contains(&key);
        let in_target = tgt_set.contains(&key);

        match (in_source, in_target) {
            (true, false) => {
                results.push(ObjectDiff {
                    name: display,
                    status: CompareStatus::Missing,
                    details: None,
                });
            }
            (false, true) => {
                results.push(ObjectDiff {
                    name: display,
                    status: CompareStatus::New,
                    details: None,
                });
            }
            (true, true) => {
                let src_hash = source_hashes.get(&key).cloned().unwrap_or_default();
                let tgt_hash = target_hashes.get(&key).cloned().unwrap_or_default();
                let is_modified = src_hash != tgt_hash;
                let status = if is_modified {
                    CompareStatus::Modified
                } else {
                    CompareStatus::Equal
                };
                results.push(ObjectDiff {
                    name: display,
                    status,
                    details: if is_modified {
                        Some(serde_json::json!({
                            "source_hash": src_hash,
                            "target_hash": tgt_hash,
                        }))
                    } else {
                        None
                    },
                });
            }
            (false, false) => unreachable!(),
        }
    }

    results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    results
}

async fn fetch_routine_ddls(
    driver: &dyn DbDriver,
    names: &[String],
    routine_type: &str,
    schema: Option<&str>,
) -> AppResult<BTreeMap<String, String>> {
    let mut cache = BTreeMap::new();
    for name in names {
        match driver
            .fetch_ddl(name, routine_type, schema.map(str::to_string))
            .await
        {
            Ok(ddl) => {
                cache.insert(name.clone(), ddl);
            }
            Err(_) => {
                cache.insert(name.clone(), String::new());
            }
        }
    }
    Ok(cache)
}

pub async fn compare_procedures(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    filter: Option<&[String]>,
) -> AppResult<Vec<ObjectDiff>> {
    let mut src_procs = source
        .fetch_procedures(source_schema.map(str::to_string), None)
        .await?;
    let mut tgt_procs = target
        .fetch_procedures(target_schema.map(str::to_string), None)
        .await?;

    if let Some(f) = filter {
        let set: BTreeSet<String> = f.iter().map(|v| v.to_lowercase()).collect();
        src_procs.retain(|v| set.contains(&v.to_lowercase()));
        tgt_procs.retain(|v| set.contains(&v.to_lowercase()));
    }

    let all_names: BTreeSet<String> = src_procs.iter().chain(tgt_procs.iter()).cloned().collect();
    let names_vec: Vec<String> = all_names.into_iter().collect();

    let src_ddls = fetch_routine_ddls(source, &names_vec, "PROCEDURE", source_schema).await?;
    let tgt_ddls = fetch_routine_ddls(target, &names_vec, "PROCEDURE", target_schema).await?;

    let src_hashes = compute_routine_hashes(&src_procs, &src_ddls);
    let tgt_hashes = compute_routine_hashes(&tgt_procs, &tgt_ddls);

    Ok(compare_routine_names(
        &src_procs,
        &tgt_procs,
        &src_hashes,
        &tgt_hashes,
    ))
}

pub async fn compare_functions(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    filter: Option<&[String]>,
) -> AppResult<Vec<ObjectDiff>> {
    let mut src_funcs = source
        .fetch_functions(source_schema.map(str::to_string), None)
        .await?;
    let mut tgt_funcs = target
        .fetch_functions(target_schema.map(str::to_string), None)
        .await?;

    if let Some(f) = filter {
        let set: BTreeSet<String> = f.iter().map(|v| v.to_lowercase()).collect();
        src_funcs.retain(|v| set.contains(&v.to_lowercase()));
        tgt_funcs.retain(|v| set.contains(&v.to_lowercase()));
    }

    let all_names: BTreeSet<String> = src_funcs.iter().chain(tgt_funcs.iter()).cloned().collect();
    let names_vec: Vec<String> = all_names.into_iter().collect();

    let src_ddls = fetch_routine_ddls(source, &names_vec, "FUNCTION", source_schema).await?;
    let tgt_ddls = fetch_routine_ddls(target, &names_vec, "FUNCTION", target_schema).await?;

    let src_hashes = compute_routine_hashes(&src_funcs, &src_ddls);
    let tgt_hashes = compute_routine_hashes(&tgt_funcs, &tgt_ddls);

    Ok(compare_routine_names(
        &src_funcs,
        &tgt_funcs,
        &src_hashes,
        &tgt_hashes,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(name: &str) -> String {
        name.to_string()
    }

    #[test]
    fn equal_procedures() {
        let names = vec![proc("sp_get_user")];
        let mut src_h = BTreeMap::new();
        src_h.insert("sp_get_user".into(), "abc123".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("sp_get_user".into(), "abc123".into());
        let diffs = compare_routine_names(&names, &names, &src_h, &tgt_h);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn modified_procedure() {
        let names = vec![proc("sp_get_user")];
        let mut src_h = BTreeMap::new();
        src_h.insert("sp_get_user".into(), "aaa".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("sp_get_user".into(), "bbb".into());
        let diffs = compare_routine_names(&names, &names, &src_h, &tgt_h);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert!(diffs[0].details.is_some());
    }

    #[test]
    fn missing_procedure() {
        let src = vec![proc("sp_old")];
        let tgt: Vec<String> = vec![];
        let src_h = BTreeMap::new();
        let tgt_h = BTreeMap::new();
        let diffs = compare_routine_names(&src, &tgt, &src_h, &tgt_h);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Missing);
    }

    #[test]
    fn new_procedure() {
        let src: Vec<String> = vec![];
        let tgt = vec![proc("sp_new")];
        let src_h = BTreeMap::new();
        let tgt_h = BTreeMap::new();
        let diffs = compare_routine_names(&src, &tgt, &src_h, &tgt_h);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::New);
    }

    #[test]
    fn mixed_routines() {
        let src = vec![proc("sp_common"), proc("sp_old")];
        let tgt = vec![proc("sp_common"), proc("sp_new")];
        let mut src_h = BTreeMap::new();
        src_h.insert("sp_common".into(), "hash1".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("sp_common".into(), "hash1".into());
        let diffs = compare_routine_names(&src, &tgt, &src_h, &tgt_h);
        assert_eq!(diffs.len(), 3);
        let by_name: BTreeMap<_, _> = diffs.iter().map(|d| (d.name.as_str(), &d.status)).collect();
        assert_eq!(by_name["sp_common"], &CompareStatus::Equal);
        assert_eq!(by_name["sp_old"], &CompareStatus::Missing);
        assert_eq!(by_name["sp_new"], &CompareStatus::New);
    }

    #[test]
    fn compute_hashes_normalizes() {
        let names = vec![proc("fn_calc")];
        let mut ddl_cache = BTreeMap::new();
        ddl_cache.insert(
            "fn_calc".into(),
            "CREATE FUNCTION fn_calc() RETURNS INT BEGIN RETURN 1; END".into(),
        );
        let hashes = compute_routine_hashes(&names, &ddl_cache);
        assert!(!hashes["fn_calc"].is_empty());
    }

    #[test]
    fn compute_hashes_empty_cache() {
        let names = vec![proc("fn_missing")];
        let ddl_cache = BTreeMap::new();
        let hashes = compute_routine_hashes(&names, &ddl_cache);
        assert!(hashes["fn_missing"].is_empty());
    }

    #[test]
    fn case_insensitive_comparison() {
        let src = vec![proc("SP_GET_USER")];
        let tgt = vec![proc("sp_get_user")];
        let mut src_h = BTreeMap::new();
        src_h.insert("sp_get_user".into(), "hash1".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("sp_get_user".into(), "hash1".into());
        let diffs = compare_routine_names(&src, &tgt, &src_h, &tgt_h);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }
}
