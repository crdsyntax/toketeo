use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::compare::{CompareStatus, ObjectDiff};
use regex::Regex;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

use super::normalizer::{hash_sql, normalize_sql};

fn re_trigger_header() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)CREATE\s+TRIGGER\s+\S+\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE)",
        )
        .unwrap()
    })
}

fn parse_trigger_ddl(ddl: &str) -> (String, String, String) {
    if let Some(caps) = re_trigger_header().captures(ddl) {
        let timing = caps
            .get(1)
            .map(|m| m.as_str().to_uppercase())
            .unwrap_or_default();
        let event = caps
            .get(2)
            .map(|m| m.as_str().to_uppercase())
            .unwrap_or_default();
        let body_hash = hash_sql(&normalize_sql(ddl));
        (timing, event, body_hash)
    } else {
        let body_hash = hash_sql(&normalize_sql(ddl));
        (String::new(), String::new(), body_hash)
    }
}

fn compare_trigger_names(
    source_names: &[String],
    target_names: &[String],
    source_triggers: &BTreeMap<String, (String, String, String)>,
    target_triggers: &BTreeMap<String, (String, String, String)>,
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
                let s = source_triggers.get(&key);
                let t = target_triggers.get(&key);

                let mut has_diff = false;
                let mut details = serde_json::Map::new();

                if let (Some(s_info), Some(t_info)) = (s, t) {
                    if s_info.0 != t_info.0 {
                        details.insert(
                            "timing_changed".into(),
                            serde_json::json!([s_info.0, t_info.0]),
                        );
                        has_diff = true;
                    }
                    if s_info.1 != t_info.1 {
                        details.insert(
                            "event_changed".into(),
                            serde_json::json!([s_info.1, t_info.1]),
                        );
                        has_diff = true;
                    }
                    if s_info.2 != t_info.2 {
                        details.insert(
                            "body_hash_changed".into(),
                            serde_json::json!([s_info.2, t_info.2]),
                        );
                        has_diff = true;
                    }
                }

                let status = if has_diff {
                    CompareStatus::Modified
                } else {
                    CompareStatus::Equal
                };

                results.push(ObjectDiff {
                    name: display,
                    status,
                    details: if details.is_empty() {
                        None
                    } else {
                        Some(serde_json::Value::Object(details))
                    },
                });
            }
            (false, false) => unreachable!(),
        }
    }

    results.sort_by_key(|a| a.name.to_lowercase());
    results
}

pub async fn fetch_trigger_infos(
    driver: &dyn DbDriver,
    names: &[String],
    schema: Option<&str>,
) -> AppResult<(
    BTreeMap<String, (String, String, String)>,
    BTreeMap<String, String>,
)> {
    let mut map = BTreeMap::new();
    let mut ddls = BTreeMap::new();
    for name in names {
        match driver
            .fetch_ddl(name, "TRIGGER", schema.map(str::to_string))
            .await
        {
            Ok(ddl) => {
                let info = parse_trigger_ddl(&ddl);
                map.insert(name.to_lowercase(), info);
                ddls.insert(name.clone(), ddl);
            }
            Err(_) => {
                map.insert(
                    name.to_lowercase(),
                    (String::new(), String::new(), String::new()),
                );
                ddls.insert(name.clone(), String::new());
            }
        }
    }
    Ok((map, ddls))
}

