use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::compare::{CompareStatus, ObjectDiff};
use std::collections::{BTreeMap, BTreeSet};

use super::normalizer::{hash_sql, normalize_sql};

pub fn compare_views_for_names(
    source_names: &[String],
    target_names: &[String],
    source_hashes: &BTreeMap<String, String>,
    target_hashes: &BTreeMap<String, String>,
    source_ddls: &BTreeMap<String, String>,
    target_ddls: &BTreeMap<String, String>,
) -> Vec<ObjectDiff> {
    let src_set: BTreeSet<String> = source_names.iter().map(|v| v.to_lowercase()).collect();
    let tgt_set: BTreeSet<String> = target_names.iter().map(|v| v.to_lowercase()).collect();

    let mut name_map: BTreeMap<String, String> = BTreeMap::new();
    for v in source_names {
        name_map.insert(v.to_lowercase(), v.clone());
    }
    for v in target_names {
        name_map
            .entry(v.to_lowercase())
            .or_insert_with(|| v.clone());
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
                    name: display.clone(),
                    status: CompareStatus::Missing,
                    details: source_ddls.get(&display).map(|ddl| {
                        serde_json::json!({
                            "source_definition": ddl,
                        })
                    }),
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
                let src_ddl = source_ddls.get(&display).cloned().unwrap_or_default();
                let tgt_ddl = target_ddls.get(&display).cloned().unwrap_or_default();
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
                            "source_definition": src_ddl,
                            "target_definition": tgt_ddl,
                        }))
                    } else {
                        None
                    },
                });
            }
            (false, false) => unreachable!(),
        }
    }

    results.sort_by_key(|a| a.name.to_lowercase());
    results
}

pub fn compute_hashes(
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

pub async fn fetch_view_ddls(
    driver: &dyn DbDriver,
    names: &[String],
    schema: Option<&str>,
) -> AppResult<BTreeMap<String, String>> {
    let mut cache = BTreeMap::new();
    for name in names {
        match driver
            .fetch_ddl(name, "VIEW", schema.map(str::to_string))
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

pub async fn compare_views(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    view_filter: Option<&[String]>,
) -> AppResult<Vec<ObjectDiff>> {
    let mut src_views = source
        .fetch_views(source_schema.map(str::to_string), None)
        .await?;
    let mut tgt_views = target
        .fetch_views(target_schema.map(str::to_string), None)
        .await?;

    if let Some(filter) = view_filter {
        let set: BTreeSet<String> = filter.iter().map(|v| v.to_lowercase()).collect();
        src_views.retain(|v| set.contains(&v.to_lowercase()));
        tgt_views.retain(|v| set.contains(&v.to_lowercase()));
    }

    let all_names: BTreeSet<String> = src_views.iter().chain(tgt_views.iter()).cloned().collect();
    let names_vec: Vec<String> = all_names.into_iter().collect();

    let src_ddls = fetch_view_ddls(source, &names_vec, source_schema).await?;
    let tgt_ddls = fetch_view_ddls(target, &names_vec, target_schema).await?;

    let src_hashes = compute_hashes(&src_views, &src_ddls);
    let tgt_hashes = compute_hashes(&tgt_views, &tgt_ddls);

    Ok(compare_views_for_names(
        &src_views,
        &tgt_views,
        &src_hashes,
        &tgt_hashes,
        &src_ddls,
        &tgt_ddls,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_views() {
        let names = vec!["v_active".into()];
        let mut src_h = BTreeMap::new();
        src_h.insert("v_active".into(), "abc123".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("v_active".into(), "abc123".into());
        let diffs = compare_views_for_names(
            &names,
            &names,
            &src_h,
            &tgt_h,
            &BTreeMap::new(),
            &BTreeMap::new(),
        );
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn modified_view() {
        let names = vec!["v_active".into()];
        let mut src_h = BTreeMap::new();
        src_h.insert("v_active".into(), "aaa".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("v_active".into(), "bbb".into());
        let mut src_ddls = BTreeMap::new();
        src_ddls.insert("v_active".into(), "CREATE VIEW v_active AS SELECT 1".into());
        let mut tgt_ddls = BTreeMap::new();
        tgt_ddls.insert("v_active".into(), "CREATE VIEW v_active AS SELECT 2".into());
        let diffs = compare_views_for_names(&names, &names, &src_h, &tgt_h, &src_ddls, &tgt_ddls);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        assert!(diffs[0].details.is_some());
    }

    #[test]
    fn missing_view() {
        let src = vec!["v_old".into()];
        let tgt: Vec<String> = vec![];
        let src_h = BTreeMap::new();
        let tgt_h = BTreeMap::new();
        let diffs = compare_views_for_names(
            &src,
            &tgt,
            &src_h,
            &tgt_h,
            &BTreeMap::new(),
            &BTreeMap::new(),
        );
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Missing);
    }

    #[test]
    fn new_view() {
        let src: Vec<String> = vec![];
        let tgt = vec!["v_new".into()];
        let src_h = BTreeMap::new();
        let tgt_h = BTreeMap::new();
        let diffs = compare_views_for_names(
            &src,
            &tgt,
            &src_h,
            &tgt_h,
            &BTreeMap::new(),
            &BTreeMap::new(),
        );
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::New);
    }

    #[test]
    fn mixed_views() {
        let src = vec!["v_common".into(), "v_old".into()];
        let tgt = vec!["v_common".into(), "v_new".into()];
        let mut src_h = BTreeMap::new();
        src_h.insert("v_common".into(), "hash1".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("v_common".into(), "hash1".into());
        let diffs = compare_views_for_names(
            &src,
            &tgt,
            &src_h,
            &tgt_h,
            &BTreeMap::new(),
            &BTreeMap::new(),
        );
        assert_eq!(diffs.len(), 3);
        let by_name: BTreeMap<_, _> = diffs.iter().map(|d| (d.name.as_str(), &d.status)).collect();
        assert_eq!(by_name["v_common"], &CompareStatus::Equal);
        assert_eq!(by_name["v_old"], &CompareStatus::Missing);
        assert_eq!(by_name["v_new"], &CompareStatus::New);
    }

    #[test]
    fn compute_hashes_normalizes_and_hashes() {
        let names = vec!["v1".into()];
        let mut ddl_cache = BTreeMap::new();
        ddl_cache.insert("v1".into(), "CREATE VIEW v1 AS SELECT 1".into());
        let hashes = compute_hashes(&names, &ddl_cache);
        assert!(!hashes["v1"].is_empty());
    }

    #[test]
    fn compute_hashes_empty_ddl() {
        let names = vec!["v1".into()];
        let ddl_cache = BTreeMap::new();
        let hashes = compute_hashes(&names, &ddl_cache);
        assert!(hashes["v1"].is_empty());
    }

    #[test]
    fn case_insensitive_comparison() {
        let src = vec!["V_ACTIVE".into()];
        let tgt = vec!["v_active".into()];
        let mut src_h = BTreeMap::new();
        src_h.insert("v_active".into(), "hash1".into());
        let mut tgt_h = BTreeMap::new();
        tgt_h.insert("v_active".into(), "hash1".into());
        let diffs = compare_views_for_names(
            &src,
            &tgt,
            &src_h,
            &tgt_h,
            &BTreeMap::new(),
            &BTreeMap::new(),
        );
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }
}
