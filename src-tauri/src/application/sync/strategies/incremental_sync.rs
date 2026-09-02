use crate::application::sync::extractors::DataExtractor;
use crate::application::sync::strategies::{StrategyOutput, SyncEvent, SyncStrategy};
use crate::application::sync::transformers;
use crate::db::DataWriter;
use crate::error::AppResult;
use crate::models::sync::{
    ColumnMapping, PipelineStatus, SyncBatch, SyncCheckpoint, SyncPipeline, SyncRowError, SyncRun,
    SyncTableConfig,
};
use crate::state::{SyncControl, SyncController};
use crate::storage::Storage;
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

const ADAPTIVE_BATCH_INITIAL: usize = 1_000;
const ADAPTIVE_BATCH_MEDIUM: usize = 5_000;
const ADAPTIVE_BATCH_MAX: usize = 50_000;

const SCALE_UP_THRESHOLD_MS: u64 = 1_000;
const SCALE_UP_AGGRESSIVE_MS: u64 = 500;
const SCALE_DOWN_THRESHOLD_MS: u64 = 5_000;

const MYSQL_PLACEHOLDER_LIMIT: usize = 65_535;

const MAX_NETWORK_RETRIES: u32 = 10;
const INITIAL_RETRY_DELAY_MS: u64 = 1_000;
const MAX_RETRY_DELAY_MS: u32 = 30_000;

fn is_transient_network_error(err_str: &str) -> bool {
    let lower = err_str.to_lowercase();
    lower.contains("connection")
        || lower.contains("network")
        || lower.contains("broken pipe")
        || lower.contains("reset by peer")
        || lower.contains("timeout")
        || lower.contains("timed out")
        || lower.contains("socket")
        || lower.contains("10053")
        || lower.contains("10054")
        || lower.contains("10060")
        || lower.contains("10061")
        || lower.contains("aborted")
        || lower.contains("closed")
        || lower.contains("eof")
        || lower.contains("server closed the connection")
        || lower.contains("connection refused")
        || lower.contains("failed to connect")
        || lower.contains("io error")
        || lower.contains("os error")
}

pub struct IncrementalSync;

