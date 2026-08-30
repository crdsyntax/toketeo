use crate::application::sync::extractors::DataExtractor;
use crate::application::sync::strategies::{StrategyOutput, SyncEvent, SyncStrategy};
use crate::application::sync::transformers;
use crate::db::DataWriter;
use crate::error::AppResult;
use crate::models::sync::{
    ColumnMapping, PipelineStatus, SyncBatch, SyncPipeline, SyncRowError, SyncRun, SyncTableConfig,
};
use crate::state::{SyncControl, SyncController};
use crate::storage::Storage;
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

/// Configuración de batch adaptivo.
const ADAPTIVE_BATCH_INITIAL: usize = 1_000;
const ADAPTIVE_BATCH_MEDIUM: usize = 5_000;
const ADAPTIVE_BATCH_MAX: usize = 50_000;

/// Tiempos objetivo en milisegundos para decidir escalado.
const SCALE_UP_THRESHOLD_MS: u64 = 1_000; // Si batch < 1s, escalar
const SCALE_UP_AGGRESSIVE_MS: u64 = 500; // Si batch < 0.5s, escalar más
const SCALE_DOWN_THRESHOLD_MS: u64 = 5_000; // Si batch > 5s, reducir

/// MySQL prepared statement placeholder limit (65,535).
/// Each row uses num_columns placeholders, so max batch = 65535 / num_columns.
const MYSQL_PLACEHOLDER_LIMIT: usize = 65_535;

/// Estrategia de sincronización completa.
pub struct FullSync;

