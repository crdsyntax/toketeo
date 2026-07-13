use crate::error::AppResult;
use crate::models::sync::{SyncPipeline, SyncRun};
use crate::application::sync::extractors::DataExtractor;
use crate::state::SyncController;
use crate::storage::Storage;
use async_trait::async_trait;
use serde::Serialize;
use std::sync::Arc;

/// Resultado de ejecución de una estrategia.
pub struct StrategyOutput {
    pub run: SyncRun,
    pub total_rows: u64,
    pub batch_count: u64,
    pub error_count: u64,
}

/// Estrategia de sincronización.
#[async_trait]
pub trait SyncStrategy: Send + Sync {
    async fn execute(
        &self,
        pipeline: &SyncPipeline,
        table_config: &crate::models::sync::SyncTableConfig,
        extractor: &dyn DataExtractor,
        writer: &dyn crate::db::DataWriter,
        storage: Arc<Storage>,
        event_sender: Option<tokio::sync::mpsc::UnboundedSender<SyncEvent>>,
        controller: &SyncController,
    ) -> AppResult<StrategyOutput>;
}

/// Eventos emitidos durante la sincronización.
#[derive(Debug, Clone, Serialize)]
pub enum SyncEvent {
    TableStarted {
        table: String,
        table_index: u32,
        total_tables: u32,
    },
    BatchCompleted {
        table: String,
        batch_number: u64,
        rows_loaded: u64,
        skipped: u64,
        duration_ms: u64,
    },
    RowError {
        table: String,
        row_key: Option<String>,
        error: String,
    },
    PhaseCompleted {
        table: String,
        total_rows: u64,
    },
    Progress {
        table: String,
        processed_rows: u64,
        total_rows: u64,
        error_count: u64,
    },
    Error {
        message: String,
    },
    Completed,
}

pub use full_sync::FullSync;
pub use incremental_sync::IncrementalSync;

pub mod full_sync;
pub mod incremental_sync;
