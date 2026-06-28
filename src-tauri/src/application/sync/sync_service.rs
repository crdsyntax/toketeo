use crate::error::AppResult;
use crate::models::sync::{SyncPipeline, SyncMode, ValidationReport};
use crate::application::sync::extractors::{DataExtractor, SqlExtractor, MongoExtractor};
use crate::application::sync::strategies::{SyncStrategy, SyncEvent, FullSync, IncrementalSync};
use crate::application::sync::validators::PipelineValidator;
use crate::db::{DataReader, DataWriter, DbDriver, DbType};
use crate::storage::Storage;
use std::sync::Arc;

/// Servicio principal de sincronización.
///
/// Orquesta la validación, selección de estrategia, extracción
/// y carga para un pipeline completo.
pub struct SyncService;

impl SyncService {
    /// Ejecuta un pipeline de sincronización.
    pub async fn execute_pipeline(
        pipeline: &SyncPipeline,
        source: &dyn DataReader,
        target: &dyn DataWriter,
        source_db_type: DbType,
        storage: Arc<Storage>,
        event_sender: Option<tokio::sync::mpsc::UnboundedSender<SyncEvent>>,
    ) -> AppResult<()> {
        let extractor: Box<dyn DataExtractor + '_> = match source_db_type {
            DbType::Mongodb => Box::new(MongoExtractor::new(source)),
            _ => Box::new(SqlExtractor::new(source)),
        };

        let strategy: Box<dyn SyncStrategy> = match pipeline.mode {
            SyncMode::Incremental => Box::new(IncrementalSync),
            SyncMode::Full => Box::new(FullSync),
        };

        for table_config in &pipeline.tables {
            let output = strategy
                .execute(pipeline, table_config, extractor.as_ref(), target, event_sender.clone())
                .await?;

            // Persist the run so the frontend can fetch it
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