#[async_trait::async_trait]
impl SyncStrategy for IncrementalSync {
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
            "[incremental_sync] Table '{}': pk={}, columns={}, batch_size={}",
            table_config.source_table,
            pk,
            table_config.column_mappings.len(),
            pipeline.batch_size,
        );

        let mut current_batch_size = pipeline.batch_size;
        let mut consecutive_fast_batches: u32 = 0;
        let mut consecutive_slow_batches: u32 = 0;

        let num_columns = table_config.column_mappings.len().max(1);
        let max_safe_batch = (MYSQL_PLACEHOLDER_LIMIT / num_columns) / 2;
        let adaptive_max = ADAPTIVE_BATCH_MAX.min(max_safe_batch);

        let mut mappings = table_config.column_mappings.clone();
        let mut columns: Vec<String> = mappings.iter().map(|m| m.source_column.clone()).collect();

        let mut dest_columns: Vec<String> = mappings
            .iter()
            .map(|m| m.destination_column.clone())
            .collect();

        let run_id = Uuid::new_v4().to_string();
        let started_at = chrono::Utc::now().to_rfc3339();

        let checkpoint = storage
            .get_sync_checkpoint(&pipeline_id, &table_config.source_table)
            .await
            .ok()
            .flatten();

        if let Some(ref cp) = checkpoint {
            if cp.last_processed_key.as_deref() == Some("__COMPLETED__") {
                tracing::info!(
                    "[incremental_sync] Table '{}' already marked as __COMPLETED__ in checkpoint — skipping",
                    table_config.source_table
                );
                return Ok(StrategyOutput {
                    run: SyncRun {
                        id: run_id,
                        pipeline_id,
                        status: PipelineStatus::Completed,
                        started_at: Some(started_at),
                        completed_at: Some(chrono::Utc::now().to_rfc3339()),
                        total_rows: 0,
                        processed_rows: 0,
                        error_count: 0,
                        batch_count: cp.batch_number,
                    },
                    total_rows: 0,
                    batch_count: cp.batch_number,
                    error_count: 0,
                });
            }
        }

        let mut last_key: Option<serde_json::Value> = checkpoint
            .as_ref()
            .and_then(|c| c.last_processed_key.clone())
            .and_then(|k| serde_json::from_str(&k).ok());

        let mut batch_number: u64 = checkpoint.as_ref().map(|c| c.batch_number).unwrap_or(0);
        let mut processed_rows: u64 = 0;
        let mut error_count: u64 = 0;

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

        if let Some(ref cp) = checkpoint {
            tracing::info!(
                "Resuming incremental sync for {} from batch {}",
                table_config.source_table,
                cp.batch_number
            );
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

            let mut extract_attempt = 0;
            let output = loop {
                extract_attempt += 1;
                match extractor
                    .extract(
                        &table_config.source_table,
                        source_schema,
                        &columns,
                        &pk,
                        last_key.clone(),
                        current_batch_size,
                        batch_number,
                    )
                    .await
                {
                    Ok(out) => break out,
                    Err(e) => {
                        let err_str = e.to_string();
                        if is_transient_network_error(&err_str)
                            && extract_attempt <= MAX_NETWORK_RETRIES
                        {
                            let delay = std::time::Duration::from_millis(
                                (INITIAL_RETRY_DELAY_MS * (2_u64.pow(extract_attempt.min(6) - 1)))
                                    .min(MAX_RETRY_DELAY_MS as u64),
                            );
                            tracing::warn!(
                                "[incremental_sync] Table '{}' extract failed (attempt {}/{}): {} — retrying in {}ms",
                                table_config.source_table,
                                extract_attempt,
                                MAX_NETWORK_RETRIES,
                                err_str,
                                delay.as_millis()
                            );
                            if let Some(ref sender) = event_sender {
                                let _ = sender.send(SyncEvent::RowError {
                                    table: table_config.source_table.clone(),
                                    row_key: None,
                                    error: format!(
                                        "Intermitencia de red durante extracción (intento {}/{}). Reintentando en {}s...",
                                        extract_attempt,
                                        MAX_NETWORK_RETRIES,
                                        delay.as_secs().max(1)
                                    ),
                                });
                            }
                            let sleep_end = Instant::now() + delay;
                            while Instant::now() < sleep_end {
                                if controller.get(&pipeline_id).await
                                    == Some(SyncControl::Cancelled)
                                {
                                    return Err(e);
                                }
                                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                            }
                            continue;
                        } else {
                            return Err(e);
                        }
                    }
                }
            };

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
            let transformed = transformers::transform_rows(output.rows, &mappings)?;

            let mut upsert_attempt = 0;
            let upsert_result = loop {
                upsert_attempt += 1;
                match writer
                    .upsert_rows(
                        &table_config.target_table,
                        target_schema,
                        &dest_columns,
                        table_config.primary_key.as_deref().unwrap_or(&[]),
                        &transformed,
                    )
                    .await
                {
                    Ok(r) => break r,
                    Err(e) => {
                        let err_str = e.to_string();
                        if is_transient_network_error(&err_str)
                            && upsert_attempt <= MAX_NETWORK_RETRIES
                        {
                            let delay = std::time::Duration::from_millis(
                                (INITIAL_RETRY_DELAY_MS * (2_u64.pow(upsert_attempt.min(6) - 1)))
                                    .min(MAX_RETRY_DELAY_MS as u64),
                            );
                            tracing::warn!(
                                "[incremental_sync] Table '{}' upsert failed with network error (attempt {}/{}): {} — retrying in {}ms",
                                table_config.source_table,
                                upsert_attempt,
                                MAX_NETWORK_RETRIES,
                                err_str,
                                delay.as_millis()
                            );
                            if let Some(ref sender) = event_sender {
                                let _ = sender.send(SyncEvent::RowError {
                                    table: table_config.source_table.clone(),
                                    row_key: None,
                                    error: format!(
                                        "Intermitencia de red durante guardado (intento {}/{}). Reintentando en {}s...",
                                        upsert_attempt,
                                        MAX_NETWORK_RETRIES,
                                        delay.as_secs().max(1)
                                    ),
                                });
                            }
                            let sleep_end = Instant::now() + delay;
                            while Instant::now() < sleep_end {
                                if controller.get(&pipeline_id).await
                                    == Some(SyncControl::Cancelled)
                                {
                                    break;
                                }
                                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                            }
                            continue;
                        }

                        tracing::error!(
                            "[incremental_sync] Table '{}' batch {} upsert failed: {} — skipping batch, continuing",
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
                        break crate::db::UpsertResult::default();
                    }
                }
            };

            processed_rows += upsert_result.affected;
            let batch_errors = (batch_size as u64)
                .saturating_sub(upsert_result.affected)
                .saturating_sub(upsert_result.skipped);
            error_count += batch_errors;
            let duration = batch_start.elapsed().as_millis() as u64;

            let batch_fully_failed = upsert_result.affected == 0
                && upsert_result.skipped == 0
                && batch_errors == batch_size as u64;

            if batch_errors == 0 {
                if duration < SCALE_UP_AGGRESSIVE_MS && current_batch_size < adaptive_max {
                    consecutive_fast_batches += 1;
                    consecutive_slow_batches = 0;
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
                                "[incremental_sync] Table '{}': batch {} fast ({}ms), scaling batch {} → {}",
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
                                "[incremental_sync] Table '{}': batch {} moderate ({}ms), scaling batch {} → {}",
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
                                "[incremental_sync] Table '{}': batch {} slow ({}ms), reducing batch {} → {}",
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
                } else if batch_fully_failed {
                    "failed".to_string()
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

            if batch_fully_failed {
                tracing::error!(
                    "[incremental_sync] Table '{}' batch {} fully failed (0 rows written) — checkpoint NOT advanced so the batch is retried on the next run",
                    table_config.source_table,
                    batch_number,
                );
                return Err(crate::error::AppError::Internal(format!(
                    "Table '{}' batch {} fully failed: 0 rows written — checkpoint preserved for resume",
                    table_config.source_table, batch_number,
                )));
            }

            if let Some(ref next_key) = output.next_key {
                let checkpoint = SyncCheckpoint {
                    id: format!("{}:{}", pipeline_id, table_config.source_table),
                    pipeline_id: pipeline_id.clone(),
                    run_id: run_id.clone(),
                    table_name: table_config.source_table.clone(),
                    last_processed_key: Some(next_key.to_string()),
                    batch_number,
                };
                if let Err(e) = storage.save_sync_checkpoint(&checkpoint).await {
                    tracing::error!("Failed to persist sync checkpoint: {e}");
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
                let completion_cp = SyncCheckpoint {
                    id: format!("{}:{}", pipeline_id, table_config.source_table),
                    pipeline_id: pipeline_id.clone(),
                    run_id: run_id.clone(),
                    table_name: table_config.source_table.clone(),
                    last_processed_key: Some("__COMPLETED__".to_string()),
                    batch_number,
                };
                let _ = storage.save_sync_checkpoint(&completion_cp).await;
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
