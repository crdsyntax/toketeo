use crate::models::compare::{CompareStatus, DataReport, SchemaReport};
use serde_json::json;

/// Genera un reporte JSON combinado de schema + data.
pub fn generate_full_report(
    schema_report: &SchemaReport,
    data_report: Option<&DataReport>,
) -> serde_json::Value {
    let mut report = json!({
        "schema": schema_report,
        "compared_at": schema_report.compared_at,
        "source": schema_report.source_name,
        "target": schema_report.target_name,
    });

    if let Some(data) = data_report {
        report["data"] = serde_json::to_value(data).unwrap_or_default();
    }

    report
}

/// Cuenta estadísticas de un SchemaReport.
pub fn count_schema_differences(report: &SchemaReport) -> serde_json::Value {
    json!({
        "tables": report.tables.len(),
        "modified_tables": report.tables.iter().filter(|t| t.status != CompareStatus::Equal).count(),
        "views": report.views.len(),
        "modified_views": report.views.iter().filter(|v| v.status != CompareStatus::Equal).count(),
        "procedures": report.procedures.len(),
        "modified_procedures": report.procedures.iter().filter(|p| p.status != CompareStatus::Equal).count(),
        "functions": report.functions.len(),
        "modified_functions": report.functions.iter().filter(|f| f.status != CompareStatus::Equal).count(),
        "triggers": report.triggers.len(),
        "modified_triggers": report.triggers.iter().filter(|t| t.status != CompareStatus::Equal).count(),
        "indexes": report.indexes.len(),
        "modified_indexes": report.indexes.iter().filter(|i| i.status != CompareStatus::Equal).count(),
        "foreign_keys": report.foreign_keys.len(),
        "modified_foreign_keys": report.foreign_keys.iter().filter(|f| f.status != CompareStatus::Equal).count(),
        "constraints": report.constraints.len(),
        "modified_constraints": report.constraints.iter().filter(|c| c.status != CompareStatus::Equal).count(),
        "warnings": report.warnings.len(),
        "errors": report.errors.len(),
    })
}

/// Filtra un SchemaReport para incluir solo las diferencias (sin Equal).
pub fn filter_differences_only(report: &SchemaReport) -> SchemaReport {
    SchemaReport {
        tables: report
            .tables
            .iter()
            .filter(|t| t.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        views: report
            .views
            .iter()
            .filter(|v| v.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        procedures: report
            .procedures
            .iter()
            .filter(|p| p.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        functions: report
            .functions
            .iter()
            .filter(|f| f.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        triggers: report
            .triggers
            .iter()
            .filter(|t| t.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        indexes: report
            .indexes
            .iter()
            .filter(|i| i.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        foreign_keys: report
            .foreign_keys
            .iter()
            .filter(|f| f.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        constraints: report
            .constraints
            .iter()
            .filter(|c| c.status != CompareStatus::Equal)
            .cloned()
            .collect(),
        source_name: report.source_name.clone(),
        target_name: report.target_name.clone(),
        compared_at: report.compared_at.clone(),
        warnings: report.warnings.clone(),
        errors: report.errors.clone(),
        summary: report.summary.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::compare::*;

    fn sample_report() -> SchemaReport {
        SchemaReport {
            source_name: "src".into(),
            target_name: "tgt".into(),
            compared_at: "2024-01-01T00:00:00Z".into(),
            tables: vec![
                ObjectDiff {
                    name: "ok".into(),
                    status: CompareStatus::Equal,
                    details: None,
                },
                ObjectDiff {
                    name: "changed".into(),
                    status: CompareStatus::Modified,
                    details: None,
                },
            ],
            views: vec![],
            procedures: vec![],
            functions: vec![],
            triggers: vec![],
            indexes: vec![],
            foreign_keys: vec![],
            constraints: vec![],
            warnings: vec![],
            errors: vec![],
            summary: None,
        }
    }

    #[test]
    fn generate_report_without_data() {
        let report = sample_report();
        let json = generate_full_report(&report, None);
        assert_eq!(json["source"], "src");
        assert_eq!(json["target"], "tgt");
        assert!(json.get("data").is_none());
    }

    #[test]
    fn count_differences() {
        let report = sample_report();
        let counts = count_schema_differences(&report);
        assert_eq!(counts["tables"], 2);
        assert_eq!(counts["modified_tables"], 1);
    }

    #[test]
    fn filter_equal_only() {
        let report = sample_report();
        let filtered = filter_differences_only(&report);
        assert_eq!(filtered.tables.len(), 1);
        assert_eq!(filtered.tables[0].status, CompareStatus::Modified);
    }
}
