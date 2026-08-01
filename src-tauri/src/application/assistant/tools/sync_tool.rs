use async_trait::async_trait;

use crate::application::sync::sync_service::SyncService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::models::sync::{SyncMode, SyncPipeline, SyncTableConfig, PipelineStatus};
use crate::state::{AppState, SyncControl};

use super::tool_engine::AssistantTool;

pub struct SyncTool;

#[async_trait]
impl AssistantTool for SyncTool {
    fn name(&self) -> &str {
        "sync"
    }

    fn description(&self) -> &str {
        "Create and run sync pipelines between two databases. With action 'create' the pipeline is saved (tables are auto-detected from the source if omitted); with action 'run' the pipeline is executed immediately."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "run"],
                    "description": "create (default): save the pipeline for later. run: execute the pipeline now."
                },
                "pipeline_id": {
                    "type": "string",
                    "description": "ID of an already saved pipeline to run (used with action 'run')"
                },
                "source_connection_id": {
                    "type": "string",
                    "description": "Connection ID of the source database"
                },
                "target_connection_id": {
                    "type": "string",
                    "description": "Connection ID of the target database"
                },
                "tables": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Table names to sync (all source tables if omitted)"
                },
                "mode": {
                    "type": "string",
                    "enum": ["full", "incremental"],
                    "description": "Sync mode: full (replace all) or incremental (new/changed rows)"
                }
            },
            "required": ["source_connection_id", "target_connection_id"]
        })
    }

    fn is_destructive(&self) -> bool {
        true
    }

    async fn execute(
        &self,
        args: serde_json::Value,
        _driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<ToolResult> {
        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("create");
        match action {
            "run" => self.run(args, state).await,
            _ => self.create(args, state).await,
        }
    }
}

impl SyncTool {
    fn connection_id(args: &serde_json::Value, key: &str) -> String {
        args.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    }

    fn build_pipeline(args: &serde_json::Value, source_id: &str, target_id: &str) -> AppResult<SyncPipeline> {
        if source_id.is_empty() || target_id.is_empty() {
            return Err(crate::error::AppError::Validation(
                "Both source_connection_id and target_connection_id are required.".to_string(),
            ));
        }

        let mode = match args.get("mode").and_then(|v| v.as_str()).unwrap_or("full") {
            "incremental" => SyncMode::Incremental,
            _ => SyncMode::Full,
        };

        let tables: Vec<SyncTableConfig> = args
            .get("tables")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str())
                    .map(|t| SyncTableConfig {
                        source_table: t.to_string(),
                        target_table: t.to_string(),
                        column_mappings: vec![],
                        filters: None,
                        primary_key: None,
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(SyncPipeline {
            id: None,
            name: String::new(),
            source_connection_id: source_id.to_string(),
            target_connection_id: target_id.to_string(),
            source_schema: None,
            target_schema: None,
            mode,
            status: PipelineStatus::Ready,
            tables,
            batch_size: 1000,
            created_at: None,
            updated_at: None,
        })
    }

    /// Auto-detect the tables of the source connection when none were given.
    async fn auto_detect_tables(
        &self,
        state: &AppState,
        pipeline: &mut SyncPipeline,
    ) -> AppResult<()> {
        if !pipeline.tables.is_empty() {
            return Ok(());
        }
        let source = state
            .get_or_connect_driver(&pipeline.source_connection_id)
            .await?;
        let found = source.fetch_tables(None, None).await?;
        pipeline.tables = found
            .into_iter()
            .map(|n| SyncTableConfig {
                source_table: n.clone(),
                target_table: n,
                column_mappings: vec![],
                filters: None,
                primary_key: None,
            })
            .collect();
        Ok(())
    }

    /// Fill missing schemas from the connection configs.
    async fn fill_schemas(&self, state: &AppState, pipeline: &mut SyncPipeline) {
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

    async fn create(&self, args: serde_json::Value, state: &AppState) -> AppResult<ToolResult> {
        let source_id = Self::connection_id(&args, "source_connection_id");
        let target_id = Self::connection_id(&args, "target_connection_id");

        let mut pipeline = match Self::build_pipeline(&args, &source_id, &target_id) {
            Ok(p) => p,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(e.to_string()),
                })
            }
        };

