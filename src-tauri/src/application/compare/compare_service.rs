use crate::db::DbDriver;
use crate::error::{AppError, AppResult};
use crate::models::compare::{
    CompareStatus, ConstraintDiff, DataReport, FkDiff, IndexDiff, ObjectDiff, SchemaReport,
    ScriptOptions, ScriptStatement, SyncScript, TableDataDiff,
};
use crate::state::{SyncControl, SyncController};
use futures::stream::{self, StreamExt};
use std::collections::{BTreeSet, HashMap};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::data::diff_builder::build_data_report;
use super::data::hash_generator::compute_table_hashes;
use super::data::metadata_cache::SchemaMetadataCache;
use super::data::pk_resolver::resolve_pk;
use super::data::row_comparator::{compare_rows_batch, BatchSide};
use super::schema::{
    compare_functions, compare_procedures, compare_table_constraints, compare_table_foreign_keys,
    compare_table_indexes, compare_tables, compare_triggers, compare_views,
    INTROSPECTION_CONCURRENCY,
};
use super::script_generator::data_sync;
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
            source.clone(),
            target.clone(),
            source_schema,
            target_schema,
            tables,
            &mut warnings,
        )
        .await?;

        Self::emit_section(app_handle, compare_id, "tables", table_diffs.len());

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
            source.clone(),
            target.clone(),
            &active_tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
            app_handle,
        )
        .await?;
        step += 1;

        Self::emit_section(app_handle, compare_id, "indexes", index_diffs.len());

        Self::emit_progress(
            app_handle,
            compare_id,
            "Comparing foreign keys...",
            step,
            total_steps,
        );
        Self::check_control(compare_id, controller).await?;
        let fk_diffs = Self::compare_all_foreign_keys(
            source.clone(),
            target.clone(),
            &active_tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
            app_handle,
        )
        .await?;
        step += 1;

        Self::emit_section(app_handle, compare_id, "foreign_keys", fk_diffs.len());

        Self::emit_progress(
            app_handle,
            compare_id,
            "Comparing constraints...",
            step,
            total_steps,
        );
        Self::check_control(compare_id, controller).await?;
        let constraint_diffs = Self::compare_all_constraints(
            source.clone(),
            target.clone(),
            &active_tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
            app_handle,
        )
        .await?;
        step += 1;

        Self::emit_progress(
            app_handle,
            compare_id,
            "Comparing views...",
            step,
            total_steps,
        );
        Self::check_control(compare_id, controller).await?;
        let (view_res, proc_res, func_res, trig_res) = tokio::join!(
            compare_views(
                source.as_ref(),
                target.as_ref(),
                source_schema,
                target_schema,
                views
            ),
            compare_procedures(
                source.as_ref(),
                target.as_ref(),
                source_schema,
                target_schema,
                procedures,
            ),
            compare_functions(
                source.as_ref(),
                target.as_ref(),
                source_schema,
                target_schema,
                functions,
            ),
            compare_triggers(
                source.as_ref(),
                target.as_ref(),
                source_schema,
                target_schema,
                triggers,
            ),
        );
        let view_diffs = match view_res {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("View comparison failed: {}", e));
                Vec::new()
            }
        };
        Self::emit_section(app_handle, compare_id, "views", view_diffs.len());

        Self::check_control(compare_id, controller).await?;
        let procedure_diffs = match proc_res {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("Procedure comparison failed: {}", e));
                Vec::new()
            }
        };
        Self::emit_section(app_handle, compare_id, "procedures", procedure_diffs.len());

        Self::check_control(compare_id, controller).await?;
        let function_diffs = match func_res {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("Function comparison failed: {}", e));
                Vec::new()
            }
        };
        Self::emit_section(app_handle, compare_id, "functions", function_diffs.len());

        Self::check_control(compare_id, controller).await?;
        let trigger_diffs = match trig_res {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!("Trigger comparison failed: {}", e));
                Vec::new()
            }
        };
        Self::emit_section(app_handle, compare_id, "triggers", trigger_diffs.len());

        Self::emit_progress(
            app_handle,
            compare_id,
            "Schema compare complete",
            total_steps,
            total_steps,
        );

        let summary = Self::build_summary(
            &table_diffs,
            &view_diffs,
            &procedure_diffs,
            &function_diffs,
            &trigger_diffs,
            &index_diffs,
            &fk_diffs,
            &constraint_diffs,
            &source_name,
            &target_name,
        );

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
            summary: Some(summary),
        })
    }

    /// Genera un resumen en lenguaje natural de la comparación.
    fn build_summary(
        tables: &[ObjectDiff],
        views: &[ObjectDiff],
        procedures: &[ObjectDiff],
        functions: &[ObjectDiff],
        triggers: &[ObjectDiff],
        indexes: &[IndexDiff],
        fks: &[FkDiff],
        constraints: &[ConstraintDiff],
        source_name: &str,
        target_name: &str,
    ) -> String {
        let mut all: Vec<(&str, &CompareStatus)> = Vec::new();
        for diff in tables {
            all.push((diff.name.as_str(), &diff.status));
        }
        for diff in views {
            all.push((diff.name.as_str(), &diff.status));
        }
        for diff in procedures {
            all.push((diff.name.as_str(), &diff.status));
        }
        for diff in functions {
            all.push((diff.name.as_str(), &diff.status));
        }
        for diff in triggers {
            all.push((diff.name.as_str(), &diff.status));
        }
        for diff in indexes {
            all.push((diff.name.as_str(), &diff.status));
        }
        for diff in fks {
            all.push((diff.name.as_str(), &diff.status));
        }
        for diff in constraints {
            all.push((diff.name.as_str(), &diff.status));
        }

        let total = all.len().max(1);
        let mut equal = 0;
        let mut modified = 0;
        let mut missing = 0;
        let mut new_count = 0;
        let mut missing_names = Vec::new();
        let mut modified_names = Vec::new();
        let mut new_names = Vec::new();

        for (name, status) in all {
            match status {
                CompareStatus::Equal => equal += 1,
                CompareStatus::Modified => {
                    modified += 1;
                    if modified_names.len() < 3 {
                        modified_names.push(name);
                    }
                }
                CompareStatus::Missing => {
                    missing += 1;
                    if missing_names.len() < 3 {
                        missing_names.push(name);
                    }
                }
                CompareStatus::New => {
                    new_count += 1;
                    if new_names.len() < 3 {
                        new_names.push(name);
                    }
                }
            }
        }

        let mut parts = vec![format!(
            "Tu base {} y tu base {} coinciden en {} de {} objetos.",
            source_name, target_name, equal, total
        )];

        if missing > 0 {
            let names = Self::format_name_list(&missing_names, missing);
            parts.push(format!(
                "Hay {} que existen en {} pero faltan en {}{}.",
                Self::pluralize(missing, "objeto", "objetos"),
                source_name,
                target_name,
                names
            ));
        }
        if modified > 0 {
            let names = Self::format_name_list(&modified_names, modified);
            let verb = if modified == 1 {
                "fue modificado"
            } else {
                "fueron modificados"
            };
            parts.push(format!(
                "Hay {} que {}{}.",
                Self::pluralize(modified, "objeto", "objetos"),
                verb,
                names
            ));
        }
        if new_count > 0 {
            let names = Self::format_name_list(&new_names, new_count);
            parts.push(format!(
                "Hay {} que solo existen en {}{}.",
                Self::pluralize(new_count, "objeto", "objetos"),
                target_name,
                names
            ));
        }

        parts.join(" ")
    }

    fn format_name_list(names: &[&str], total: usize) -> String {
        if names.is_empty() {
            return String::new();
        }
        let listed = names.join(", ");
        if total > names.len() {
            format!(" (por ejemplo: {})", listed)
        } else {
            format!(" ({})", listed)
        }
    }

    fn pluralize(count: usize, singular: &str, plural: &str) -> String {
        if count == 1 {
            format!("1 {}", singular)
        } else {
            format!("{} {}", count, plural)
        }
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

        let mut source_cache = SchemaMetadataCache::new();
        let mut target_cache = SchemaMetadataCache::new();

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
                &mut source_cache,
                &mut target_cache,
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

        Self::emit_progress(
            app_handle,
            compare_id,
            "Data compare complete",
            total,
            total,
        );

        Ok(DataReport {
            tables: table_diffs,
        })
    }

    async fn compare_table_data(
        source: &dyn DbDriver,
        target: &dyn DbDriver,
        source_cache: &mut SchemaMetadataCache,
        target_cache: &mut SchemaMetadataCache,
        table: &str,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        chunk_size: usize,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
    ) -> AppResult<TableDataDiff> {
        let pk_columns = resolve_pk(source_cache, source, table, source_schema)
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
                source_only_rows: vec![],
                target_only_rows: vec![],
            });
        }

        let pk_col = pk_columns[0].clone();

        let src_cols = source_cache.columns(source, table, source_schema).await?;
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
                source_only_rows: vec![],
                target_only_rows: vec![],
            });
        }

        let tgt_cols = match target_cache.columns(target, table, target_schema).await {
            Ok(c) => c,
            Err(_) => {
                let source_count = source.count_rows(table, source_schema).await.unwrap_or(0);
                let target_count = target.count_rows(table, target_schema).await.unwrap_or(0);
                return Ok(TableDataDiff {
                    table: table.to_string(),
                    status: CompareStatus::Missing,
                    source_count,
                    target_count,
                    rows_equal: 0,
                    rows_modified: 0,
                    rows_only_in_source: source_count,
                    rows_only_in_target: target_count,
                    pk_columns,
                    column_diffs: vec![],
                    source_only_rows: vec![],
                    target_only_rows: vec![],
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
                source_only_rows: vec![],
                target_only_rows: vec![],
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
                source_only_rows: vec![],
                target_only_rows: vec![],
            });
        }

        let mut source_hashes: HashMap<String, String> = HashMap::new();
        let mut target_hashes: HashMap<String, String> = HashMap::new();
        let mut last_src_pk: Option<String> = None;

        loop {
            Self::check_control(compare_id, controller).await?;
            let src_chunk = compute_table_hashes(
                source,
                table,
                source_schema,
                &common_columns,
                &pk_col,
                chunk_size,
                last_src_pk.as_deref(),
            )
            .await?;
            if src_chunk.is_empty() {
                break;
            }
            last_src_pk = src_chunk.last().map(|(pk, _)| pk.clone());
            for (pk, hash) in src_chunk {
                source_hashes.insert(pk, hash);
            }
        }

        let mut last_tgt_pk: Option<String> = None;
        loop {
            Self::check_control(compare_id, controller).await?;
            let tgt_chunk = compute_table_hashes(
                target,
                table,
                target_schema,
                &common_columns,
                &pk_col,
                chunk_size,
                last_tgt_pk.as_deref(),
            )
            .await?;
            if tgt_chunk.is_empty() {
                break;
            }
            last_tgt_pk = tgt_chunk.last().map(|(pk, _)| pk.clone());
            for (pk, hash) in tgt_chunk {
                target_hashes.insert(pk, hash);
            }
        }

        let source_count = source_hashes.len() as u64;
        let target_count = target_hashes.len() as u64;

        let mut column_diffs = Vec::new();
        let mut source_only_rows = Vec::new();
        let mut target_only_rows = Vec::new();

        // Clasificar PKs: divergentes (ambos lados), solo source, solo target.
        let mut divergent_pks: Vec<String> = Vec::new();
        let mut src_only_pks: Vec<String> = Vec::new();
        let mut tgt_only_pks: Vec<String> = Vec::new();
        for (pk, src_hash) in &source_hashes {
            match target_hashes.get(pk) {
                Some(tgt_hash) if src_hash != tgt_hash => divergent_pks.push(pk.clone()),
                None => src_only_pks.push(pk.clone()),
                _ => {}
            }
        }
        for pk in target_hashes.keys() {
            if !source_hashes.contains_key(pk) {
                tgt_only_pks.push(pk.clone());
            }
        }

        const BATCH_SIZE: usize = 500;

        for chunk in divergent_pks.chunks(BATCH_SIZE) {
            Self::check_control(compare_id, controller).await?;
            let diffs = compare_rows_batch(
                source,
                target,
                table,
                table,
                source_schema,
                target_schema,
                &pk_columns,
                chunk,
                &common_columns,
                BatchSide::Both,
            )
            .await?;
            column_diffs.extend(diffs);
        }

        for chunk in src_only_pks.chunks(BATCH_SIZE) {
            Self::check_control(compare_id, controller).await?;
            let diffs = compare_rows_batch(
                source,
                target,
                table,
                table,
                source_schema,
                target_schema,
                &pk_columns,
                chunk,
                &common_columns,
                BatchSide::SourceOnly,
            )
            .await?;
            source_only_rows.extend(diffs);
        }

        for chunk in tgt_only_pks.chunks(BATCH_SIZE) {
            Self::check_control(compare_id, controller).await?;
            let diffs = compare_rows_batch(
                source,
                target,
                table,
                table,
                source_schema,
                target_schema,
                &pk_columns,
                chunk,
                &common_columns,
                BatchSide::TargetOnly,
            )
            .await?;
            target_only_rows.extend(diffs);
        }

        Ok(build_data_report(
            table,
            pk_columns,
            source_hashes,
            target_hashes,
            column_diffs,
            source_only_rows,
            target_only_rows,
            source_count,
            target_count,
        ))
    }

    pub fn generate_script(
        schema_report: &SchemaReport,
        data_report: Option<&DataReport>,
        target_db_type: &str,
        options: &ScriptOptions,
    ) -> AppResult<SyncScript> {
        let mut statements = match target_db_type.to_lowercase().as_str() {
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

        if let Some(report) = data_report {
            let data_stmts = data_sync::generate_data_sync(report, target_db_type, options);
            if !data_stmts.is_empty() {
                statements.push(ScriptStatement {
                    id: "section_data_0".to_string(),
                    sql: "-- ============================================================\n-- DATA SYNCHRONIZATION\n-- ============================================================".to_string(),
                    description: "Data synchronization section".into(),
                    diff_type: "section".into(),
                    object_name: String::new(),
                    object_type: "section".into(),
                    selected: true,
                    preserve_data: false,
                    backup_sql: None,
                });
                statements.extend(data_stmts);
            }
        }

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

    /// Emite el conteo de una sección del report apenas se completa, para que
    /// el frontend muestre avance por sección sin esperar el invoke completo
    /// (solo envía el conteo, no los diffs: no duplica el payload final).
    fn emit_section(
        app_handle: Option<&AppHandle>,
        compare_id: Option<&str>,
        section: &str,
        count: usize,
    ) {
        if let (Some(handle), Some(id)) = (app_handle, compare_id) {
            let _ = handle.emit(
                "compare:section",
                serde_json::json!({
                    "compare_id": id,
                    "section": section,
                    "count": count,
                }),
            );
        }
    }

    async fn compare_all_tables(
        source: Arc<dyn DbDriver>,
        target: Arc<dyn DbDriver>,
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        table_filter: Option<&[String]>,
        warnings: &mut Vec<String>,
    ) -> AppResult<Vec<ObjectDiff>> {
        match compare_tables(
            source.clone(),
            target.clone(),
            source_schema,
            target_schema,
            table_filter,
        )
        .await
        {
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

    /// Ejecuta la comparación de un tipo de objeto por tabla en paralelo
    /// (`buffered(INTROSPECTION_CONCURRENCY)`), con progreso por tabla
    /// completada y control de cancelación por tarea.
    async fn compare_per_table<T, Fut>(
        source: Arc<dyn DbDriver>,
        target: Arc<dyn DbDriver>,
        tables: &[String],
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
        app_handle: Option<&AppHandle>,
        progress_label: &str,
        compare: impl Fn(
            Arc<dyn DbDriver>,
            Arc<dyn DbDriver>,
            String,
            Option<String>,
            Option<String>,
        ) -> Fut,
    ) -> AppResult<Vec<T>>
    where
        T: Send + 'static,
        Fut: std::future::Future<Output = AppResult<Vec<T>>> + Send,
    {
        let total = tables.len().max(1);
        let done = Arc::new(AtomicUsize::new(0));
        let compare_ref = &compare;
        let results: Vec<AppResult<Vec<T>>> = stream::iter(tables.to_vec())
            .map(move |table| {
                let src = source.clone();
                let tgt = target.clone();
                let done = done.clone();
                let cid = compare_id.map(String::from);
                let ctrl = controller.cloned();
                let handle = app_handle.cloned();
                let src_schema = source_schema.map(String::from);
                let tgt_schema = target_schema.map(String::from);
                let label = progress_label.to_string();
                let table_name = table.clone();
                async move {
                    if let Some(ctrl) = ctrl.as_ref() {
                        Self::check_control(cid.as_deref(), Some(ctrl)).await?;
                    }
                    let result = compare_ref(src, tgt, table, src_schema, tgt_schema).await;
                    let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                    if let Some(handle) = handle.as_ref() {
                        Self::emit_progress(
                            Some(handle),
                            cid.as_deref(),
                            &format!("{} ({}/{}): {}", label, n, total, table_name),
                            n,
                            total,
                        );
                    }
                    result
                }
            })
            .buffered(INTROSPECTION_CONCURRENCY)
            .collect()
            .await;

        let mut all = Vec::new();
        for r in results {
            match r {
                Ok(diffs) => all.extend(diffs),
                Err(e) => {
                    if e.to_string().to_lowercase().contains("cancelled") {
                        return Err(e);
                    }
                    tracing::warn!("{} comparison failed for a table: {}", progress_label, e);
                }
            }
        }
        Ok(all)
    }

    async fn compare_all_indexes(
        source: Arc<dyn DbDriver>,
        target: Arc<dyn DbDriver>,
        tables: &[String],
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
        app_handle: Option<&AppHandle>,
    ) -> AppResult<Vec<IndexDiff>> {
        let mut all = Self::compare_per_table(
            source,
            target,
            tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
            app_handle,
            "Comparing indexes",
            |src, tgt, table, src_schema, tgt_schema| async move {
                compare_table_indexes(
                    src.as_ref(),
                    tgt.as_ref(),
                    &table,
                    src_schema.as_deref(),
                    tgt_schema.as_deref(),
                )
                .await
            },
        )
        .await?;
        all.sort_by(|a, b| {
            a.table
                .to_lowercase()
                .cmp(&b.table.to_lowercase())
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(all)
    }

    async fn compare_all_foreign_keys(
        source: Arc<dyn DbDriver>,
        target: Arc<dyn DbDriver>,
        tables: &[String],
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
        app_handle: Option<&AppHandle>,
    ) -> AppResult<Vec<FkDiff>> {
        let mut all = Self::compare_per_table(
            source,
            target,
            tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
            app_handle,
            "Comparing foreign keys",
            |src, tgt, table, src_schema, tgt_schema| async move {
                compare_table_foreign_keys(
                    src.as_ref(),
                    tgt.as_ref(),
                    &table,
                    src_schema.as_deref(),
                    tgt_schema.as_deref(),
                )
                .await
            },
        )
        .await?;
        all.sort_by(|a, b| {
            a.table
                .to_lowercase()
                .cmp(&b.table.to_lowercase())
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(all)
    }

    async fn compare_all_constraints(
        source: Arc<dyn DbDriver>,
        target: Arc<dyn DbDriver>,
        tables: &[String],
        source_schema: Option<&str>,
        target_schema: Option<&str>,
        compare_id: Option<&str>,
        controller: Option<&SyncController>,
        app_handle: Option<&AppHandle>,
    ) -> AppResult<Vec<ConstraintDiff>> {
        let mut all = Self::compare_per_table(
            source,
            target,
            tables,
            source_schema,
            target_schema,
            compare_id,
            controller,
            app_handle,
            "Comparing constraints",
            |src, tgt, table, src_schema, tgt_schema| async move {
                compare_table_constraints(
                    src.as_ref(),
                    tgt.as_ref(),
                    &table,
                    src_schema.as_deref(),
                    tgt_schema.as_deref(),
                )
                .await
            },
        )
        .await?;
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
            name_map
                .entry(t.to_lowercase())
                .or_insert_with(|| t.clone());
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
        results.sort_by_key(|a| a.name.to_lowercase());
        results
    }
}

#[cfg(test)]
mod summary_tests {
    use super::*;

    fn obj(name: &str, status: CompareStatus) -> ObjectDiff {
        ObjectDiff {
            name: name.to_string(),
            status,
            details: None,
        }
    }

    #[test]
    fn summary_all_equal() {
        let s = CompareService::build_summary(
            &[
                obj("a", CompareStatus::Equal),
                obj("b", CompareStatus::Equal),
            ],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            "A",
            "B",
        );
        assert!(s.contains("coinciden en 2 de 2"));
        assert!(!s.contains("faltan"));
    }

    #[test]
    fn summary_missing_and_modified() {
        let s = CompareService::build_summary(
            &[
                obj("orders", CompareStatus::Equal),
                obj("invoices", CompareStatus::Missing),
                obj("users", CompareStatus::Modified),
                obj("payments", CompareStatus::Equal),
            ],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            "A",
            "B",
        );
        assert!(s.contains("coinciden en 2 de 4"));
        assert!(s.contains("Hay 1 objeto que existen en A pero faltan en B (invoices)"));
        assert!(s.contains("fue modificado"));
    }

    #[test]
    fn summary_new_only() {
        let s = CompareService::build_summary(
            &[],
            &[],
            &[],
            &[],
            &[],
            &[IndexDiff {
                name: "idx_1".into(),
                table: "t".into(),
                status: CompareStatus::New,
                columns_changed: None,
                unique_changed: None,
                type_changed: None,
            }],
            &[],
            &[],
            "A",
            "B",
        );
        assert!(s.contains("solo existen en B"));
    }
}