#[async_trait::async_trait]
impl SyncStrategy for FullSync {
    async fn execute(
        &self,
        pipeline: &SyncPipeline,
        table_config: &SyncTableConfig,
        extractor: &dyn DataExtractor,
        writer: &dyn DataWriter,
        storage: Arc<Storage>,
        event_sender: Option<tokio::sync::mpsc::UnboundedSender<SyncEvent>>,
        controller: &SyncController,
    ) -> AppResult<StrategyOutput> {
        let pipeline_id = pipeline.id.clone().unwrap_or_default();
        let pk = table_config
            .primary_key
            .as_ref()
            .and_then(|p| p.first())
            .cloned()
            .unwrap_or_else(|| "id".to_string());

        tracing::info!(
            "[full_sync] Table '{}': pk={}, columns={}, batch_size={}",
            table_config.source_table,
            pk,
            table_config.column_mappings.len(),
            pipeline.batch_size,
        );

        // Adaptive batch sizing: start with configured size, scale up/down based on performance
        let mut current_batch_size = pipeline.batch_size;
        let mut consecutive_fast_batches: u32 = 0;
        let mut consecutive_slow_batches: u32 = 0;

        // Calculate max safe batch size based on column count
        // Use 50% of MySQL placeholder limit to avoid connection drops from large packets
        let num_columns = table_config.column_mappings.len().max(1);
        let max_safe_batch = (MYSQL_PLACEHOLDER_LIMIT / num_columns) / 2;
        let adaptive_max = ADAPTIVE_BATCH_MAX.min(max_safe_batch);

        tracing::info!(
            "[full_sync] Table '{}': batch config: start={}, adaptive_max={}, max_safe_batch={}, columns={}",
            table_config.source_table,
            current_batch_size,
            adaptive_max,
            max_safe_batch,
            num_columns,
        );

        let mut mappings = table_config.column_mappings.clone();
        let mut columns: Vec<String> = mappings.iter().map(|m| m.source_column.clone()).collect();

        let mut dest_columns: Vec<String> = mappings
            .iter()
            .map(|m| m.destination_column.clone())
            .collect();

        let mut last_key: Option<serde_json::Value> = None;
        let mut batch_number: u64 = 0;
        let mut processed_rows: u64 = 0;
        let mut error_count: u64 = 0;
        let run_id = Uuid::new_v4().to_string();
        let started_at = chrono::Utc::now().to_rfc3339();

        let source_schema = pipeline.source_schema.as_deref();
        let target_schema = pipeline.target_schema.as_deref();

        let total_expected = extractor
            .count(&table_config.source_table, source_schema)
            .await
            .unwrap_or(0);

        if let Some(ref sender) = event_sender {
            let _ = sender.send(SyncEvent::Progress {
                table: table_config.source_table.clone(),
                processed_rows: 0,
                total_rows: total_expected,
                error_count: 0,
            });
        }

        loop {
            match controller.get(&pipeline_id).await {
                Some(SyncControl::Cancelled) => {
                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::Error {
                            message: "Sync cancelled by user".to_string(),
                        });
                    }
                    break;
                }
                Some(SyncControl::Paused) => {
                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::Error {
                            message: "Sync paused".to_string(),
                        });
                    }
                    loop {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        match controller.get(&pipeline_id).await {
                            Some(SyncControl::Cancelled) => break,
                            Some(SyncControl::Running) => break,
                            None => break,
                            _ => continue,
                        }
                    }
                    if controller.get(&pipeline_id).await == Some(SyncControl::Cancelled) {
                        if let Some(ref sender) = event_sender {
                            let _ = sender.send(SyncEvent::Error {
                                message: "Sync cancelled during pause".to_string(),
                            });
                        }
                        break;
                    }
                }
                None => break,
                _ => {}
            }

            let batch_start = Instant::now();
            batch_number += 1;

            let output = extractor
                .extract(
                    &table_config.source_table,
                    source_schema,
                    &columns,
                    &pk,
                    last_key,
                    current_batch_size,
                    batch_number,
                )
                .await?;

            if output.rows.is_empty() {
                break;
            }

            if mappings.is_empty() {
                if let Some(first_row) = output.rows.first() {
                    if let Some(obj) = first_row.as_object() {
                        for key in obj.keys() {
                            mappings.push(ColumnMapping {
                                source_column: key.clone(),
                                destination_column: key.clone(),
                                transform: None,
                            });
                        }
                        columns = mappings.iter().map(|m| m.source_column.clone()).collect();
                        dest_columns = mappings
                            .iter()
                            .map(|m| m.destination_column.clone())
                            .collect();
                    }
                }
            }

            let batch_size = output.rows.len();
            let raw_rows = output.rows.clone();

            // Transform + última barrera de null bytes: cualquier \0 que llegue
            // aquí se elimina y se reporta (fila/columna) para diagnóstico.
            let transformed =
                transform_and_strip(output.rows, &mappings, &pk, &table_config.source_table)?;

            let mut abort_table = false;
            let upsert_result = match writer
                .upsert_rows(
                    &table_config.target_table,
                    target_schema,
                    &dest_columns,
                    table_config.primary_key.as_deref().unwrap_or(&[]),
                    &transformed,
                )
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let err_str = e.to_string();
                    let column_name = extract_unknown_column(&err_str);

                    // La columna falta en el target: primero se crea
                    // (reconciliación de esquema en caliente); si no puede
                    // crearse, se cae al fallback de excluirla del sync.
                    if let Some(ref col) = column_name {
                        let col_type = infer_agnostic_type(&raw_rows, col);
                        match writer
                            .add_column(&table_config.target_table, target_schema, col, col_type)
                            .await
                        {
                            Ok(()) => {
                                tracing::info!(
                                    "[full_sync] Table '{}': created missing column '{}' on target ({}) — retrying batch",
                                    table_config.source_table,
                                    col,
                                    col_type,
                                );
                                let retry_transformed = transform_and_strip(
                                    raw_rows,
                                    &mappings,
                                    &pk,
                                    &table_config.source_table,
                                )?;
                                match writer
                                    .upsert_rows(
                                        &table_config.target_table,
                                        target_schema,
                                        &dest_columns,
                                        table_config.primary_key.as_deref().unwrap_or(&[]),
                                        &retry_transformed,
                                    )
                                    .await
                                {
                                    Ok(r) => r,
                                    Err(retry_err) => {
                                        tracing::error!(
                                            "[full_sync] Table '{}': retry after creating column '{}' failed: {} — skipping batch (original error: {})",
                                            table_config.source_table,
                                            col,
                                            retry_err,
                                            err_str,
                                        );
                                        if let Some(ref sender) = event_sender {
                                            let _ = sender.send(SyncEvent::RowError {
                                                table: table_config.source_table.clone(),
                                                row_key: None,
                                                error: format!(
                                                    "Batch {} failed; retry after creating '{}' also failed: {}",
                                                    batch_number, col, retry_err
                                                ),
                                            });
                                        }
                                        crate::db::UpsertResult::default()
                                    }
                                }
                            }
                            Err(add_err) => {
                                tracing::warn!(
                                    "[full_sync] Table '{}': could not create column '{}' on target: {} — falling back to removing it from sync",
                                    table_config.source_table,
                                    col,
                                    add_err,
                                );
                                let new_dest: Vec<String> =
                                    dest_columns.iter().filter(|c| c != &col).cloned().collect();
                                let new_columns: Vec<String> = columns
                                    .iter()
                                    .zip(dest_columns.iter())
                                    .filter(|(_, d)| d != &col)
                                    .map(|(s, _)| s.clone())
                                    .collect();
                                let new_mappings: Vec<ColumnMapping> = mappings
                                    .iter()
                                    .filter(|m| m.destination_column != *col)
                                    .cloned()
                                    .collect();

                                let new_transformed = transform_and_strip(
                                    raw_rows,
                                    &new_mappings,
                                    &pk,
                                    &table_config.source_table,
                                )?;

                                match writer
                                    .upsert_rows(
                                        &table_config.target_table,
                                        target_schema,
                                        &new_dest,
                                        table_config.primary_key.as_deref().unwrap_or(&[]),
                                        &new_transformed,
                                    )
                                    .await
                                {
                                    Ok(r) => {
                                        // Update mappings for subsequent batches
                                        mappings.clone_from(&new_mappings);
                                        columns.clone_from(&new_columns);
                                        dest_columns.clone_from(&new_dest);
                                        r
                                    }
                                    Err(retry_err) => {
                                        tracing::error!(
                                            "[full_sync] Table '{}': retry without '{}' also failed: {} — skipping batch (original error: {})",
                                            table_config.source_table,
                                            col,
                                            retry_err,
                                            err_str,
                                        );
                                        if let Some(ref sender) = event_sender {
                                            let _ = sender.send(SyncEvent::RowError {
                                                table: table_config.source_table.clone(),
                                                row_key: None,
                                                error: format!(
                                                    "Batch {} failed; retry after removing '{}' also failed: {}",
                                                    batch_number, col, retry_err
                                                ),
                                            });
                                        }
                                        crate::db::UpsertResult::default()
                                    }
                                }
                            }
                        }
                    } else if let Some(not_null_col) = extract_not_null_column(&err_str) {
                        // Violación NOT NULL: el target tiene la columna NOT NULL
                        // pero el source trae NULLs. Se relaja la restricción
                        // (DROP NOT NULL) y se reintenta el batch.
                        match writer
                            .drop_not_null(&table_config.target_table, target_schema, &not_null_col)
                            .await
                        {
                            Ok(()) => {
                                tracing::info!(
                                    "[full_sync] Table '{}': dropped NOT NULL on column '{}' — retrying batch",
                                    table_config.source_table,
                                    not_null_col,
                                );
                                let retry_transformed = transform_and_strip(
                                    raw_rows,
                                    &mappings,
                                    &pk,
                                    &table_config.source_table,
                                )?;
                                match writer
                                    .upsert_rows(
                                        &table_config.target_table,
                                        target_schema,
                                        &dest_columns,
                                        table_config.primary_key.as_deref().unwrap_or(&[]),
                                        &retry_transformed,
                                    )
                                    .await
                                {
                                    Ok(r) => r,
                                    Err(retry_err) => {
                                        tracing::error!(
                                            "[full_sync] Table '{}': retry after dropping NOT NULL on '{}' failed: {} — skipping batch (original error: {})",
                                            table_config.source_table,
                                            not_null_col,
                                            retry_err,
                                            err_str,
                                        );
                                        if let Some(ref sender) = event_sender {
                                            let _ = sender.send(SyncEvent::RowError {
                                                table: table_config.source_table.clone(),
                                                row_key: None,
                                                error: format!(
                                                    "Batch {} failed; retry after dropping NOT NULL on '{}' also failed: {}",
                                                    batch_number, not_null_col, retry_err
                                                ),
                                            });
                                        }
                                        crate::db::UpsertResult::default()
                                    }
                                }
                            }
                            Err(drop_err) => {
                                tracing::warn!(
                                    "[full_sync] Table '{}': could not drop NOT NULL on column '{}' on target: {} — skipping batch",
                                    table_config.source_table,
                                    not_null_col,
                                    drop_err,
                                );
                                if let Some(ref sender) = event_sender {
                                    let _ = sender.send(SyncEvent::RowError {
                                        table: table_config.source_table.clone(),
                                        row_key: None,
                                        error: format!(
                                            "Batch {} failed with NOT NULL violation on '{}' and the constraint could not be relaxed: {}",
                                            batch_number, not_null_col, drop_err
                                        ),
                                    });
                                }
                                crate::db::UpsertResult::default()
                            }
                        }
                    } else {
                        tracing::error!(
                            "[full_sync] Table '{}' batch {} upsert failed: {} — skipping batch, continuing",
                            table_config.source_table,
                            batch_number,
                            e,
                        );
                        if let Some(ref sender) = event_sender {
                            let _ = sender.send(SyncEvent::RowError {
                                table: table_config.source_table.clone(),
                                row_key: None,
                                error: format!("Batch {} upsert failed: {}", batch_number, e),
                            });
                        }

                        // Detect connection errors and scale down batch size
                        let err_str_lower = err_str.to_lowercase();
                        if (err_str_lower.contains("connection")
                            || err_str_lower.contains("aborted")
                            || err_str_lower.contains("10053")
                            || err_str_lower.contains("broken pipe")
                            || err_str_lower.contains("too many placeholders"))
                            && current_batch_size > ADAPTIVE_BATCH_INITIAL
                        {
                            let new_size = (current_batch_size / 2).max(ADAPTIVE_BATCH_INITIAL);
                            tracing::warn!(
                                    "[full_sync] Table '{}': connection/placeholder error, reducing batch {} → {}",
                                    table_config.source_table,
                                    current_batch_size,
                                    new_size,
                                );
                            current_batch_size = new_size;
                            consecutive_fast_batches = 0;
                            consecutive_slow_batches = 0;
                        }

                        // Abort remaining batches when the target table is missing
                        if err_str.contains("doesn't exist")
                            || err_str.contains("does not exist")
                            || err_str.contains("no such table")
                            || err_str.contains("Invalid object name")
                        {
                            tracing::error!(
                                "[full_sync] Table '{}' does not exist on target — aborting remaining batches",
                                table_config.source_table,
                            );
                            abort_table = true;
                        }
                        crate::db::UpsertResult::default()
                    }
                }
            };

            if abort_table {
                error_count += batch_size as u64;
                break;
            }

            processed_rows += upsert_result.affected;
            let batch_errors = (batch_size as u64)
                .saturating_sub(upsert_result.affected)
                .saturating_sub(upsert_result.skipped);
            error_count += batch_errors;
            let duration = batch_start.elapsed().as_millis() as u64;

            // Adaptive batch sizing logic
            if batch_errors == 0 {
                if duration < SCALE_UP_AGGRESSIVE_MS && current_batch_size < adaptive_max {
                    consecutive_fast_batches += 1;
                    consecutive_slow_batches = 0;
                    // Ramp up aggressively: 1 fast batch → 4x, 2+ → 2x
                    let multiplier = if consecutive_fast_batches == 1
                        && current_batch_size < ADAPTIVE_BATCH_INITIAL
                    {
                        4
                    } else {
                        2
                    };
                    if consecutive_fast_batches >= 1 {
                        let new_size = (current_batch_size * multiplier).min(adaptive_max);
                        if new_size > current_batch_size {
                            tracing::info!(
                                "[full_sync] Table '{}': batch {} fast ({}ms), scaling batch {} → {}",
                                table_config.source_table,
                                batch_number,
                                duration,
                                current_batch_size,
                                new_size,
                            );
                            current_batch_size = new_size;
                        }
                        consecutive_fast_batches = 0;
                    }
                } else if duration < SCALE_UP_THRESHOLD_MS && current_batch_size < adaptive_max {
                    consecutive_fast_batches += 1;
                    consecutive_slow_batches = 0;
                    if consecutive_fast_batches >= 2 {
                        let new_size =
                            (current_batch_size + ADAPTIVE_BATCH_MEDIUM).min(adaptive_max);
                        if new_size > current_batch_size {
                            tracing::info!(
                                "[full_sync] Table '{}': batch {} moderate ({}ms), scaling batch {} → {}",
                                table_config.source_table,
                                batch_number,
                                duration,
                                current_batch_size,
                                new_size,
                            );
                            current_batch_size = new_size;
                        }
                        consecutive_fast_batches = 0;
                    }
                } else if duration > SCALE_DOWN_THRESHOLD_MS
                    && current_batch_size > ADAPTIVE_BATCH_INITIAL
                {
                    consecutive_slow_batches += 1;
                    consecutive_fast_batches = 0;
                    if consecutive_slow_batches >= 2 {
                        let new_size = (current_batch_size / 2).max(ADAPTIVE_BATCH_INITIAL);
                        if new_size < current_batch_size {
                            tracing::info!(
                                "[full_sync] Table '{}': batch {} slow ({}ms), reducing batch {} → {}",
                                table_config.source_table,
                                batch_number,
                                duration,
                                current_batch_size,
                                new_size,
                            );
                            current_batch_size = new_size;
                        }
                        consecutive_slow_batches = 0;
                    }
                } else {
                    consecutive_fast_batches = 0;
                    consecutive_slow_batches = 0;
                }
            }

            let rows_per_sec = if duration > 0 {
                batch_size as f64 / duration as f64 * 1000.0
            } else {
                batch_size as f64
            };
            tracing::debug!(
                "[full_sync] Table '{}' batch {}: extracted={}, loaded={}, skipped={}, errors={}, duration={}ms, batch_size={}, rows/sec={:.0}",
                table_config.source_table,
                batch_number,
                batch_size,
                upsert_result.affected,
                upsert_result.skipped,
                batch_errors,
                duration,
                current_batch_size,
                rows_per_sec,
            );

            let batch_id = Uuid::new_v4().to_string();
            let sync_batch = SyncBatch {
                id: batch_id.clone(),
                run_id: run_id.clone(),
                batch_number,
                table_name: table_config.source_table.clone(),
                rows_extracted: batch_size as u64,
                rows_loaded: upsert_result.affected,
                skipped_rows: upsert_result.skipped,
                duration_ms: duration,
                status: if batch_errors == 0 {
                    "completed".to_string()
                } else {
                    "completed_with_errors".to_string()
                },
                error_message: if batch_errors > 0 {
                    Some(format!("{batch_errors} rows failed"))
                } else {
                    None
                },
            };
            if let Err(e) = storage.save_sync_batch(&sync_batch).await {
                tracing::error!("Failed to persist sync batch: {e}");
            }

            if batch_errors > 0 {
                let row_error = SyncRowError {
                    id: Uuid::new_v4().to_string(),
                    batch_id: batch_id.clone(),
                    row_key: None,
                    column_name: None,
                    error_message: format!("{batch_errors} rows failed in batch {batch_number}"),
                    raw_value: None,
                };
                if let Err(e) = storage.save_sync_row_error(&row_error).await {
                    tracing::error!("Failed to persist sync row error: {e}");
                }
            }

            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::BatchCompleted {
                    table: table_config.source_table.clone(),
                    batch_number,
                    rows_loaded: upsert_result.affected,
                    skipped: upsert_result.skipped,
                    duration_ms: duration,
                });
                if batch_errors > 0 {
                    let _ = sender.send(SyncEvent::RowError {
                        table: table_config.source_table.clone(),
                        row_key: None,
                        error: format!("{batch_errors} rows failed in batch {batch_number}"),
                    });
                }
                let _ = sender.send(SyncEvent::Progress {
                    table: table_config.source_table.clone(),
                    processed_rows,
                    total_rows: total_expected,
                    error_count,
                });
            }

            if !output.has_more {
                break;
            }

            last_key = output.next_key;
        }

        if let Some(ref sender) = event_sender {
            let _ = sender.send(SyncEvent::PhaseCompleted {
                table: table_config.source_table.clone(),
                total_rows: processed_rows,
            });
        }

        Ok(StrategyOutput {
            run: SyncRun {
                id: run_id,
                pipeline_id,
                status: PipelineStatus::Completed,
                started_at: Some(started_at),
                completed_at: Some(chrono::Utc::now().to_rfc3339()),
                total_rows: total_expected,
                processed_rows,
                error_count,
                batch_count: batch_number,
            },
            total_rows: processed_rows,
            batch_count: batch_number,
            error_count,
        })
    }
}

