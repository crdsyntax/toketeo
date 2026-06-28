use std::time::Instant;
use crate::error::AppResult;
use crate::db::DataWriter;
use crate::models::sync::{SyncPipeline, SyncTableConfig, SyncRun, PipelineStatus};
use crate::application::sync::extractors::DataExtractor;
use crate::application::sync::strategies::{SyncStrategy, StrategyOutput, SyncEvent};
use crate::application::sync::transformers;
use uuid::Uuid;

/// Estrategia de sincronización completa.
///
/// Extrae todas las filas de la tabla origen y las escribe
/// en la tabla destino, lote por lote.
pub struct FullSync;

#[async_trait::async_trait]
impl SyncStrategy for FullSync {
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

        let columns: Vec<String> = table_config
            .column_mappings
            .iter()
            .map(|m| m.source_column.clone())
            .collect();

        let dest_columns: Vec<String> = table_config
            .column_mappings
            .iter()
            .map(|m| m.destination_column.clone())
            .collect();

        let mut last_key: Option<serde_json::Value> = None;
        let mut batch_number: u64 = 0;
        let mut total_rows: u64 = 0;
        let error_count: u64 = 0;
        let run_id = Uuid::new_v4().to_string();
        let started_at = chrono::Utc::now().to_rfc3339();

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

            let transformed = transformers::transform_rows(
                output.rows,
                &table_config.column_mappings,
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

            total_rows += rows_loaded;
            let duration = batch_start.elapsed().as_millis() as u64;

            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::BatchCompleted {
                    table: table_config.source_table.clone(),
                    batch_number,
                    rows_loaded,
                    duration_ms: duration,
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
                total_rows,
            });
        }

        Ok(StrategyOutput {
            run: SyncRun {
                id: run_id,
                pipeline_id: pipeline.id.clone().unwrap_or_default(),
                status: PipelineStatus::Completed,
                started_at: Some(started_at),
                completed_at: Some(chrono::Utc::now().to_rfc3339()),
                total_rows,
                processed_rows: total_rows,
                error_count,
                batch_count: batch_number,
            },
            total_rows,
            batch_count: batch_number,
            error_count,
        })
    }
}
