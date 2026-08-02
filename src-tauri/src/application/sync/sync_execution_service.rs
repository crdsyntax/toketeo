use tauri::{AppHandle, Emitter, Manager};

use crate::application::sync::strategies::SyncEvent;
use crate::application::sync::sync_service::SyncService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::sync::{PipelineStatus, SyncPipeline};
use crate::state::{AppState, SyncControl};

/// Orchestrates async sync pipeline execution: schema filling, connection
/// acquisition, keepalive, event streaming, primary-key auto-detection and
/// background execution. Shared by the Tauri `start_sync` command and, for
/// blocking runs, the assistant `sync` tool.
pub struct SyncExecutionService;

impl SyncExecutionService {
    /// Load a pipeline by id and start it in the background.
    pub async fn start(state: &AppState, app_handle: AppHandle, id: &str) -> AppResult<()> {
        let pipeline = state.storage.get_sync_pipeline(id).await?;
        Self::start_pipeline(state, app_handle, pipeline).await
    }

    /// Start an already-loaded pipeline in the background, emitting
    /// `sync:event` progress events via the app handle.
    pub async fn start_pipeline(
        state: &AppState,
        app_handle: AppHandle,
        mut pipeline: SyncPipeline,
    ) -> AppResult<()> {
        // Fill schemas from connection configs if pipeline doesn't have them.
        Self::fill_schemas(state, &mut pipeline).await;

        tracing::info!(
            "[sync] Starting pipeline '{}': source_schema={:?}, target_schema={:?}",
            pipeline.name,
            pipeline.source_schema,
            pipeline.target_schema,
        );

        let source_driver = state
            .get_or_connect_driver(&pipeline.source_connection_id)
            .await?;
        let target_driver = state
            .get_or_connect_driver(&pipeline.target_connection_id)
            .await?;

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SyncEvent>();
        let emit_handle = app_handle.clone();

        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                let payload = serde_json::to_value(&event).unwrap_or_default();
                let _ = emit_handle.emit("sync:event", &payload);
            }
        });

        let storage = state.storage.clone();

        let pipeline_id = pipeline.id.clone().unwrap_or_default();
        state
            .set_sync_control(&pipeline_id, SyncControl::Running)
            .await;
        if let Err(e) = storage
            .update_sync_pipeline_status(&pipeline_id, PipelineStatus::Running)
            .await
        {
            tracing::error!("[sync] Failed to update pipeline status to Running: {e}");
        }

        let controller = state.sync_controller.clone();

        // Prevent session cleanup from closing pools while sync is running.
        let source_conn_id = pipeline.source_connection_id.clone();
        let target_conn_id = pipeline.target_connection_id.clone();
        state.mark_session_in_use(&source_conn_id, true).await;
        state.mark_session_in_use(&target_conn_id, true).await;

        // Keepalive: periodically touch source & target sessions so the cleanup
        // task does not close their pools while the sync is running.
        let keepalive_source = source_conn_id.clone();
        let keepalive_target = target_conn_id.clone();
        let keepalive_handle = app_handle.clone();
        let (keepalive_tx, mut keepalive_rx) = tokio::sync::oneshot::channel::<()>();
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
            // skip the first immediate tick
            interval.tick().await;
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let st = keepalive_handle.state::<AppState>();
                        let _ = st.get_connection(&keepalive_source).await;
                        let _ = st.get_connection(&keepalive_target).await;
                    }
                    _ = &mut keepalive_rx => break,
                }
            }
        });

        let unmark_source = source_conn_id.clone();
        let unmark_target = target_conn_id.clone();
        let unmark_handle = app_handle.clone();

        tokio::spawn(async move {
            let mut pipeline = pipeline;

            tracing::info!(
                "[sync] Starting pipeline: source_schema={:?}, target_schema={:?}, tables={}",
                pipeline.source_schema,
                pipeline.target_schema,
                pipeline.tables.len(),
            );

            // Auto-detect primary keys for tables that don't have them.
            Self::auto_detect_primary_keys(&mut pipeline, source_driver.as_ref()).await;

            let pipeline_result = SyncService::execute_pipeline(
                &pipeline,
                &*source_driver,
                &*target_driver,
                storage.clone(),
                Some(tx),
                &controller,
            )
            .await;

            let final_status = match &pipeline_result {
                Ok(_) => PipelineStatus::Completed,
                Err(_) => PipelineStatus::Failed,
            };
            if let Err(e) = storage
                .update_sync_pipeline_status(&pipeline_id, final_status)
                .await
            {
                tracing::error!("[sync] Failed to update pipeline status: {e}");
            }

            if let Err(e) = pipeline_result {
                let _ = app_handle.emit("sync:error", &e.to_string());
            }

            // Stop the keepalive task — sessions can now idle normally.
            let _ = keepalive_tx.send(());

            // Release in_use flags so cleanup can expire idle sessions again.
            let st = unmark_handle.state::<AppState>();
            st.mark_session_in_use(&unmark_source, false).await;
            st.mark_session_in_use(&unmark_target, false).await;

            controller.remove(&pipeline_id).await;
        });

        Ok(())
    }

    /// Fill missing source/target schemas from the connection configs.
    pub async fn fill_schemas(state: &AppState, pipeline: &mut SyncPipeline) {
        if pipeline.source_schema.is_none() {
            if let Ok(cfg) = state
                .storage
                .get_connection(&pipeline.source_connection_id)
                .await
            {
                pipeline.source_schema = cfg.database.clone();
            }
        }
        if pipeline.target_schema.is_none() {
            if let Ok(cfg) = state
                .storage
                .get_connection(&pipeline.target_connection_id)
                .await
            {
                pipeline.target_schema = cfg.database.clone();
            }
        }
    }

    /// Auto-detect primary keys for tables that don't have them, in chunks of 5.
    /// Shared by the async runner and the assistant's blocking `sync` tool.
    pub async fn auto_detect_primary_keys(pipeline: &mut SyncPipeline, source: &dyn DbDriver) {
        let tables_needing_pk: Vec<usize> = pipeline
            .tables
            .iter()
            .enumerate()
            .filter(|(_, t)| {
                t.primary_key.is_none()
                    || t.primary_key.as_ref().is_some_and(|v| v.is_empty())
            })
            .map(|(i, _)| i)
            .collect();

        if tables_needing_pk.is_empty() {
            return;
        }

        tracing::info!(
            "[sync] Auto-detecting PKs for {} tables",
            tables_needing_pk.len()
        );
        const PK_CHUNK_SIZE: usize = 5;
        for chunk in tables_needing_pk.chunks(PK_CHUNK_SIZE) {
            let futures: Vec<_> = chunk
                .iter()
                .map(|&idx| {
                    let table = pipeline.tables[idx].source_table.clone();
                    let schema = pipeline.source_schema.clone();
                    async move {
                        let cols = source.fetch_columns(&table, schema).await;
                        (idx, table, cols)
                    }
                })
                .collect();

            let results = futures::future::join_all(futures).await;
            for (idx, table_name, cols_result) in results {
                match cols_result {
                    Ok(cols) => {
                        let pks: Vec<String> = cols
                            .iter()
                            .filter(|c| {
                                c.get("isPrimaryKey")
                                    .or_else(|| c.get("isPrimary"))
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false)
                            })
                            .filter_map(|c| {
                                c.get("name")
                                    .and_then(|v| v.as_str())
                                    .map(String::from)
                            })
                            .collect();
                        if !pks.is_empty() {
                            tracing::info!("[sync] PK detected for {}: {:?}", table_name, pks);
                            pipeline.tables[idx].primary_key = Some(pks);
                        } else {
                            tracing::warn!(
                                "[sync] No PK found for table {}, falling back to 'id'",
                                table_name
                            );
                        }
                    }
                    Err(e) => {
                        tracing::error!(
                            "[sync] Failed to fetch columns for {}: {}",
                            table_name,
                            e
                        );
                    }
                }
            }
        }
    }
}
