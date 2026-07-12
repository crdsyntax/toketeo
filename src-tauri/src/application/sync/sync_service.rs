use crate::error::AppResult;
use crate::models::sync::{SyncPipeline, SyncMode, ValidationReport};
use crate::application::sync::extractors::{DataExtractor, SqlExtractor, MongoExtractor};
use crate::application::sync::strategies::{SyncStrategy, SyncEvent, FullSync, IncrementalSync};
use crate::application::sync::validators::PipelineValidator;
use crate::db::{DataReader, DataWriter, DbDriver, DbType};
use crate::state::SyncController;
use crate::storage::Storage;
use std::sync::Arc;

const DEFAULT_BATCH_SIZE: usize = 1000;

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

        for (idx, table_config) in pipeline_clone.tables.iter().enumerate() {
            // Check for cancellation before starting a new table
            if controller.get(&pipeline_id).await == Some(crate::state::SyncControl::Cancelled) {
                tracing::info!("Sync cancelled before table {}", table_config.source_table);
                break;
            }

            if let Some(ref sender) = event_sender {
                let _ = sender.send(SyncEvent::TableStarted {
                    table: table_config.source_table.clone(),
                    table_index: idx as u32 + 1,
                    total_tables,
                });
            }

            let output = strategy
                .execute(
                    &pipeline_clone,
                    table_config,
                    extractor.as_ref(),
                    target,
                    storage.clone(),
                    event_sender.clone(),
                    controller,
                )
                .await?;

            if let Err(e) = storage.save_sync_run(&output.run).await {
                tracing::error!("Failed to persist sync run: {e}");
            }

            tracing::info!(
                "Sync completed for table {}: {} rows in {} batches, {} errors",
                table_config.source_table,
                output.total_rows,
                output.batch_count,
                output.error_count,
            );
        }

        // Clean up sync control
        controller.remove(&pipeline_id).await;

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
