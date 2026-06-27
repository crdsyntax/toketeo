use crate::error::AppResult;
use crate::models::sync::{SyncPipeline, SyncMode, ValidationReport};
use crate::application::sync::extractors::{DataExtractor, SqlExtractor, MongoExtractor};
use crate::application::sync::strategies::{SyncStrategy, SyncEvent, FullSync, IncrementalSync};
use crate::db::{DataReader, DataWriter, DbType, CapabilityProvider};

/// Servicio principal de sincronización.
///
/// Orquesta la validación, selección de estrategia, extracción
/// y carga para un pipeline completo.
pub struct SyncService;

impl SyncService {
    /// Ejecuta un pipeline de sincronización.
    pub async fn execute_pipeline(
        pipeline: &SyncPipeline,
        source_reader: Box<dyn DataReader>,
        target_writer: Box<dyn DataWriter>,
        source_db_type: DbType,
        event_sender: Option<tokio::sync::mpsc::UnboundedSender<SyncEvent>>,
    ) -> AppResult<()> {
        let extractor: Box<dyn DataExtractor> = match source_db_type {
            DbType::Mongodb => Box::new(MongoExtractor::new(source_reader)),
            _ => Box::new(SqlExtractor::new(source_reader)),
        };

        let strategy: Box<dyn SyncStrategy> = match pipeline.mode {
            SyncMode::Incremental => Box::new(IncrementalSync),
            SyncMode::Full => Box::new(FullSync),
        };

        for table_config in &pipeline.tables {
            let output = strategy
                .execute(pipeline, table_config, extractor.as_ref(), target_writer.as_ref(), event_sender.clone())
                .await?;

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
        _pipeline: &SyncPipeline,
        _source_caps: &dyn CapabilityProvider,
        _target_caps: &dyn CapabilityProvider,
    ) -> ValidationReport {
        // Placeholder — implementación completa en Fase 5
        ValidationReport {
            is_valid: true,
            source_connection_ok: true,
            target_connection_ok: true,
            table_checks: vec![],
            warnings: vec![],
            errors: vec![],
        }
    }
}
