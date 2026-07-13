use std::time::Instant;
use std::sync::Arc;
use crate::error::AppResult;
use crate::db::DataWriter;
use crate::models::sync::{SyncPipeline, SyncTableConfig, SyncRun, SyncBatch, SyncRowError, PipelineStatus, ColumnMapping};
use crate::application::sync::extractors::DataExtractor;
use crate::application::sync::strategies::{SyncStrategy, StrategyOutput, SyncEvent};
use crate::application::sync::transformers;
use crate::state::{SyncController, SyncControl};
use crate::storage::Storage;
use uuid::Uuid;

/// Estrategia de sincronización completa.
pub struct FullSync;

#[async_trait::async_trait]
impl SyncStrategy for FullSync {
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
            "[full_sync] Table '{}': pk={}, columns={}, batch_size={}",
            table_config.source_table,
            pk,
            table_config.column_mappings.len(),
            pipeline.batch_size,
        );

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

        let source_schema = pipeline.source_schema.as_deref();
        let target_schema = pipeline.target_schema.as_deref();

        let total_expected = extractor.count(&table_config.source_table, source_schema).await.unwrap_or(0);

        if let Some(ref sender) = event_sender {
            let _ = sender.send(SyncEvent::Progress {
                table: table_config.source_table.clone(),
                processed_rows: 0,
                total_rows: total_expected,
                error_count: 0,
            });
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
                    pipeline.batch_size,
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
                        dest_columns = mappings.iter().map(|m| m.destination_column.clone()).collect();
                    }
                }
            }

            let batch_size = output.rows.len();
            let transformed = transformers::transform_rows(
                output.rows,
                &mappings,
            )?;

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
                        "[full_sync] Table '{}' batch {} upsert failed: {} — skipping batch, continuing",
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

            tracing::debug!(
                "[full_sync] Table '{}' batch {}: extracted={}, loaded={}, skipped={}, errors={}, duration={}ms",
                table_config.source_table,
                batch_number,
                batch_size,
                upsert_result.affected,
                upsert_result.skipped,
                batch_errors,
                duration,
            );

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
                status: if batch_errors == 0 { "completed".to_string() } else { "completed_with_errors".to_string() },
                error_message: if batch_errors > 0 { Some(format!("{batch_errors} rows failed")) } else { None },
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{DataReader, DataWriter};
    use crate::models::sync::{SyncPipeline, SyncTableConfig, SyncMode, PipelineStatus, ColumnMapping};
    use crate::application::sync::extractors::sql_extractor::SqlExtractor;
    use crate::state::SyncController;
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::Mutex;

    const NUM_TABLES: usize = 70;
    const ROWS_PER_TABLE: usize = 200;
    const BATCH_SIZE: usize = 50;

    /// Generates table names: table_00 .. table_69
    fn table_name(idx: usize) -> String {
        format!("table_{:02}", idx)
    }

    /// Generates a row for a given table and row index.
    fn make_row(table_idx: usize, row_idx: usize) -> serde_json::Value {
        serde_json::json!({
            "id": (table_idx * ROWS_PER_TABLE + row_idx) as i64,
            "name": format!("item_{}_{}", table_idx, row_idx),
            "value": (row_idx as f64) * 1.5,
            "created_at": format!("2024-01-01T00:{:02}:00Z", row_idx % 60),
        })
    }

    // ── Mock Source Reader ──

    struct MockSourceReader {
        data: HashMap<String, Vec<serde_json::Value>>,
    }

    impl MockSourceReader {
        fn new() -> Self {
            let mut data = HashMap::new();
            for t in 0..NUM_TABLES {
                let name = table_name(t);
                let rows: Vec<serde_json::Value> = (0..ROWS_PER_TABLE)
                    .map(|r| make_row(t, r))
                    .collect();
                data.insert(name, rows);
            }
            Self { data }
        }
    }

    #[async_trait]
    impl DataReader for MockSourceReader {
        async fn fetch_rows(
            &self,
            table: &str,
            _schema: Option<&str>,
            _columns: &[String],
            pk_column: &str,
            last_key: Option<serde_json::Value>,
            batch_size: usize,
        ) -> crate::error::AppResult<Vec<serde_json::Value>> {
            let all_rows = self.data.get(table).cloned().unwrap_or_default();

            let start_idx = match last_key {
                Some(key) => {
                    let last_pk = key.as_i64().unwrap_or(-1);
                    all_rows
                        .iter()
                        .position(|r| {
                            r.get(pk_column)
                                .and_then(|v| v.as_i64())
                                .map(|id| id > last_pk)
                                .unwrap_or(false)
                        })
                        .unwrap_or(all_rows.len())
                }
                None => 0,
            };

            let end = (start_idx + batch_size).min(all_rows.len());
            Ok(all_rows[start_idx..end].to_vec())
        }

        async fn count_rows(&self, table: &str, _schema: Option<&str>) -> crate::error::AppResult<u64> {
            Ok(self.data.get(table).map(|r| r.len() as u64).unwrap_or(0))
        }
    }

    // ── Mock Target Writer ──

    struct MockTargetWriter {
        written: Arc<Mutex<HashMap<String, Vec<serde_json::Value>>>>,
    }

    impl MockTargetWriter {
        fn new() -> Self {
            Self {
                written: Arc::new(Mutex::new(HashMap::new())),
            }
        }

        async fn total_rows_written(&self) -> u64 {
            let guard = self.written.lock().await;
            guard.values().map(|v| v.len() as u64).sum()
        }

        async fn rows_for_table(&self, table: &str) -> usize {
            let guard = self.written.lock().await;
            guard.get(table).map(|v| v.len()).unwrap_or(0)
        }
    }

    #[async_trait]
    impl DataWriter for MockTargetWriter {
        async fn upsert_rows(
            &self,
            table: &str,
            _schema: Option<&str>,
            _columns: &[String],
            _primary_keys: &[String],
            rows: &[serde_json::Value],
        ) -> crate::error::AppResult<crate::db::UpsertResult> {
            let mut guard = self.written.lock().await;
            let entry = guard.entry(table.to_string()).or_insert_with(Vec::new);
            entry.extend(rows.iter().cloned());
            Ok(crate::db::UpsertResult { affected: rows.len() as u64, skipped: 0 })
        }
    }

    // ── Helpers ──

    fn make_pipeline(tables: Vec<SyncTableConfig>, batch_size: usize) -> SyncPipeline {
        SyncPipeline {
            id: Some("test-pipeline-001".into()),
            name: "Cross DB Sync Test".into(),
            source_connection_id: "source-pg".into(),
            target_connection_id: "target-mysql".into(),
            source_schema: None,
            target_schema: None,
            mode: SyncMode::Full,
            status: PipelineStatus::Ready,
            tables,
            batch_size,
            created_at: None,
            updated_at: None,
        }
    }

    fn make_table_config(source: &str, target: &str) -> SyncTableConfig {
        SyncTableConfig {
            source_table: source.into(),
            target_table: target.into(),
            column_mappings: vec![
                ColumnMapping { source_column: "id".into(), destination_column: "id".into(), transform: None },
                ColumnMapping { source_column: "name".into(), destination_column: "name".into(), transform: None },
                ColumnMapping { source_column: "value".into(), destination_column: "value".into(), transform: None },
                ColumnMapping { source_column: "created_at".into(), destination_column: "created_at".into(), transform: None },
            ],
            filters: None,
            primary_key: Some(vec!["id".into()]),
        }
    }

    fn make_all_table_configs() -> Vec<SyncTableConfig> {
        (0..NUM_TABLES)
            .map(|i| {
                let name = table_name(i);
                make_table_config(&name, &name)
            })
            .collect()
    }

    async fn create_test_storage() -> Arc<Storage> {
        let dir = std::env::temp_dir().join(format!("toketeo_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        // Create the file explicitly so SQLite can open it
        std::fs::File::create(&db_path).unwrap();
        Arc::new(Storage::new(db_path).await.unwrap())
    }

    // ── Tests ──

    #[tokio::test]
    async fn test_full_sync_70_tables_200_records_each() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller.set("test-pipeline-001", SyncControl::Running).await;

        let pipeline = make_pipeline(make_all_table_configs(), BATCH_SIZE);

        // Execute sync for each table (simulating SyncService loop)
        for table_config in &pipeline.tables {
            let extractor = SqlExtractor::new(&source);
            let output = FullSync
                .execute(
                    &pipeline,
                    table_config,
                    &extractor,
                    &writer,
                    storage.clone(),
                    None,
                    &controller,
                )
                .await
                .unwrap();

            assert_eq!(output.error_count, 0, "Table {} should have 0 errors", table_config.source_table);
            assert_eq!(output.total_rows, ROWS_PER_TABLE as u64, "Table {} should have {} rows", table_config.source_table, ROWS_PER_TABLE);
        }

        // Verify total rows written
        let total = writer.total_rows_written().await;
        assert_eq!(total, (NUM_TABLES * ROWS_PER_TABLE) as u64,
            "Total rows should be {} (70 tables × 200 rows)", NUM_TABLES * ROWS_PER_TABLE);

        // Verify each table has correct row count
        for t in 0..NUM_TABLES {
            let name = table_name(t);
            let count = writer.rows_for_table(&name).await;
            assert_eq!(count, ROWS_PER_TABLE, "Table {} should have {} rows written", name, ROWS_PER_TABLE);
        }
    }

    #[tokio::test]
    async fn test_full_sync_progress_events() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller.set("test-pipeline-001", SyncControl::Running).await;

        let pipeline = make_pipeline(
            vec![make_table_config("table_00", "table_00")],
            BATCH_SIZE,
        );

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();

        // Execute sync for the single table
        let extractor = SqlExtractor::new(&source);
        let output = FullSync
            .execute(
                &pipeline,
                &pipeline.tables[0],
                &extractor,
                &writer,
                storage.clone(),
                Some(tx),
                &controller,
            )
            .await
            .unwrap();

        assert_eq!(output.total_rows, ROWS_PER_TABLE as u64);

        // Collect all events
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }

        // Verify we got initial Progress(0), BatchCompleted events, Progress updates, and PhaseCompleted
        let progress_events: Vec<&SyncEvent> = events.iter()
            .filter(|e| matches!(e, SyncEvent::Progress { .. }))
            .collect();
        let batch_events: Vec<&SyncEvent> = events.iter()
            .filter(|e| matches!(e, SyncEvent::BatchCompleted { .. }))
            .collect();
        let phase_events: Vec<&SyncEvent> = events.iter()
            .filter(|e| matches!(e, SyncEvent::PhaseCompleted { .. }))
            .collect();

        // First progress event should show 0 processed rows
        if let SyncEvent::Progress { processed_rows, total_rows, .. } = progress_events.first().unwrap() {
            assert_eq!(*processed_rows, 0);
            assert_eq!(*total_rows, ROWS_PER_TABLE as u64);
        } else {
            panic!("First event should be Progress with 0 processed rows");
        }

        // Should have batch completed events (200 rows / 50 batch_size = 4 batches)
        assert_eq!(batch_events.len(), 4, "Should have 4 batch completed events");

        // Each batch should report rows_loaded = 50
        for batch_event in &batch_events {
            if let SyncEvent::BatchCompleted { rows_loaded, .. } = batch_event {
                assert_eq!(*rows_loaded, BATCH_SIZE as u64, "Each batch should load {} rows", BATCH_SIZE);
            }
        }

        // Last progress event should show 200 processed rows
        let last_progress = progress_events.last().unwrap();
        if let SyncEvent::Progress { processed_rows, error_count, .. } = last_progress {
            assert_eq!(*processed_rows, ROWS_PER_TABLE as u64);
            assert_eq!(*error_count, 0);
        }

        // Should have exactly 1 PhaseCompleted event
        assert_eq!(phase_events.len(), 1, "Should have 1 PhaseCompleted event");
        if let SyncEvent::PhaseCompleted { total_rows, .. } = phase_events.first().unwrap() {
            assert_eq!(*total_rows, ROWS_PER_TABLE as u64);
        }
    }

    #[tokio::test]
    async fn test_full_sync_cancellation() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        let pipeline_id = "test-pipeline-001";
        controller.set(pipeline_id, SyncControl::Running).await;

        let pipeline = make_pipeline(
            vec![make_table_config("table_00", "table_00")],
            BATCH_SIZE,
        );

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();

        // Cancel before execution starts
        controller.set(pipeline_id, SyncControl::Cancelled).await;

        let extractor = SqlExtractor::new(&source);
        let output = FullSync
            .execute(
                &pipeline,
                &pipeline.tables[0],
                &extractor,
                &writer,
                storage.clone(),
                Some(tx),
                &controller,
            )
            .await
            .unwrap();

        // Should have 0 processed rows since we cancelled immediately
        assert_eq!(output.total_rows, 0, "Cancelled sync should process 0 rows");
        assert_eq!(output.batch_count, 0, "Cancelled sync should have 0 batches");

        // Verify no rows were written
        let total = writer.total_rows_written().await;
        assert_eq!(total, 0, "Cancelled sync should write 0 rows");

        // Verify we got an Error event about cancellation
        let events: Vec<SyncEvent> = {
            let mut v = Vec::new();
            while let Ok(e) = rx.try_recv() { v.push(e); }
            v
        };
        let has_cancel_error = events.iter().any(|e| {
            matches!(e, SyncEvent::Error { message } if message.contains("cancelled"))
        });
        assert!(has_cancel_error, "Should have received a cancellation error event");
    }

    #[tokio::test]
    async fn test_full_sync_batch_persistence() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller.set("test-pipeline-001", SyncControl::Running).await;

        // Use a single table with small batch to ensure multiple batches
        let pipeline = make_pipeline(
            vec![make_table_config("table_00", "table_00")],
            BATCH_SIZE,
        );

        let extractor = SqlExtractor::new(&source);
        let output = FullSync
            .execute(
                &pipeline,
                &pipeline.tables[0],
                &extractor,
                &writer,
                storage.clone(),
                None,
                &controller,
            )
            .await
            .unwrap();

        // Verify batches were persisted
        let batches = storage.list_sync_batches(&output.run.id).await.unwrap();
        assert_eq!(batches.len() as u64, output.batch_count,
            "Number of persisted batches should match batch_count");

        // Verify each batch record has correct metadata
        for batch in &batches {
            assert_eq!(batch.table_name, "table_00");
            assert!(batch.rows_extracted > 0, "Each batch should have extracted rows");
            assert!(batch.rows_loaded > 0, "Each batch should have loaded rows");
            assert_eq!(batch.status, "completed", "Each batch should be completed");
            assert!(batch.duration_ms < 5000, "Batch duration should be reasonable");
        }

        // Verify total rows across all batches
        let total_extracted: u64 = batches.iter().map(|b| b.rows_extracted).sum();
        let total_loaded: u64 = batches.iter().map(|b| b.rows_loaded).sum();
        assert_eq!(total_extracted, ROWS_PER_TABLE as u64);
        assert_eq!(total_loaded, ROWS_PER_TABLE as u64);
    }

    #[tokio::test]
    async fn test_full_sync_all_70_tables_with_progress_tracking() {
        let source = MockSourceReader::new();
        let writer = MockTargetWriter::new();
        let storage = create_test_storage().await;
        let controller = SyncController::new();
        controller.set("test-pipeline-001", SyncControl::Running).await;

        let pipeline = make_pipeline(make_all_table_configs(), BATCH_SIZE);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();

        // Track per-table progress
        let mut table_processed: HashMap<String, u64> = HashMap::new();
        let mut table_totals: HashMap<String, u64> = HashMap::new();
        let mut tables_completed: Vec<String> = Vec::new();

        for table_config in &pipeline.tables {
            let extractor = SqlExtractor::new(&source);
            let table_tx = tx.clone();
            let output = FullSync
                .execute(
                    &pipeline,
                    table_config,
                    &extractor,
                    &writer,
                    storage.clone(),
                    Some(table_tx),
                    &controller,
                )
                .await
                .unwrap();

            assert_eq!(output.error_count, 0, "Table {} should have 0 errors", table_config.source_table);
            assert_eq!(output.total_rows, ROWS_PER_TABLE as u64);

            tables_completed.push(table_config.source_table.clone());
        }

        // Drain remaining events
        while let Ok(event) = rx.try_recv() {
            match event {
                SyncEvent::Progress { table, processed_rows, total_rows, .. } => {
                    table_processed.insert(table.clone(), processed_rows);
                    table_totals.insert(table.clone(), total_rows);
                }
                SyncEvent::PhaseCompleted { table, total_rows } => {
                    table_processed.insert(table.clone(), total_rows);
                }
                _ => {}
            }
        }

        // Verify all 70 tables were synced
        assert_eq!(tables_completed.len(), NUM_TABLES, "All 70 tables should be synced");

        // Verify final progress for each table shows 200 rows
        for t in 0..NUM_TABLES {
            let name = table_name(t);
            let processed = table_processed.get(&name).copied().unwrap_or(0);
            assert_eq!(processed, ROWS_PER_TABLE as u64,
                "Table {} should show {} processed rows", name, ROWS_PER_TABLE);
        }

        // Verify total rows across all tables
        let total = writer.total_rows_written().await;
        assert_eq!(total, (NUM_TABLES * ROWS_PER_TABLE) as u64);
    }
}