/// Transforma las filas con `transformers::transform_rows` y aplica la última
/// barrera de null bytes: elimina cualquier `\0` de valores y claves, y reporta
/// qué (fila, columna) los contenía. Garantiza que el writer nunca reciba \0.
fn transform_and_strip(
    rows: Vec<serde_json::Value>,
    mappings: &[ColumnMapping],
    pk: &str,
    table: &str,
) -> AppResult<Vec<serde_json::Value>> {
    let mut out = transformers::transform_rows(rows, mappings)?;
    let hits = strip_null_bytes(&mut out, pk);
    if !hits.is_empty() {
        tracing::warn!(
            "[full_sync] Table '{}': stripped null bytes (0x00) from {} value(s) before upsert; hits: {:?}",
            table,
            hits.len(),
            hits.iter().take(10).collect::<Vec<_>>(),
        );
    }
    Ok(out)
}

/// Elimina null bytes (0x00) de todos los strings de las filas (valores y
/// claves JSON, recursivo) y devuelve los hits (row_key, columna) afectados.
fn strip_null_bytes(rows: &mut [serde_json::Value], pk: &str) -> Vec<(String, String)> {
    let mut hits = Vec::new();
    for row in rows {
        let row_key = row
            .get(pk)
            .map(|v| v.to_string())
            .unwrap_or_else(|| "<none>".to_string());
        if let Some(obj) = row.as_object_mut() {
            for (col, val) in obj.iter_mut() {
                strip_null_bytes_in_value(val, &row_key, col, &mut hits);
            }
        }
    }
    hits
}