        self.auto_detect_tables(state, &mut pipeline).await?;
        self.fill_schemas(state, &mut pipeline).await;

        let source_conn = state
            .storage
            .get_connection(&source_id)
            .await
            .map_err(|e| {
                crate::error::AppError::Internal(format!(
                    "Source connection {source_id} not found: {e}"
                ))
            })?;
        let target_conn = state
            .storage
            .get_connection(&target_id)
            .await
            .map_err(|e| {
                crate::error::AppError::Internal(format!(
                    "Target connection {target_id} not found: {e}"
                ))
            })?;

        let pipeline_name = format!("Sync: {} -> {}", source_conn.name, target_conn.name);
        pipeline.name = pipeline_name.clone();

        let saved = state.storage.save_sync_pipeline(&pipeline).await?;

        let table_count = saved.tables.len();
        let summary = if table_count > 0 {
            format!(" with {table_count} table(s)")
        } else {
            ". Configure tables in the Sync UI".to_string()
        };

        Ok(ToolResult {
            ok: true,
            data: Some(serde_json::json!({
                "pipeline_id": saved.id,
                "pipeline_name": pipeline_name,
                "table_count": table_count,
                "status": "ready",
                "message": format!("Sync pipeline '{}' ready{summary}", pipeline_name),
            })),
            requires_confirmation: false,
            message: Some(format!(
                "Sync pipeline '{}' created (ID: {}). Call sync with action 'run' and this pipeline_id to start it.",
                pipeline_name,
                saved.id.as_deref().unwrap_or("unknown"),
            )),
        })
    }

    async fn run(&self, args: serde_json::Value, state: &AppState) -> AppResult<ToolResult> {
        // Load a saved pipeline by id, or build one from the arguments.
        let mut pipeline = match args
            .get("pipeline_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            Some(pid) => state.storage.get_sync_pipeline(pid).await?,
            None => {
                let source_id = Self::connection_id(&args, "source_connection_id");
                let target_id = Self::connection_id(&args, "target_connection_id");
                match Self::build_pipeline(&args, &source_id, &target_id) {
                    Ok(mut p) => {
                        self.auto_detect_tables(state, &mut p).await?;
                        p
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(e.to_string()),
                        })
                    }
                }
            }
        };

        self.fill_schemas(state, &mut pipeline).await;

        if pipeline.tables.is_empty() {
            return Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(
                    "Pipeline has no tables configured. Re-run with 'tables' or create a new pipeline.".to_string(),
                ),
            });
        }

        let source = state
            .get_or_connect_driver(&pipeline.source_connection_id)
            .await?;
        let target = state
            .get_or_connect_driver(&pipeline.target_connection_id)
            .await?;

        let pipeline_id = pipeline.id.clone().unwrap_or_default();
        state
            .set_sync_control(&pipeline_id, SyncControl::Running)
            .await;
        state
            .mark_session_in_use(&pipeline.source_connection_id, true)
            .await;
        state
            .mark_session_in_use(&pipeline.target_connection_id, true)
            .await;

        let result = SyncService::execute_pipeline(
            &pipeline,
            source.as_ref(),
            target.as_ref(),
            state.storage.clone(),
            None,
            &state.sync_controller,
        )
        .await;

        state
            .mark_session_in_use(&pipeline.source_connection_id, false)
            .await;
        state
            .mark_session_in_use(&pipeline.target_connection_id, false)
            .await;
        state.remove_sync_control(&pipeline_id).await;

        let final_status = if result.is_ok() {
            PipelineStatus::Completed
        } else {
            PipelineStatus::Failed
        };
        if let Err(e) = state
            .storage
            .update_sync_pipeline_status(&pipeline_id, final_status)
            .await
        {
            tracing::error!("[sync] Failed to update pipeline status: {e}");
        }

        match result {
            Ok(()) => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({
                    "pipeline_id": pipeline_id,
                    "status": "completed",
                    "tables_synced": pipeline.tables.len(),
                })),
                requires_confirmation: false,
                message: Some(format!(
                    "Sync completed: {} table(s) synchronized from '{}' to '{}'.",
                    pipeline.tables.len(),
                    pipeline.source_connection_id,
                    pipeline.target_connection_id,
                )),
            }),
            Err(e) => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Sync failed: {e}")),
            }),
        }
    }
}
