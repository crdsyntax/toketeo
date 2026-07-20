use serde::{Deserialize, Serialize};

// ============================================================
// Schema Compare Types
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CompareStatus {
    Equal,
    Modified,
    Missing,
    New,
}

/// Full schema comparison report.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SchemaReport {
    pub source_name: String,
    pub target_name: String,
    pub compared_at: String,
    pub tables: Vec<ObjectDiff>,
    pub views: Vec<ObjectDiff>,
    pub procedures: Vec<ObjectDiff>,
    pub functions: Vec<ObjectDiff>,
    pub triggers: Vec<ObjectDiff>,
    pub indexes: Vec<IndexDiff>,
    pub foreign_keys: Vec<FkDiff>,
    pub constraints: Vec<ConstraintDiff>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

/// Generic schema object difference.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ObjectDiff {
    pub name: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// Detailed table difference (columns + metadata).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDiff {
    pub status: CompareStatus,
    pub columns: Vec<ColumnDiffDetail>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub charset_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collation_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment_changed: Option<(String, String)>,
}

/// Detailed column difference.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDiffDetail {
    pub name: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_nullable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_nullable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_default: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_default: Option<String>,
}

/// Index difference.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns_changed: Option<(Vec<String>, Vec<String>)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_changed: Option<(bool, bool)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub type_changed: Option<(String, String)>,
}

/// Foreign key difference.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FkDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referenced_table: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_delete: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_update: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns: Option<(Vec<String>, Vec<String>)>,
}

/// Constraint difference (CHECK, UNIQUE).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConstraintDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constraint_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition_changed: Option<(String, String)>,
}

/// View difference (normalized hash comparison).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ViewDiff {
    pub name: String,
    pub status: CompareStatus,
    pub source_hash: String,
    pub target_hash: String,
}

/// Routine difference (procedure or function).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RoutineDiff {
    pub name: String,
    pub routine_type: String,
    pub status: CompareStatus,
    pub source_hash: String,
    pub target_hash: String,
}

/// Trigger difference.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerDiff {
    pub name: String,
    pub table: String,
    pub status: CompareStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_changed: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_hash_changed: Option<(String, String)>,
}

// ============================================================
// Data Compare Types
// ============================================================

/// Full data comparison report.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DataReport {
    pub tables: Vec<TableDataDiff>,
}

/// Per-table data difference.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDataDiff {
    pub table: String,
    pub status: CompareStatus,
    pub source_count: u64,
    pub target_count: u64,
    pub rows_equal: u64,
    pub rows_modified: u64,
    pub rows_only_in_source: u64,
    pub rows_only_in_target: u64,
    pub pk_columns: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub column_diffs: Vec<RowColumnDiff>,
}

/// Column-level difference on a modified row.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RowColumnDiff {
    pub pk_value: String,
    pub column: String,
    pub source_value: Option<serde_json::Value>,
    pub target_value: Option<serde_json::Value>,
}

// ============================================================
// Script Generator Types
// ============================================================

/// Generated synchronization script.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncScript {
    pub statements: Vec<ScriptStatement>,
    pub target_db_type: String,
}

/// Single SQL statement in the sync script.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptStatement {
    pub id: String,
    pub sql: String,
    pub description: String,
    pub diff_type: String,
    pub object_name: String,
    pub object_type: String,
    pub selected: bool,
}

/// Options controlling which diffs are included in the script.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptOptions {
    pub include_creates: bool,
    pub include_alters: bool,
    pub include_drops: bool,
    pub include_indexes: bool,
    pub include_constraints: bool,
    pub include_views: bool,
    pub include_routines: bool,
    pub wrap_in_transaction: bool,
}

impl Default for ScriptOptions {
    fn default() -> Self {
        Self {
            include_creates: true,
            include_alters: true,
            include_drops: true,
            include_indexes: true,
            include_constraints: true,
            include_views: true,
            include_routines: true,
            wrap_in_transaction: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_status_serializes_snake_case() {
        let json = serde_json::to_string(&CompareStatus::Equal).unwrap();
        assert_eq!(json, "\"equal\"");
        let json = serde_json::to_string(&CompareStatus::Missing).unwrap();
        assert_eq!(json, "\"missing\"");
    }

    #[test]
    fn script_options_default_includes_all() {
        let opts = ScriptOptions::default();
        assert!(opts.include_creates);
        assert!(opts.include_alters);
        assert!(opts.include_drops);
        assert!(opts.wrap_in_transaction);
    }

    #[test]
    fn schema_report_roundtrip() {
        let report = SchemaReport {
            source_name: "src".into(),
            target_name: "tgt".into(),
            compared_at: "2026-01-01T00:00:00Z".into(),
            tables: vec![ObjectDiff {
                name: "users".into(),
                status: CompareStatus::Equal,
                details: None,
            }],
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
        let json = serde_json::to_string(&report).unwrap();
        let back: SchemaReport = serde_json::from_str(&json).unwrap();
        assert_eq!(back.tables[0].name, "users");
        assert_eq!(back.tables[0].status, CompareStatus::Equal);
    }
}