fn strip_null_bytes_in_value(
    val: &mut serde_json::Value,
    row_key: &str,
    column: &str,
    hits: &mut Vec<(String, String)>,
) {
    match val {
        serde_json::Value::String(s) => {
            if s.contains('\0') {
                let clean = s.replace('\0', "");
                hits.push((row_key.to_string(), column.to_string()));
                *s = clean;
            }
        }
        serde_json::Value::Object(map) => {
            let old = std::mem::take(map);
            let mut new_map = serde_json::Map::with_capacity(old.len());
            for (k, v) in old {
                let mut val = v;
                let (clean_key, key_was_stripped) = if k.contains('\0') {
                    (k.replace('\0', ""), true)
                } else {
                    (k, false)
                };
                let nested = if column.is_empty() {
                    clean_key.clone()
                } else {
                    format!("{column}.{clean_key}")
                };
                strip_null_bytes_in_value(&mut val, row_key, &nested, hits);
                if key_was_stripped {
                    hits.push((row_key.to_string(), nested));
                }
                new_map.insert(clean_key, val);
            }
            *map = new_map;
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_null_bytes_in_value(v, row_key, column, hits);
            }
        }
        _ => {}
    }
}

/// Extrae el nombre de la columna de un error de violación NOT NULL.
/// PostgreSQL: `null value in column "segment" of relation "attributes"
/// violates not-null constraint`. También MySQL / SQLite / SQL Server.
fn extract_not_null_column(err: &str) -> Option<String> {
    // PostgreSQL
    if err.contains("violates not-null constraint") {
        if let Some(start) = err.find("column \"") {
            let rest = &err[start + 8..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
    }
    // MySQL / MariaDB: Column 'segment' cannot be null
    if err.contains("cannot be null") {
        if let Some(start) = err.find("Column '") {
            let rest = &err[start + 8..];
            if let Some(end) = rest.find('\'') {
                return Some(rest[..end].to_string());
            }
        }
    }
    // SQLite: NOT NULL constraint failed: attributes.segment
    if err.contains("NOT NULL constraint failed") {
        if let Some(start) = err.find("failed: ") {
            let rest = &err[start + 8..];
            if let Some(end) = rest.rfind('.') {
                return Some(rest[end + 1..].to_string());
            }
            return Some(rest.to_string());
        }
    }
    // SQL Server: Cannot insert the value NULL into column 'segment'
    if err.contains("NULL into column") {
        if let Some(start) = err.find("column '") {
            let rest = &err[start + 8..];
            if let Some(end) = rest.find('\'') {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

/// Infiere un tipo de columna agnóstico al dialecto ("text", "bigint",
/// "double", "boolean", "json") a partir del primer valor no-nulo de la
/// columna en el batch. Se usa para `DataWriter::add_column` en la
/// reconciliación en caliente.
fn infer_agnostic_type(rows: &[serde_json::Value], column: &str) -> &'static str {
    for row in rows {
        match row.get(column) {
            Some(serde_json::Value::String(_)) => return "text",
            Some(serde_json::Value::Number(n)) => {
                if n.is_i64() || n.is_u64() {
                    return "bigint";
                }
                return "double";
            }
            Some(serde_json::Value::Bool(_)) => return "boolean",
            Some(serde_json::Value::Array(_)) | Some(serde_json::Value::Object(_)) => {
                return "json"
            }
            _ => {}
        }
    }
    "text"
}

/// Extract the unknown column name from MySQL/MariaDB error messages.
/// Handles format: `Unknown column 'agencia_id' in 'INSERT INTO'`
fn extract_unknown_column(err: &str) -> Option<String> {
    // MySQL / MariaDB: Unknown column 'xxx' in '...'
    if let Some(start) = err.find("Unknown column '") {
        let rest = &err[start + 16..];
        if let Some(end) = rest.find('\'') {
            return Some(rest[..end].to_string());
        }
    }
    // PostgreSQL: column "xxx" of relation "yyy" does not exist.
    // Requiere "does not exist" para NO confundir errores de tipo enum como
    // `column "status" is of type X but expression is of type text`.
    if err.contains("does not exist") {
        if let Some(start) = err.find("column \"") {
            let rest = &err[start + 8..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
    }
    // SQL Server: Invalid column name 'xxx'
    if let Some(start) = err.find("Invalid column name '") {
        let rest = &err[start + 21..];
        if let Some(end) = rest.find('\'') {
            return Some(rest[..end].to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::sync::extractors::sql_extractor::SqlExtractor;
    use crate::db::{DataReader, DataWriter};
    use crate::models::sync::{
        ColumnMapping, PipelineStatus, SyncMode, SyncPipeline, SyncTableConfig,
    };
    use crate::state::SyncController;
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::Mutex;

    const NUM_TABLES: usize = 70;
    const ROWS_PER_TABLE: usize = 200;
    const BATCH_SIZE: usize = 50;

    /// Generates table names: table_00 .. table_69
    fn table_name(idx: usize) -> String {
        format!("table_{:02}", idx)
    }

    /// Generates a row for a given table and row index.
    fn make_row(table_idx: usize, row_idx: usize) -> serde_json::Value {
        serde_json::json!({
            "id": (table_idx * ROWS_PER_TABLE + row_idx) as i64,
            "name": format!("item_{}_{}", table_idx, row_idx),
            "value": (row_idx as f64) * 1.5,
            "created_at": format!("2024-01-01T00:{:02}:00Z", row_idx % 60),
        })
    }

    // ── Mock Source Reader ──

    struct MockSourceReader {
        data: HashMap<String, Vec<serde_json::Value>>,
    }

    impl MockSourceReader {
        fn new() -> Self {
            let mut data = HashMap::new();
            for t in 0..NUM_TABLES {
                let name = table_name(t);
                let rows: Vec<serde_json::Value> =
                    (0..ROWS_PER_TABLE).map(|r| make_row(t, r)).collect();
                data.insert(name, rows);
            }
            Self { data }
        }
    }

    #[async_trait]
    impl DataReader for MockSourceReader {
        async fn fetch_rows(
            &self,
            table: &str,
            _schema: Option<&str>,
            _columns: &[String],
            pk_column: &str,
            last_key: Option<serde_json::Value>,
            batch_size: usize,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            let all_rows = self.data.get(table).cloned().unwrap_or_default();

            let start_idx = match last_key {
                Some(key) => {
                    let last_pk = key.as_i64().unwrap_or(-1);
                    all_rows
                        .iter()
                        .position(|r| {
                            r.get(pk_column)
                                .and_then(|v| v.as_i64())
                                .map(|id| id > last_pk)
                                .unwrap_or(false)
                        })
                        .unwrap_or(all_rows.len())
                }
                None => 0,
            };

            let end = (start_idx + batch_size).min(all_rows.len());
            Ok(all_rows[start_idx..end].to_vec())
        }

        async fn count_rows(
            &self,
            table: &str,
            _schema: Option<&str>,
        ) -> crate::error::AppResult<u64> {
            Ok(self.data.get(table).map(|r| r.len() as u64).unwrap_or(0))
        }
    }

    // ── Mock Target Writer ──

    struct MockTargetWriter {
        written: Arc<Mutex<HashMap<String, Vec<serde_json::Value>>>>,
    }

    impl MockTargetWriter {
        fn new() -> Self {
            Self {
                written: Arc::new(Mutex::new(HashMap::new())),
            }
        }

        async fn total_rows_written(&self) -> u64 {
            let guard = self.written.lock().await;
            guard.values().map(|v| v.len() as u64).sum()
        }

        async fn rows_for_table(&self, table: &str) -> usize {
            let guard = self.written.lock().await;
            guard.get(table).map(|v| v.len()).unwrap_or(0)
        }
    }

    #[async_trait]
    impl DataWriter for MockTargetWriter {
        async fn upsert_rows(
            &self,
            table: &str,
            _schema: Option<&str>,
            _columns: &[String],
            _primary_keys: &[String],
            rows: &[serde_json::Value],
        ) -> crate::error::AppResult<crate::db::UpsertResult> {
            let mut guard = self.written.lock().await;
            let entry = guard.entry(table.to_string()).or_insert_with(Vec::new);
            entry.extend(rows.iter().cloned());
            Ok(crate::db::UpsertResult {
                affected: rows.len() as u64,
                skipped: 0,
            })
        }
    }

    // ── Helpers ──

    fn make_pipeline(tables: Vec<SyncTableConfig>, batch_size: usize) -> SyncPipeline {
        SyncPipeline {
            id: Some("test-pipeline-001".into()),
            name: "Cross DB Sync Test".into(),
            source_connection_id: "source-pg".into(),
            target_connection_id: "target-mysql".into(),
            source_schema: None,
            target_schema: None,
            mode: SyncMode::Full,
            status: PipelineStatus::Ready,
            tables,
            batch_size,
            created_at: None,
            updated_at: None,
        }
    }

    fn make_table_config(source: &str, target: &str) -> SyncTableConfig {
        SyncTableConfig {
            source_table: source.into(),
            target_table: target.into(),
            column_mappings: vec![
                ColumnMapping {
                    source_column: "id".into(),
                    destination_column: "id".into(),
                    transform: None,
                },
                ColumnMapping {
                    source_column: "name".into(),
                    destination_column: "name".into(),
                    transform: None,
                },
                ColumnMapping {
                    source_column: "value".into(),
                    destination_column: "value".into(),
                    transform: None,
                },
                ColumnMapping {
                    source_column: "created_at".into(),
                    destination_column: "created_at".into(),
                    transform: None,
                },
            ],
            filters: None,
            primary_key: Some(vec!["id".into()]),
        }
    }

    fn make_all_table_configs() -> Vec<SyncTableConfig> {
        (0..NUM_TABLES)
            .map(|i| {
                let name = table_name(i);
                make_table_config(&name, &name)
            })
            .collect()
    }

    async fn create_test_storage() -> Arc<Storage> {
        let dir = std::env::temp_dir().join(format!("toketeo_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        // Create the file explicitly so SQLite can open it
        std::fs::File::create(&db_path).unwrap();
        Arc::new(Storage::new(db_path).await.unwrap())
    }

    // ── Tests ──

    #[test]
    fn extract_unknown_column_ignores_unrelated_errors() {
        assert_eq!(
            extract_unknown_column("relation \"brands\" does not exist"),
            None
        );
        assert_eq!(extract_unknown_column("type \"x\" does not exist"), None);
        assert_eq!(extract_unknown_column("connection refused"), None);
    }

    #[test]
    fn extract_not_null_column_matches_per_engine() {
        assert_eq!(
            extract_not_null_column(
                r#"null value in column "segment" of relation "attributes" violates not-null constraint"#
            ),
            Some("segment".to_string())
        );
        assert_eq!(
            extract_not_null_column("Column 'segment' cannot be null"),
            Some("segment".to_string())
        );
        assert_eq!(
            extract_not_null_column("NOT NULL constraint failed: attributes.segment"),
            Some("segment".to_string())
        );
        assert_eq!(
            extract_not_null_column("Cannot insert the value NULL into column 'segment'."),
            Some("segment".to_string())
        );
        assert_eq!(extract_not_null_column("connection refused"), None);
    }

    #[test]
    fn strip_null_bytes_removes_and_reports_hits() {
        let mut rows = vec![serde_json::json!({
            "id": 1,
            "name": "a\u{0}b",
            "meta": { "x\u{0}y": "v\u{0}", "arr": ["z\u{0}"] },
        })];
        let hits = strip_null_bytes(&mut rows, "id");
        assert!(!hits.is_empty());
        assert_eq!(rows[0]["name"], serde_json::json!("ab"));
        assert!(rows[0]["meta"].as_object().unwrap().contains_key("xy"));
        assert_eq!(rows[0]["meta"]["xy"], serde_json::json!("v"));
        assert_eq!(rows[0]["meta"]["arr"][0], serde_json::json!("z"));
        // Debe reportar al menos name y las claves anidadas.
        assert!(hits.iter().any(|(_, col)| col == "name"));
        assert!(hits.iter().any(|(_, col)| col == "meta.xy"));
    }

    #[test]
    fn extract_unknown_column_ignores_enum_type_mismatch() {
        // El error de enum NO es una columna faltante: no debe devolver "status".
        assert_eq!(
            extract_unknown_column(
                r#"column "status" is of type merchant_verification_status_enum but expression is of type text"#
            ),
            None
        );
        // Otro error con "column X is of type ..." tampoco debe casar.
        assert_eq!(
            extract_unknown_column(
                r#"column "amount" is of type numeric but expression is of type text"#
            ),
            None
        );
    }

    #[test]
    fn extract_unknown_column_matches_real_missing_columns() {
        assert_eq!(
            extract_unknown_column(r#"column "agencia_id" of relation "brands" does not exist"#),
            Some("agencia_id".to_string())
        );
        assert_eq!(
            extract_unknown_column("Unknown column 'price' in 'INSERT INTO ...'"),
            Some("price".to_string())
        );
        assert_eq!(
            extract_unknown_column("Invalid column name 'status'."),
            Some("status".to_string())
        );
    }

    #[tokio::test]
    async fn test_full_sync_70_tables_200_records_each() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller
            .set("test-pipeline-001", SyncControl::Running)
            .await;

        let pipeline = make_pipeline(make_all_table_configs(), BATCH_SIZE);

        // Execute sync for each table (simulating SyncService loop)
        for table_config in &pipeline.tables {
            let extractor = SqlExtractor::new(&source);
            let output = FullSync
                .execute(
                    &pipeline,
                    table_config,
                    &extractor,
                    &writer,
                    storage.clone(),
                    None,
                    &controller,
                )
                .await
                .unwrap();

            assert_eq!(
                output.error_count, 0,
                "Table {} should have 0 errors",
                table_config.source_table
            );
            assert_eq!(
                output.total_rows, ROWS_PER_TABLE as u64,
                "Table {} should have {} rows",
                table_config.source_table, ROWS_PER_TABLE
            );
        }

        // Verify total rows written
        let total = writer.total_rows_written().await;
        assert_eq!(
            total,
            (NUM_TABLES * ROWS_PER_TABLE) as u64,
            "Total rows should be {} (70 tables × 200 rows)",
            NUM_TABLES * ROWS_PER_TABLE
        );

        // Verify each table has correct row count
        for t in 0..NUM_TABLES {
            let name = table_name(t);
            let count = writer.rows_for_table(&name).await;
            assert_eq!(
                count, ROWS_PER_TABLE,
                "Table {} should have {} rows written",
                name, ROWS_PER_TABLE
            );
        }
    }

    #[tokio::test]
    async fn test_full_sync_progress_events() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller
            .set("test-pipeline-001", SyncControl::Running)
            .await;

        let pipeline = make_pipeline(vec![make_table_config("table_00", "table_00")], BATCH_SIZE);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();

        // Execute sync for the single table
        let extractor = SqlExtractor::new(&source);
        let output = FullSync
            .execute(
                &pipeline,
                &pipeline.tables[0],
                &extractor,
                &writer,
                storage.clone(),
                Some(tx),
                &controller,
            )
            .await
            .unwrap();

        assert_eq!(output.total_rows, ROWS_PER_TABLE as u64);

        // Collect all events
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }

        // Verify we got initial Progress(0), BatchCompleted events, Progress updates, and PhaseCompleted
        let progress_events: Vec<&SyncEvent> = events
            .iter()
            .filter(|e| matches!(e, SyncEvent::Progress { .. }))
            .collect();
        let batch_events: Vec<&SyncEvent> = events
            .iter()
            .filter(|e| matches!(e, SyncEvent::BatchCompleted { .. }))
            .collect();
        let phase_events: Vec<&SyncEvent> = events
            .iter()
            .filter(|e| matches!(e, SyncEvent::PhaseCompleted { .. }))
            .collect();

        // First progress event should show 0 processed rows
        if let SyncEvent::Progress {
            processed_rows,
            total_rows,
            ..
        } = progress_events.first().unwrap()
        {
            assert_eq!(*processed_rows, 0);
            assert_eq!(*total_rows, ROWS_PER_TABLE as u64);
        } else {
            panic!("First event should be Progress with 0 processed rows");
        }

        // With adaptive batching, batch count may vary — just verify at least 1 batch completed
        assert!(
            !batch_events.is_empty(),
            "Should have at least 1 batch completed event"
        );

        // Each batch should report rows_loaded > 0
        for batch_event in &batch_events {
            if let SyncEvent::BatchCompleted { rows_loaded, .. } = batch_event {
                assert!(*rows_loaded > 0, "Each batch should load at least 1 row");
            }
        }

        // Last progress event should show 200 processed rows
        let last_progress = progress_events.last().unwrap();
        if let SyncEvent::Progress {
            processed_rows,
            error_count,
            ..
        } = last_progress
        {
            assert_eq!(*processed_rows, ROWS_PER_TABLE as u64);
            assert_eq!(*error_count, 0);
        }

        // Should have exactly 1 PhaseCompleted event
        assert_eq!(phase_events.len(), 1, "Should have 1 PhaseCompleted event");
        if let SyncEvent::PhaseCompleted { total_rows, .. } = phase_events.first().unwrap() {
            assert_eq!(*total_rows, ROWS_PER_TABLE as u64);
        }
    }

    #[tokio::test]
    async fn test_full_sync_cancellation() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        let pipeline_id = "test-pipeline-001";
        controller.set(pipeline_id, SyncControl::Running).await;

        let pipeline = make_pipeline(vec![make_table_config("table_00", "table_00")], BATCH_SIZE);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();

        // Cancel before execution starts
        controller.set(pipeline_id, SyncControl::Cancelled).await;

        let extractor = SqlExtractor::new(&source);
        let output = FullSync
            .execute(
                &pipeline,
                &pipeline.tables[0],
                &extractor,
                &writer,
                storage.clone(),
                Some(tx),
                &controller,
            )
            .await
            .unwrap();

        // Should have 0 processed rows since we cancelled immediately
        assert_eq!(output.total_rows, 0, "Cancelled sync should process 0 rows");
        assert_eq!(
            output.batch_count, 0,
            "Cancelled sync should have 0 batches"
        );

        // Verify no rows were written
        let total = writer.total_rows_written().await;
        assert_eq!(total, 0, "Cancelled sync should write 0 rows");

        // Verify we got an Error event about cancellation
        let events: Vec<SyncEvent> = {
            let mut v = Vec::new();
            while let Ok(e) = rx.try_recv() {
                v.push(e);
            }
            v
        };
        let has_cancel_error = events
            .iter()
            .any(|e| matches!(e, SyncEvent::Error { message } if message.contains("cancelled")));
        assert!(
            has_cancel_error,
            "Should have received a cancellation error event"
        );
    }

    #[tokio::test]
    async fn test_full_sync_batch_persistence() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller
            .set("test-pipeline-001", SyncControl::Running)
            .await;

        // Use a single table with small batch to ensure multiple batches
        let pipeline = make_pipeline(vec![make_table_config("table_00", "table_00")], BATCH_SIZE);

        let extractor = SqlExtractor::new(&source);
        let output = FullSync
            .execute(
                &pipeline,
                &pipeline.tables[0],
                &extractor,
                &writer,
                storage.clone(),
                None,
                &controller,
            )
            .await
            .unwrap();

        // Verify batches were persisted
        let batches = storage.list_sync_batches(&output.run.id).await.unwrap();
        assert_eq!(
            batches.len() as u64,
            output.batch_count,
            "Number of persisted batches should match batch_count"
        );

        // Verify each batch record has correct metadata
        for batch in &batches {
            assert_eq!(batch.table_name, "table_00");
            assert!(
                batch.rows_extracted > 0,
                "Each batch should have extracted rows"
            );
            assert!(batch.rows_loaded > 0, "Each batch should have loaded rows");
            assert_eq!(batch.status, "completed", "Each batch should be completed");
            assert!(
                batch.duration_ms < 5000,
                "Batch duration should be reasonable"
            );
        }

        // Verify total rows across all batches
        let total_extracted: u64 = batches.iter().map(|b| b.rows_extracted).sum();
        let total_loaded: u64 = batches.iter().map(|b| b.rows_loaded).sum();
        assert_eq!(total_extracted, ROWS_PER_TABLE as u64);
        assert_eq!(total_loaded, ROWS_PER_TABLE as u64);
    }

    #[tokio::test]
    async fn test_full_sync_all_70_tables_with_progress_tracking() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller
            .set("test-pipeline-001", SyncControl::Running)
            .await;

        let pipeline = make_pipeline(make_all_table_configs(), BATCH_SIZE);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();

        // Track per-table progress
        let mut table_processed: HashMap<String, u64> = HashMap::new();
        let mut table_totals: HashMap<String, u64> = HashMap::new();
        let mut tables_completed: Vec<String> = Vec::new();

        for table_config in &pipeline.tables {
            let extractor = SqlExtractor::new(&source);
            let table_tx = tx.clone();
            let output = FullSync
                .execute(
                    &pipeline,
                    table_config,
                    &extractor,
                    &writer,
                    storage.clone(),
                    Some(table_tx),
                    &controller,
                )
                .await
                .unwrap();

            assert_eq!(
                output.error_count, 0,
                "Table {} should have 0 errors",
                table_config.source_table
            );
            assert_eq!(output.total_rows, ROWS_PER_TABLE as u64);

            tables_completed.push(table_config.source_table.clone());
        }

        // Drain remaining events
        while let Ok(event) = rx.try_recv() {
            match event {
                SyncEvent::Progress {
                    table,
                    processed_rows,
                    total_rows,
                    ..
                } => {
                    table_processed.insert(table.clone(), processed_rows);
                    table_totals.insert(table.clone(), total_rows);
                }
                SyncEvent::PhaseCompleted { table, total_rows } => {
                    table_processed.insert(table.clone(), total_rows);
                }
                _ => {}
            }
        }

        // Verify all 70 tables were synced
        assert_eq!(
            tables_completed.len(),
            NUM_TABLES,
            "All 70 tables should be synced"
        );

        // Verify final progress for each table shows 200 rows
        for t in 0..NUM_TABLES {
            let name = table_name(t);
            let processed = table_processed.get(&name).copied().unwrap_or(0);
            assert_eq!(
                processed, ROWS_PER_TABLE as u64,
                "Table {} should show {} processed rows",
                name, ROWS_PER_TABLE
            );
        }

        // Verify total rows across all tables
        let total = writer.total_rows_written().await;
        assert_eq!(total, (NUM_TABLES * ROWS_PER_TABLE) as u64);
    }
}
