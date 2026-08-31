use crate::models::compare::{CompareStatus, RowColumnDiff, TableDataDiff};
use std::collections::HashMap;

pub fn build_data_report(
    table: &str,
    pk_columns: Vec<String>,
    source_hashes: HashMap<String, String>,
    target_hashes: HashMap<String, String>,
    column_diffs: Vec<RowColumnDiff>,
    source_only_rows: Vec<RowColumnDiff>,
    target_only_rows: Vec<RowColumnDiff>,
    source_count: u64,
    target_count: u64,
) -> TableDataDiff {
    let only_in_source: u64 = source_hashes
        .keys()
        .filter(|k| !target_hashes.contains_key(*k))
        .count() as u64;
    let only_in_target: u64 = target_hashes
        .keys()
        .filter(|k| !source_hashes.contains_key(*k))
        .count() as u64;
    let modified: u64 = source_hashes
        .iter()
        .filter(|(k, h)| target_hashes.get(*k).map(|th| th != *h).unwrap_or(false))
        .count() as u64;
    let equal = source_hashes.len() as u64 - modified - only_in_source;

    let status = if only_in_source == 0 && only_in_target == 0 && modified == 0 {
        CompareStatus::Equal
    } else {
        CompareStatus::Modified
    };

    TableDataDiff {
        table: table.to_string(),
        status,
        source_count,
        target_count,
        rows_equal: equal,
        rows_modified: modified,
        rows_only_in_source: only_in_source,
        rows_only_in_target: only_in_target,
        pk_columns,
        column_diffs,
        source_only_rows,
        target_only_rows,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn equal_tables() {
        let mut src = HashMap::new();
        src.insert("1".into(), "hash_a".into());
        src.insert("2".into(), "hash_b".into());
        let mut tgt = HashMap::new();
        tgt.insert("1".into(), "hash_a".into());
        tgt.insert("2".into(), "hash_b".into());

        let report = build_data_report(
            "users",
            vec!["id".into()],
            src,
            tgt,
            vec![],
            vec![],
            vec![],
            2,
            2,
        );
        assert_eq!(report.status, CompareStatus::Equal);
        assert_eq!(report.rows_equal, 2);
    }

    #[test]
    fn modified_rows() {
        let mut src = HashMap::new();
        src.insert("1".into(), "hash_a".into());
        src.insert("2".into(), "hash_b".into());
        let mut tgt = HashMap::new();
        tgt.insert("1".into(), "hash_a_changed".into());
        tgt.insert("2".into(), "hash_b".into());

        let report = build_data_report(
            "users",
            vec!["id".into()],
            src,
            tgt,
            vec![],
            vec![],
            vec![],
            2,
            2,
        );
        assert_eq!(report.status, CompareStatus::Modified);
        assert_eq!(report.rows_equal, 1);
        assert_eq!(report.rows_modified, 1);
    }

    #[test]
    fn missing_and_new_rows() {
        let mut src = HashMap::new();
        src.insert("1".into(), "hash_a".into());
        src.insert("2".into(), "hash_b".into());
        let mut tgt = HashMap::new();
        tgt.insert("2".into(), "hash_b".into());
        tgt.insert("3".into(), "hash_c".into());

        let report = build_data_report(
            "users",
            vec!["id".into()],
            src,
            tgt,
            vec![],
            vec![],
            vec![],
            2,
            2,
        );
        assert_eq!(report.status, CompareStatus::Modified);
        assert_eq!(report.rows_equal, 1);
        assert_eq!(report.rows_only_in_source, 1);
        assert_eq!(report.rows_only_in_target, 1);
    }

    #[test]
    fn empty_tables() {
        let src = HashMap::new();
        let tgt = HashMap::new();
        let report = build_data_report(
            "users",
            vec!["id".into()],
            src,
            tgt,
            vec![],
            vec![],
            vec![],
            0,
            0,
        );
        assert_eq!(report.status, CompareStatus::Equal);
    }
}
