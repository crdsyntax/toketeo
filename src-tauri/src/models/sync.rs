use serde::{Deserialize, Serialize};

/// Modo de sincronización.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncMode {
    Full,
    Incremental,
}

/// Estado del pipeline.
#[derive(Debug, Default, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PipelineStatus {
    #[default]
    Draft,
    Ready,
    Running,
    Paused,
    Retrying,
    Completed,
    Cancelled,
    Failed,
}

/// Estrategia de upsert por engine.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpsertStrategy {
    OnConflict,      // PostgreSQL
    OnDuplicateKey,  // MySQL / MariaDB
    Merge,           // SQL Server
    UpsertDoc,       // MongoDB
}

/// Capacidades expuestas por cada driver.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DriverCapabilities {
    pub supports_transactions: bool,
    pub supports_savepoints: bool,
    pub supports_upsert: bool,
    pub upsert_strategy: Option<UpsertStrategy>,
    pub supports_keyset_pagination: bool,
    pub supports_streaming: bool,
    pub supports_json: bool,
    pub supports_arrays: bool,
    pub supports_returning: bool,
    pub max_batch_size: usize,
}

/// Pipeline de sincronización.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncPipeline {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub source_connection_id: String,
    pub target_connection_id: String,
    pub mode: SyncMode,
    #[serde(default)]
    pub status: PipelineStatus,
    pub tables: Vec<SyncTableConfig>,
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

fn default_batch_size() -> usize {
    1000
}

/// Configuración de una tabla dentro del pipeline.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncTableConfig {
    pub source_table: String,
    pub target_table: String,
    pub column_mappings: Vec<ColumnMapping>,
    pub filters: Option<String>,
    pub primary_key: Option<Vec<String>>,
}

/// Mapeo columna-a-columna.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnMapping {
    pub source_column: String,
    pub destination_column: String,
    pub transform: Option<ColumnTransform>,
}

/// Transformación configurable por columna.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum ColumnTransform {
    Trim,
    Uppercase,
    Lowercase,
    DefaultValue { value: String },
    Regex { pattern: String, replacement: String },
    Concat { parts: Vec<String> },
    Cast { target_type: String },
    DateFormat { format: String },
}

/// Ejecución de un pipeline.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncRun {
    pub id: String,
    pub pipeline_id: String,
    pub status: PipelineStatus,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub total_rows: u64,
    pub processed_rows: u64,
    pub error_count: u64,
    pub batch_count: u64,
}

/// Checkpoint para reanudación.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncCheckpoint {
    pub id: String,
    pub pipeline_id: String,
    pub run_id: String,
    pub table_name: String,
    pub last_processed_key: Option<String>,
    pub batch_number: u64,
}

/// Batch individual.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncBatch {
    pub id: String,
    pub run_id: String,
    pub batch_number: u64,
    pub table_name: String,
    pub rows_extracted: u64,
    pub rows_loaded: u64,
    pub duration_ms: u64,
    pub status: String,
    pub error_message: Option<String>,
}

/// Error por fila.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncRowError {
    pub id: String,
    pub batch_id: String,
    pub row_key: Option<String>,
    pub column_name: Option<String>,
    pub error_message: String,
    pub raw_value: Option<String>,
}

/// Reporte de validación.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ValidationReport {
    pub is_valid: bool,
    pub source_connection_ok: bool,
    pub target_connection_ok: bool,
    pub table_checks: Vec<TableValidation>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableValidation {
    pub table_name: String,
    pub exists_on_source: bool,
    pub exists_on_target: bool,
    pub columns_match: bool,
    pub column_diffs: Vec<ColumnDiff>,
    pub primary_key_match: bool,
    pub issues: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDiff {
    pub column_name: String,
    pub source_type: Option<String>,
    pub target_type: Option<String>,
    pub source_nullable: Option<bool>,
    pub target_nullable: Option<bool>,
    pub diff_type: DiffType,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffType {
    MissingInSource,
    MissingInTarget,
    TypeMismatch,
    NullableMismatch,
}
