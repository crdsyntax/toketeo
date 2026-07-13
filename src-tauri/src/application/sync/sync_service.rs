use crate::error::AppResult;
use crate::models::sync::{SyncPipeline, SyncMode, ValidationReport};
use crate::application::sync::extractors::{DataExtractor, SqlExtractor, MongoExtractor};
use crate::application::sync::strategies::{SyncStrategy, SyncEvent, FullSync, IncrementalSync};
use crate::application::sync::validators::PipelineValidator;
use crate::db::{DataReader, DataWriter, DbDriver, DbType};
use crate::state::SyncController;
use crate::storage::Storage;
use std::sync::Arc;

const DEFAULT_BATCH_SIZE: usize = 200;

/// Servicio principal de sincronización.
pub struct SyncService;

impl SyncService {
    /// Executes a sync pipeline.
    pub async fn execute_pipeline(
        pipeline: &SyncPipeline,
        source: &dyn DataReader,
        target: &dyn DataWriter,
        source_db_type: DbType,
        storage: Arc<Storage>,
        event_sender: Option<tokio::sync::mpsc::UnboundedSender<SyncEvent>>,
        controller: &SyncController,
    ) -> AppResult<()> {
        let extractor: Box<dyn DataExtractor + '_> = match source_db_type {
            DbType::Mongodb => Box::new(MongoExtractor::new(source)),
            _ => Box::new(SqlExtractor::new(source)),
        };

        let strategy: Box<dyn SyncStrategy> = match pipeline.mode {
            SyncMode::Incremental => Box::new(IncrementalSync),
            SyncMode::Full => Box::new(FullSync),
        };

        let effective_batch_size = if pipeline.batch_size == 0 {
            DEFAULT_BATCH_SIZE
        } else {
            pipeline.batch_size
        };

        let mut pipeline_clone = pipeline.clone();
        pipeline_clone.batch_size = effective_batch_size;

        let pipeline_id = pipeline_clone.id.clone().unwrap_or_default();

        let total_tables = pipeline_clone.tables.len() as u32;
        let mut pipeline_errors: u32 = 0;

        tracing::info!(
            "[sync] Starting pipeline '{}' with {} tables, mode={:?}, batch_size={}",
            pipeline_clone.name,
            total_tables,
            pipeline_clone.mode,
            effective_batch_size,
        );

        for (idx, table_config) in pipeline_clone.tables.iter().enumerate() {
            if controller.get(&pipeline_id).await == Some(crate::state::SyncControl::Cancelled) {
                tracing::info!("[sync] Pipeline cancelled before table {}", table_config.source_table);
                break;
            }

            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::TableStarted {
                    table: table_config.source_table.clone(),
                    table_index: idx as u32 + 1,
                    total_tables,
                });
            }

            tracing::info!(
                "[sync] Processing table {}/{}: {} -> {}",
                idx + 1,
                total_tables,
                table_config.source_table,
                table_config.target_table,
            );

            match strategy
                .execute(
                    &pipeline_clone,
                    table_config,
                    extractor.as_ref(),
                    target,
                    storage.clone(),
                    event_sender.clone(),
                    controller,
                )
                .await
            {
                Ok(output) => {
                    if let Err(e) = storage.save_sync_run(&output.run).await {
                        tracing::error!("[sync] Failed to persist sync run: {e}");
                    }

                    tracing::info!(
                        "[sync] Table {} completed: {} rows in {} batches, {} errors",
                        table_config.source_table,
                        output.total_rows,
                        output.batch_count,
                        output.error_count,
                    );
                }
                Err(e) => {
                    pipeline_errors += 1;
                    tracing::error!(
                        "[sync] Table {} failed: {} — skipping and continuing with next table",
                        table_config.source_table,
                        e,
                    );
                    if let Some(ref sender) = event_sender {
                        let _ = sender.send(SyncEvent::RowError {
                            table: table_config.source_table.clone(),
                            row_key: None,
                            error: format!("Table sync failed: {}", e),
                        });
                    }
                }
            }
        }

        controller.remove(&pipeline_id).await;

        tracing::info!(
            "[sync] Pipeline '{}' finished: {}/{} tables completed, {} table errors",
            pipeline_clone.name,
            total_tables.saturating_sub(pipeline_errors as u32),
            total_tables,
            pipeline_errors,
        );

        if let Some(ref sender) = event_sender {
            let _ = sender.send(SyncEvent::Completed);
        }

        Ok(())
    }

    /// Valida un pipeline antes de ejecutarlo.
    pub async fn validate(
        pipeline: &SyncPipeline,
        source: &dyn DbDriver,
        target: &dyn DbDriver,
    ) -> AppResult<ValidationReport> {
        PipelineValidator::validate(pipeline, source, target).await
    }
}