pub async fn compare_triggers(
    source: &dyn DbDriver,
    target: &dyn DbDriver,
    source_schema: Option<&str>,
    target_schema: Option<&str>,
    filter: Option<&[String]>,
) -> AppResult<Vec<ObjectDiff>> {
    let mut src_triggers = source
        .fetch_triggers(source_schema.map(str::to_string), None)
        .await?;
    let mut tgt_triggers = target
        .fetch_triggers(target_schema.map(str::to_string), None)
        .await?;

    if let Some(f) = filter {
        let set: BTreeSet<String> = f.iter().map(|v| v.to_lowercase()).collect();
        src_triggers.retain(|v| set.contains(&v.to_lowercase()));
        tgt_triggers.retain(|v| set.contains(&v.to_lowercase()));
    }

    let all_names: BTreeSet<String> = src_triggers
        .iter()
        .chain(tgt_triggers.iter())
        .cloned()
        .collect();
    let names_vec: Vec<String> = all_names.into_iter().collect();

    let (src_infos, src_ddls) = fetch_trigger_infos(source, &names_vec, source_schema).await?;
    let (tgt_infos, _tgt_ddls) = fetch_trigger_infos(target, &names_vec, target_schema).await?;

    let mut results = compare_trigger_names(&src_triggers, &tgt_triggers, &src_infos, &tgt_infos);

    // Attach DDL to results
    for r in &mut results {
        if (r.status == CompareStatus::Missing || r.status == CompareStatus::Modified)
            && r.details.is_none()
        {
            if let Some(ddl) = src_ddls.get(&r.name) {
                if !ddl.is_empty() {
                    r.details = Some(serde_json::json!({ "source_definition": ddl }));
                }
            }
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trigger_name(name: &str) -> String {
        name.to_string()
    }

    #[test]
    fn parse_before_insert() {
        let ddl = "CREATE TRIGGER trg_audit BEFORE INSERT ON users FOR EACH ROW BEGIN SET NEW.created_at = NOW(); END";
        let (timing, event, body_hash) = parse_trigger_ddl(ddl);
        assert_eq!(timing, "BEFORE");
        assert_eq!(event, "INSERT");
        assert!(!body_hash.is_empty());
    }

    #[test]
    fn parse_after_update() {
        let ddl = "CREATE TRIGGER trg_update AFTER UPDATE ON orders FOR EACH ROW BEGIN UPDATE stats SET count = count + 1; END";
        let (timing, event, _hash) = parse_trigger_ddl(ddl);
        assert_eq!(timing, "AFTER");
        assert_eq!(event, "UPDATE");
    }

    #[test]
    fn parse_after_delete() {
        let ddl = "CREATE TRIGGER trg_del AFTER DELETE ON items FOR EACH ROW BEGIN DELETE FROM logs WHERE item_id = OLD.id; END";
        let (timing, event, _hash) = parse_trigger_ddl(ddl);
        assert_eq!(timing, "AFTER");
        assert_eq!(event, "DELETE");
    }

    #[test]
    fn parse_insteadof() {
        let ddl = "CREATE TRIGGER trgInsteadOf INSTEAD OF INSERT ON v_summary FOR EACH ROW BEGIN SELECT 1; END";
        let (timing, event, _hash) = parse_trigger_ddl(ddl);
        assert_eq!(timing, "INSTEAD OF");
        assert_eq!(event, "INSERT");
    }

    #[test]
    fn equal_triggers() {
        let names = vec![trigger_name("trg_audit")];
        let mut src = BTreeMap::new();
        src.insert(
            "trg_audit".into(),
            ("BEFORE".into(), "INSERT".into(), "h1".into()),
        );
        let mut tgt = BTreeMap::new();
        tgt.insert(
            "trg_audit".into(),
            ("BEFORE".into(), "INSERT".into(), "h1".into()),
        );
        let diffs = compare_trigger_names(&names, &names, &src, &tgt);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Equal);
    }

    #[test]
    fn timing_changed() {
        let names = vec![trigger_name("trg_1")];
        let mut src = BTreeMap::new();
        src.insert(
            "trg_1".into(),
            ("BEFORE".into(), "INSERT".into(), "h".into()),
        );
        let mut tgt = BTreeMap::new();
        tgt.insert(
            "trg_1".into(),
            ("AFTER".into(), "INSERT".into(), "h".into()),
        );
        let diffs = compare_trigger_names(&names, &names, &src, &tgt);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        let d = diffs[0].details.as_ref().unwrap();
        assert!(d.get("timing_changed").is_some());
    }

    #[test]
    fn event_changed() {
        let names = vec![trigger_name("trg_1")];
        let mut src = BTreeMap::new();
        src.insert(
            "trg_1".into(),
            ("AFTER".into(), "INSERT".into(), "h".into()),
        );
        let mut tgt = BTreeMap::new();
        tgt.insert(
            "trg_1".into(),
            ("AFTER".into(), "UPDATE".into(), "h".into()),
        );
        let diffs = compare_trigger_names(&names, &names, &src, &tgt);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        let d = diffs[0].details.as_ref().unwrap();
        assert!(d.get("event_changed").is_some());
    }

    #[test]
    fn body_hash_changed() {
        let names = vec![trigger_name("trg_1")];
        let mut src = BTreeMap::new();
        src.insert(
            "trg_1".into(),
            ("AFTER".into(), "INSERT".into(), "aaa".into()),
        );
        let mut tgt = BTreeMap::new();
        tgt.insert(
            "trg_1".into(),
            ("AFTER".into(), "INSERT".into(), "bbb".into()),
        );
        let diffs = compare_trigger_names(&names, &names, &src, &tgt);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        let d = diffs[0].details.as_ref().unwrap();
        assert!(d.get("body_hash_changed").is_some());
    }

    #[test]
    fn missing_trigger() {
        let src = vec![trigger_name("trg_old")];
        let tgt: Vec<String> = vec![];
        let src_t = BTreeMap::new();
        let tgt_t = BTreeMap::new();
        let diffs = compare_trigger_names(&src, &tgt, &src_t, &tgt_t);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::Missing);
    }

    #[test]
    fn new_trigger() {
        let src: Vec<String> = vec![];
        let tgt = vec![trigger_name("trg_new")];
        let src_t = BTreeMap::new();
        let tgt_t = BTreeMap::new();
        let diffs = compare_trigger_names(&src, &tgt, &src_t, &tgt_t);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, CompareStatus::New);
    }

    #[test]
    fn mixed_triggers() {
        let src = vec![trigger_name("trg_common"), trigger_name("trg_old")];
        let tgt = vec![trigger_name("trg_common"), trigger_name("trg_new")];
        let mut src_t = BTreeMap::new();
        src_t.insert(
            "trg_common".into(),
            ("AFTER".into(), "INSERT".into(), "h1".into()),
        );
        let mut tgt_t = BTreeMap::new();
        tgt_t.insert(
            "trg_common".into(),
            ("AFTER".into(), "INSERT".into(), "h1".into()),
        );
        let diffs = compare_trigger_names(&src, &tgt, &src_t, &tgt_t);
        assert_eq!(diffs.len(), 3);
        let by_name: BTreeMap<_, _> = diffs.iter().map(|d| (d.name.as_str(), &d.status)).collect();
        assert_eq!(by_name["trg_common"], &CompareStatus::Equal);
        assert_eq!(by_name["trg_old"], &CompareStatus::Missing);
        assert_eq!(by_name["trg_new"], &CompareStatus::New);
    }

    #[test]
    fn multiple_changes_combined() {
        let names = vec![trigger_name("trg_1")];
        let mut src = BTreeMap::new();
        src.insert(
            "trg_1".into(),
            ("BEFORE".into(), "INSERT".into(), "aaa".into()),
        );
        let mut tgt = BTreeMap::new();
        tgt.insert(
            "trg_1".into(),
            ("AFTER".into(), "UPDATE".into(), "bbb".into()),
        );
        let diffs = compare_trigger_names(&names, &names, &src, &tgt);
        assert_eq!(diffs[0].status, CompareStatus::Modified);
        let d = diffs[0].details.as_ref().unwrap();
        assert!(d.get("timing_changed").is_some());
        assert!(d.get("event_changed").is_some());
        assert!(d.get("body_hash_changed").is_some());
    }
}
