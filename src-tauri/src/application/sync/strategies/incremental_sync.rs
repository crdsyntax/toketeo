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

/// Configuración de batch adaptivo (mismos valores que full_sync).
const ADAPTIVE_BATCH_INITIAL: usize = 1_000;
const ADAPTIVE_BATCH_MEDIUM: usize = 5_000;
const ADAPTIVE_BATCH_MAX: usize = 50_000;

const SCALE_UP_THRESHOLD_MS: u64 = 1_000;
const SCALE_UP_AGGRESSIVE_MS: u64 = 500;
const SCALE_DOWN_THRESHOLD_MS: u64 = 5_000;

/// MySQL prepared statement placeholder limit (65,535).
const MYSQL_PLACEHOLDER_LIMIT: usize = 65_535;

/// Estrategia de sincronización incremental.
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

        // Adaptive batch sizing
        let mut current_batch_size = pipeline.batch_size;
        let mut consecutive_fast_batches: u32 = 0;
        let mut consecutive_slow_batches: u32 = 0;

        // Calculate max safe batch size based on column count
        // Use 50% of MySQL placeholder limit to avoid connection drops from large packets
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
            .get_latest_checkpoint(&pipeline_id)
            .await
            .ok()
            .flatten()
            .filter(|c| c.table_name == table_config.source_table);

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
            let transformed = transformers::transform_rows(output.rows, &mappings)?;

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
                    crate::db::UpsertResult::default()
                }
            };

            processed_rows += upsert_result.affected;
            let batch_errors = batch_size as u64 - upsert_result.affected - upsert_result.skipped;
            error_count += batch_errors;
            let duration = batch_start.elapsed().as_millis() as u64;

            // Adaptive batch sizing logic
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

            if let Some(ref next_key) = output.next_key {
                let checkpoint = SyncCheckpoint {
                    id: Uuid::new_v4().to_string(),
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
