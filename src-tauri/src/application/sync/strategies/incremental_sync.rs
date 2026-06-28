use std::time::Instant;
use crate::error::AppResult;
use crate::db::DataWriter;
use crate::models::sync::{SyncPipeline, SyncTableConfig, SyncRun, PipelineStatus, ColumnMapping};
use crate::application::sync::extractors::DataExtractor;
use crate::application::sync::strategies::{SyncStrategy, StrategyOutput, SyncEvent};
use crate::application::sync::transformers;
use uuid::Uuid;

/// Estrategia de sincronización incremental.
///
/// Solo extrae filas nuevas o modificadas desde el último
/// checkpoint, usando paginación por keyset.
pub struct IncrementalSync;

#[async_trait::async_trait]
impl SyncStrategy for IncrementalSync {
    async fn execute(
        &self,
        pipeline: &SyncPipeline,
        table_config: &SyncTableConfig,
        extractor: &dyn DataExtractor,
        writer: &dyn DataWriter,
        event_sender: Option<tokio::sync::mpsc::UnboundedSender<SyncEvent>>,
    ) -> AppResult<StrategyOutput> {
        let pk = table_config
            .primary_key
            .as_ref()
            .and_then(|p| p.first())
            .cloned()
            .unwrap_or_else(|| "_id".to_string());

        let mut mappings = table_config.column_mappings.clone();
        let mut columns: Vec<String> = mappings
            .iter()
            .map(|m| m.source_column.clone())
            .collect();

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

        // Get total expected count for progress display
        let total_expected = extractor.count(&table_config.source_table, None).await.unwrap_or(0);

        if let Some(ref sender) = event_sender {
            let _ = sender.send(SyncEvent::Progress {
                table: table_config.source_table.clone(),
                processed_rows: 0,
                total_rows: total_expected,
                error_count: 0,
            });
        }

        loop {
            let batch_start = Instant::now();
            batch_number += 1;

            let output = extractor
                .extract(
                    &table_config.source_table,
                    None,
                    &columns,
                    &pk,
                    last_key,
                    pipeline.batch_size,
                    batch_number,
                )
                .await?;

            if output.rows.is_empty() {
                break;
            }

            // Auto-detect columns when no mappings are configured
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
                        dest_columns = mappings.iter().map(|m| m.destination_column.clone()).collect();
                    }
                }
            }

            let batch_size = output.rows.len();
            let transformed = transformers::transform_rows(
                output.rows,
                &mappings,
            )?;

            let rows_loaded = writer
                .upsert_rows(
                    &table_config.target_table,
                    None,
                    &dest_columns,
                    table_config.primary_key.as_deref().unwrap_or(&[]),
                    &transformed,
                )
                .await?;

            processed_rows += rows_loaded;
            let batch_errors = batch_size as u64 - rows_loaded;
            error_count += batch_errors;
            let duration = batch_start.elapsed().as_millis() as u64;

            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::BatchCompleted {
                    table: table_config.source_table.clone(),
                    batch_number,
                    rows_loaded,
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
                pipeline_id: pipeline.id.clone().unwrap_or_default(),
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
