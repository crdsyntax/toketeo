use crate::db::DbDriver;
use crate::error::{AppError, AppResult};
use crate::models::compare::{
    CompareStatus, ConstraintDiff, DataReport, FkDiff, IndexDiff, ObjectDiff, SchemaReport,
    ScriptOptions, SyncScript, TableDataDiff,
};
use crate::state::{SyncControl, SyncController};
use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::data::diff_builder::build_data_report;
use super::data::hash_generator::compute_table_hashes;
use super::data::pk_resolver::resolve_pk;
use super::data::row_comparator::compare_row_columns;
use super::schema::{
    compare_functions, compare_procedures, compare_table_constraints, compare_table_foreign_keys,
    compare_table_indexes, compare_tables, compare_triggers, compare_views,
};
use super::script_generator::generators::{mysql_generator, postgres_generator, sqlite_generator};

pub struct CompareService;

impl CompareService {
    pub async fn compare_schemas(
        source: Arc<dyn DbDriver>,
        target: Arc<dyn DbDriver>,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        tables: Option<&[String]>,
        views: Option<&[String]>,
        procedures: Option<&[String]>,
        functions: Option<&[String]>,
        triggers: Option<&[String]>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
        app_handle: Option<&AppHandle>,
    ) -> AppResult<SchemaReport> {
        let source_name = source_schema.unwrap_or("source").to_string();
        let target_name = target_schema.unwrap_or("target").to_string();
        let compared_at = chrono::Utc::now().to_rfc3339();

        let mut warnings = Vec::new();
        let errors = Vec::new();

        Self::emit_progress(app_handle, compare_id, "Comparing tables...", 0, 0);
        Self::check_control(compare_id, controller).await?;

        let table_diffs = Self::compare_all_tables(
            source.as_ref(),
            target.as_ref(),
            source_schema,
            target_schema,
            tables,
            &mut warnings,
        )
        .await?;

        Self::check_control(compare_id, controller).await?;

        let active_tables: Vec<String> = {
            let mut set = BTreeSet::new();
            if let Some(filter) = tables {
                for t in filter {
                    set.insert(t.clone());
                }
            } else {
                for diff in &table_diffs {
                    set.insert(diff.name.clone());
                }
            }
            set.into_iter().collect()
        };

        let total_steps = active_tables.len().max(1) + 4;
        let mut step = 1usize;

        Self::emit_progress(
            app_handle,
            compare_id,
            "Comparing indexes...",
            step,
            total_steps,
        );
        Self::check_control(compare_id, controller).await?;
        let index_diffs = Self::compare_all_indexes(
            source.as_ref(),
            target.as_ref(),
            &active_tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
        )
        .await?;
        step += 1;

        Self::emit_progress(
            app_handle,
            compare_id,
            "Comparing foreign keys...",
            step,
            total_steps,
        );
        Self::check_control(compare_id, controller).await?;
        let fk_diffs = Self::compare_all_foreign_keys(
            source.as_ref(),
            target.as_ref(),
            &active_tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
        )
        .await?;
        step += 1;

        Self::emit_progress(
            app_handle,
            compare_id,
            "Comparing constraints...",
            step,
            total_steps,
        );
        Self::check_control(compare_id, controller).await?;
        let constraint_diffs = Self::compare_all_constraints(
            source.as_ref(),
            target.as_ref(),
            &active_tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
        )
        .await?;
        step += 1;

        Self::emit_progress(app_handle, compare_id, "Comparing views...", step, total_steps);
        Self::check_control(compare_id, controller).await?;
        let view_diffs = match compare_views(
            source.as_ref(),
            target.as_ref(),
            source_schema,
            target_schema,
            views,
        )
        .await
        {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("View comparison failed: {}", e));
                Vec::new()
            }
        };
        step += 1;

        Self::check_control(compare_id, controller).await?;
        let procedure_diffs = match compare_procedures(
            source.as_ref(),
            target.as_ref(),
            source_schema,
            target_schema,
            procedures,
        )
        .await
        {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("Procedure comparison failed: {}", e));
                Vec::new()
            }
        };

        Self::check_control(compare_id, controller).await?;
        let function_diffs = match compare_functions(
            source.as_ref(),
            target.as_ref(),
            source_schema,
            target_schema,
            functions,
        )
        .await
        {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("Function comparison failed: {}", e));
                Vec::new()
            }
        };

        Self::check_control(compare_id, controller).await?;
        let trigger_diffs = match compare_triggers(
            source.as_ref(),
            target.as_ref(),
            source_schema,
            target_schema,
            triggers,
        )
        .await
        {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("Trigger comparison failed: {}", e));
                Vec::new()
            }
        };

        Self::emit_progress(app_handle, compare_id, "Schema compare complete", total_steps, total_steps);

        Ok(SchemaReport {
            source_name,
            target_name,
            compared_at,
            tables: table_diffs,
            views: view_diffs,
            procedures: procedure_diffs,
            functions: function_diffs,
            triggers: trigger_diffs,
            indexes: index_diffs,
            foreign_keys: fk_diffs,
            constraints: constraint_diffs,
            warnings,
            errors,
        })
    }

    pub async fn compare_data(
        source: Arc<dyn DbDriver>,
        target: Arc<dyn DbDriver>,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        tables: &[String],
        chunk_size: usize,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
        app_handle: Option<&AppHandle>,
    ) -> AppResult<DataReport> {
        let mut table_diffs = Vec::new();
        let total = tables.len();

        for (i, table) in tables.iter().enumerate() {
            Self::check_control(compare_id, controller).await?;
            Self::emit_progress(
                app_handle,
                compare_id,
                &format!("Comparing data: {}", table),
                i + 1,
                total,
            );

            let diff = Self::compare_table_data(
                source.as_ref(),
                target.as_ref(),
                table,
                source_schema,
                target_schema,
                chunk_size,
                compare_id,
                controller,
            )
            .await?;
            table_diffs.push(diff);
        }

        Self::emit_progress(app_handle, compare_id, "Data compare complete", total, total);

        Ok(DataReport {
            tables: table_diffs,
        })
    }

    async fn compare_table_data(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        table: &str,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        chunk_size: usize,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
    ) -> AppResult<TableDataDiff> {
        let pk_columns = resolve_pk(source, table, source_schema)
            .await?
            .unwrap_or_default();

        if pk_columns.is_empty() {
            return Ok(TableDataDiff {
                table: table.to_string(),
                status: CompareStatus::Equal,
                source_count: 0,
                target_count: 0,
                rows_equal: 0,
                rows_modified: 0,
                rows_only_in_source: 0,
                rows_only_in_target: 0,
                pk_columns: vec![],
                column_diffs: vec![],
            });
        }

        let pk_col = pk_columns[0].clone();

        let src_cols = source
            .fetch_columns(table, source_schema.map(String::from))
            .await?;
        let source_columns: Vec<String> = src_cols
            .iter()
            .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(String::from))
            .collect();

        if source_columns.is_empty() {
            return Ok(TableDataDiff {
                table: table.to_string(),
                status: CompareStatus::Equal,
                source_count: 0,
                target_count: 0,
                rows_equal: 0,
                rows_modified: 0,
                rows_only_in_source: 0,
                rows_only_in_target: 0,
                pk_columns: pk_columns.clone(),
                column_diffs: vec![],
            });
        }

        let tgt_cols = match target.fetch_columns(table, target_schema.map(String::from)).await {
            Ok(c) => c,
            Err(_) => {
                return Ok(TableDataDiff {
                    table: table.to_string(),
                    status: CompareStatus::Missing,
                    source_count: 0,
                    target_count: 0,
                    rows_equal: 0,
                    rows_modified: 0,
                    rows_only_in_source: 0,
                    rows_only_in_target: 0,
                    pk_columns,
                    column_diffs: vec![],
                });
            }
        };
        let target_columns: Vec<String> = tgt_cols
            .iter()
            .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(String::from))
            .collect();

        let target_set: std::collections::BTreeSet<String> =
            target_columns.iter().map(|c| c.to_lowercase()).collect();
        let common_columns: Vec<String> = source_columns
            .iter()
            .filter(|c| target_set.contains(&c.to_lowercase()))
            .cloned()
            .collect();

        if common_columns.is_empty() {
            return Ok(TableDataDiff {
                table: table.to_string(),
                status: CompareStatus::Modified,
                source_count: 0,
                target_count: 0,
                rows_equal: 0,
                rows_modified: 0,
                rows_only_in_source: 0,
                rows_only_in_target: 0,
                pk_columns,
                column_diffs: vec![],
            });
        }

        if !target_set.contains(&pk_col.to_lowercase()) {
            return Ok(TableDataDiff {
                table: table.to_string(),
                status: CompareStatus::Modified,
                source_count: 0,
                target_count: 0,
                rows_equal: 0,
                rows_modified: 0,
                rows_only_in_source: 0,
                rows_only_in_target: 0,
                pk_columns,
                column_diffs: vec![],
            });
        }

        let mut source_hashes: HashMap<String, String> = HashMap::new();
        let mut target_hashes: HashMap<String, String> = HashMap::new();
        let mut offset = 0u64;

        loop {
            Self::check_control(compare_id, controller).await?;
            let src_chunk = compute_table_hashes(
                source, table, source_schema, &common_columns, &pk_col, chunk_size, offset,
            )
            .await?;
            if src_chunk.is_empty() {
                break;
            }
            for (pk, hash) in src_chunk {
                source_hashes.insert(pk, hash);
            }
            offset += chunk_size as u64;
        }

        offset = 0;
        loop {
            Self::check_control(compare_id, controller).await?;
            let tgt_chunk = compute_table_hashes(
                target, table, target_schema, &common_columns, &pk_col, chunk_size, offset,
            )
            .await?;
            if tgt_chunk.is_empty() {
                break;
            }
            for (pk, hash) in tgt_chunk {
                target_hashes.insert(pk, hash);
            }
            offset += chunk_size as u64;
        }

        let source_count = source_hashes.len() as u64;
        let target_count = target_hashes.len() as u64;

        let mut column_diffs = Vec::new();
        for (pk, src_hash) in &source_hashes {
            Self::check_control(compare_id, controller).await?;
            if let Some(tgt_hash) = target_hashes.get(pk) {
                if src_hash != tgt_hash {
                    let pk_val = serde_json::Value::String(pk.clone());
                    let diffs = compare_row_columns(
                        source,
                        target,
                        table,
                        table,
                        source_schema,
                        target_schema,
                        &pk_columns,
                        &pk_val,
                        &common_columns,
                    )
                    .await?;
                    column_diffs.extend(diffs);
                }
            }
        }

        Ok(build_data_report(
            table,
            pk_columns,
            source_hashes,
            target_hashes,
            column_diffs,
            source_count,
            target_count,
        ))
    }

    pub fn generate_script(
        schema_report: &SchemaReport,
        _data_report: Option<&DataReport>,
        target_db_type: &str,
        options: &ScriptOptions,
    ) -> AppResult<SyncScript> {
        let statements = match target_db_type.to_lowercase().as_str() {
            "mysql" | "mariadb" => mysql_generator::generate(schema_report, options),
            "postgres" | "postgresql" => postgres_generator::generate(schema_report, options),
            "sqlite" => sqlite_generator::generate(schema_report, options),
            other => {
                return Err(AppError::Validation(format!(
                    "Unsupported target database type: {}",
                    other
                )));
            }
        };

        Ok(SyncScript {
            statements,
            target_db_type: target_db_type.to_string(),
        })
    }

    async fn check_control(
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
    ) -> AppResult<()> {
        let (Some(id), Some(ctrl)) = (compare_id, controller) else {
            return Ok(());
        };

        loop {
            match ctrl.get(id).await {
                Some(SyncControl::Cancelled) => {
                    return Err(AppError::Validation("Comparison cancelled by user".into()));
                }
                Some(SyncControl::Paused) => {
                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    continue;
                }
                Some(SyncControl::Running) | None => return Ok(()),
            }
        }
    }

    fn emit_progress(
        app_handle: Option<&AppHandle>,
        compare_id: Option<&str>,
        message: &str,
        current: usize,
        total: usize,
    ) {
        if let (Some(handle), Some(id)) = (app_handle, compare_id) {
            let _ = handle.emit(
                "compare:progress",
                serde_json::json!({
                    "compare_id": id,
                    "message": message,
                    "current": current,
                    "total": total,
                }),
            );
        }
    }

    async fn compare_all_tables(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        table_filter: Option<&[String]>,
        warnings: &mut Vec<String>,
    ) -> AppResult<Vec<ObjectDiff>> {
        match compare_tables(source, target, source_schema, target_schema, table_filter).await {
            Ok(diffs) => Ok(diffs),
            Err(e) => {
                warnings.push(format!("Table comparison error: {}", e));
                let src_tables = source
                    .fetch_tables(source_schema.map(str::to_string), None)
                    .await
                    .unwrap_or_default();
                let tgt_tables = target
                    .fetch_tables(target_schema.map(str::to_string), None)
                    .await
                    .unwrap_or_default();
                Ok(Self::compare_names_only(&src_tables, &tgt_tables))
            }
        }
    }

    async fn compare_all_indexes(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        tables: &[String],
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
    ) -> AppResult<Vec<IndexDiff>> {
        let mut all = Vec::new();
        for table in tables {
            Self::check_control(compare_id, controller).await?;
            match compare_table_indexes(source, target, table, source_schema, target_schema).await {
                Ok(diffs) => all.extend(diffs),
                Err(e) => {
                    tracing::warn!("Index comparison failed for table {}: {}", table, e);
                }
            }
        }
        all.sort_by(|a, b| {
            a.table
                .to_lowercase()
                .cmp(&b.table.to_lowercase())
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(all)
    }

    async fn compare_all_foreign_keys(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        tables: &[String],
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
    ) -> AppResult<Vec<FkDiff>> {
        let mut all = Vec::new();
        for table in tables {
            Self::check_control(compare_id, controller).await?;
            match compare_table_foreign_keys(source, target, table, source_schema, target_schema)
                .await
            {
                Ok(diffs) => all.extend(diffs),
                Err(e) => {
                    tracing::warn!("FK comparison failed for table {}: {}", table, e);
                }
            }
        }
        all.sort_by(|a, b| {
            a.table
                .to_lowercase()
                .cmp(&b.table.to_lowercase())
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(all)
    }

    async fn compare_all_constraints(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        tables: &[String],
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
    ) -> AppResult<Vec<ConstraintDiff>> {
        let mut all = Vec::new();
        for table in tables {
            Self::check_control(compare_id, controller).await?;
            match compare_table_constraints(source, target, table, source_schema, target_schema)
                .await
            {
                Ok(diffs) => all.extend(diffs),
                Err(e) => {
                    tracing::warn!("Constraint comparison failed for table {}: {}", table, e);
                }
            }
        }
        all.sort_by(|a, b| {
            a.table
                .to_lowercase()
                .cmp(&b.table.to_lowercase())
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(all)
    }

    fn compare_names_only(source_names: &[String], target_names: &[String]) -> Vec<ObjectDiff> {
        let src_set: BTreeSet<String> = source_names.iter().map(|t| t.to_lowercase()).collect();
        let tgt_set: BTreeSet<String> = target_names.iter().map(|t| t.to_lowercase()).collect();

        let mut name_map = std::collections::BTreeMap::new();
        for t in source_names {
            name_map.insert(t.to_lowercase(), t.clone());
        }
        for t in target_names {
            name_map.entry(t.to_lowercase()).or_insert_with(|| t.clone());
        }

        let mut all: BTreeSet<String> = BTreeSet::new();
        all.extend(src_set.iter().cloned());
        all.extend(tgt_set.iter().cloned());

        let mut results = Vec::new();
        for key in all {
            let display = name_map.get(&key).cloned().unwrap_or_else(|| key.clone());
            let status = match (src_set.contains(&key), tgt_set.contains(&key)) {
                (true, false) => CompareStatus::Missing,
                (false, true) => CompareStatus::New,
                _ => CompareStatus::Equal,
            };
            results.push(ObjectDiff {
                name: display,
                status,
                details: None,
            });
        }
        results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        results
    }
}
