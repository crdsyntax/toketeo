use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::infrastructure::scheduler::job_engine;
use crate::models::assistant::ToolResult;
use crate::models::{JobConfigDto, JobType};
use crate::state::AppState;
use uuid::Uuid;

use super::tool_engine::AssistantTool;

pub struct JobsTool;

#[async_trait]
impl AssistantTool for JobsTool {
    fn name(&self) -> &str {
        "jobs"
    }

    fn description(&self) -> &str {
        "Manage scheduled jobs (destructive actions require confirmation): 'create' (name, connection_id, job_type backup|report|csvExport, optional cron_expression, optional config {query, database, collections, outputDir}), 'update' (id, optional fields), 'delete', 'list', 'run' (execute now), 'stop', 'databases' (connection_id), 'tables' (connection_id, database)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "update", "delete", "list", "run", "stop", "databases", "tables"],
                    "description": "Operation"
                },
                "id": {
                    "type": "string",
                    "description": "Job ID (update/delete/run/stop)"
                },
                "name": {
                    "type": "string",
                    "description": "Job name (create/update)"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID (create, databases, tables)"
                },
                "job_type": {
                    "type": "string",
                    "enum": ["backup", "report", "csvExport"],
                    "description": "Job type (create)"
                },
                "cron_expression": {
                    "type": "string",
                    "description": "Cron expression (optional; 5 or 6 fields)"
                },
                "config": {
                    "type": "object",
                    "description": "Job config (create/update): { query, database, collections, outputDir }"
                },
                "enabled": {
                    "type": "boolean",
                    "description": "Enabled flag (update)"
                },
                "database": {
                    "type": "string",
                    "description": "Database for 'tables'"
                }
            },
            "required": ["action"]
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
            .unwrap_or("list");
        let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");

        match action {
            "list" => match state.storage.get_all_scheduled_jobs().await {
                Ok(jobs) => {
                    let safe: Vec<serde_json::Value> = jobs.iter().map(sanitize_job).collect();
                    Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "jobs": safe })),
                        requires_confirmation: false,
                        message: None,
                    })
                }
                Err(e) => Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(e.to_string()),
                }),
            },
            "create" => self.create(args, state).await,
            "update" => self.update(args, state).await,
            "delete" => {
                if id.is_empty() {
                    return missing("id is required for delete");
                }
                match state.storage.delete_scheduled_job(id).await {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "deleted": id })),
                        requires_confirmation: false,
                        message: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "run" => {
                if id.is_empty() {
                    return missing("id is required for run");
                }
                match self.run_job(state, id).await {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "started": id })),
                        requires_confirmation: false,
                        message: Some(format!("Job {id} started in background.")),
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "stop" => {
                if id.is_empty() {
                    return missing("id is required for stop");
                }
                let engine_guard = state.job_engine.read().await;
                match *engine_guard {
                    Some(ref engine) => Ok(ToolResult {
                        ok: true,
                        data: Some(
                            serde_json::json!({ "stopped": id, "cancelled": engine.cancel_job(id) }),
                        ),
                        requires_confirmation: false,
                        message: None,
                    }),
                    None => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("Job engine not available.".to_string()),
                    }),
                }
            }
            "databases" => {
                let cid = args
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if cid.is_empty() {
                    return missing("connection_id is required for databases");
                }
                match state.get_or_connect_driver(cid).await {
                    Ok(driver) => match driver.fetch_databases().await {
                        Ok(dbs) => Ok(ToolResult {
                            ok: true,
                            data: Some(serde_json::json!({ "databases": dbs })),
                            requires_confirmation: false,
                            message: None,
                        }),
                        Err(e) => Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(e.to_string()),
                        }),
                    },
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "tables" => {
                let cid = args
                    .get("connection_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let database = args.get("database").and_then(|v| v.as_str()).unwrap_or("");
                if cid.is_empty() || database.is_empty() {
                    return missing("connection_id and database are required for tables");
                }
                match state.get_or_connect_driver(cid).await {
                    Ok(driver) => match driver.fetch_tables(Some(database.to_string()), None).await
                    {
                        Ok(t) => Ok(ToolResult {
                            ok: true,
                            data: Some(serde_json::json!({ "tables": t })),
                            requires_confirmation: false,
                            message: None,
                        }),
                        Err(e) => Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(e.to_string()),
                        }),
                    },
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            other => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown action: {other}")),
            }),
        }
    }
}

impl JobsTool {
    async fn create(&self, args: serde_json::Value, state: &AppState) -> AppResult<ToolResult> {
        let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let connection_id = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if name.is_empty() || connection_id.is_empty() {
            return missing("name and connection_id are required for create");
        }

        let job_type = match args.get("job_type").and_then(|v| v.as_str()) {
            Some("report") => JobType::Report,
            Some("csvExport") => JobType::CsvExport,
            _ => JobType::Backup,
        };
        let cron_expression = args
            .get("cron_expression")
            .and_then(|v| v.as_str())
            .map(String::from);
        let config: JobConfigDto = match serde_json::from_value(
            args.get("config")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
        ) {
            Ok(c) => c,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Invalid config: {e}")),
                })
            }
        };

        let conn_id = match Uuid::parse_str(connection_id) {
            Ok(u) => u,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Invalid connection ID: {e}")),
                })
            }
        };

        let mut config_value = config.to_value();
        if job_type == JobType::Backup {
            if let Ok(conn) = state.storage.get_connection(connection_id).await {
                if let Some(cfg) = config_value.as_object_mut() {
                    cfg.insert(
                        "dbType".into(),
                        serde_json::Value::String(conn.db_type.to_string()),
                    );
                    cfg.insert("host".into(), serde_json::Value::String(conn.host));
                    cfg.insert("port".into(), serde_json::Value::Number(conn.port.into()));
                    cfg.insert("user".into(), serde_json::Value::String(conn.user));
                    let has_db = cfg
                        .get("database")
                        .and_then(|v| v.as_str())
                        .map(|s| !s.is_empty())
                        .unwrap_or(false);
                    if !has_db {
                        if let Some(db) = &conn.database {
                            cfg.insert("database".into(), serde_json::Value::String(db.clone()));
                        }
                    }
                }
            }
        }

        let now = chrono::Utc::now();
        let job = crate::models::ScheduledJob {
            id: Uuid::new_v4(),
            name: name.to_string(),
            connection_id: conn_id,
            job_type,
            cron_expression,
            config: config_value,
            enabled: true,
            last_run: None,
            next_run: None,
            created_at: now,
        };

        match state.storage.save_scheduled_job(&job).await {
            Ok(()) => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({ "job": sanitize_job(&job) })),
                requires_confirmation: false,
                message: None,
            }),
            Err(e) => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(e.to_string()),
            }),
        }
    }

    async fn update(&self, args: serde_json::Value, state: &AppState) -> AppResult<ToolResult> {
        let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
            return missing("id is required for update");
        }
        let mut job = match state.storage.get_scheduled_job(id).await {
            Ok(j) => j,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(e.to_string()),
                })
            }
        };

        if let Some(name) = args.get("name").and_then(|v| v.as_str()) {
            job.name = name.to_string();
        }
        if let Some(cron) = args.get("cron_expression").and_then(|v| v.as_str()) {
            job.cron_expression = if cron.trim().is_empty() {
                None
            } else {
                Some(cron.to_string())
            };
        }
        if let Some(config) = args.get("config") {
            match serde_json::from_value::<JobConfigDto>(config.clone()) {
                Ok(c) => job.config = c.to_value(),
                Err(e) => {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(format!("Invalid config: {e}")),
                    })
                }
            }
        }
        if let Some(enabled) = args.get("enabled").and_then(|v| v.as_bool()) {
            job.enabled = enabled;
        }

        match state.storage.save_scheduled_job(&job).await {
            Ok(()) => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({ "job": sanitize_job(&job) })),
                requires_confirmation: false,
                message: None,
            }),
            Err(e) => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(e.to_string()),
            }),
        }
    }

    async fn run_job(&self, state: &AppState, id: &str) -> AppResult<()> {
        let storage = state.storage.clone();
        let known_hosts = state.known_hosts.clone();
        let cancel_token = tokio_util::sync::CancellationToken::new();
        let token_clone = cancel_token.clone();

        let app_handle = {
            let engine_guard = state.job_engine.read().await;
            match *engine_guard {
                Some(ref engine) => {
                    engine.register_token(id, cancel_token);
                    engine.app_handle()
                }
                None => None,
            }
        };

        let job_id = id.to_string();
        tokio::spawn(async move {
            if let Err(e) = job_engine::execute_job_now(
                &storage,
                &known_hosts,
                &app_handle,
                &job_id,
                Some(token_clone),
            )
            .await
            {
                tracing::error!("[jobs] run_job_now error: {e}");
            }
        });
        Ok(())
    }
}

fn missing(msg: &str) -> AppResult<ToolResult> {
    Ok(ToolResult {
        ok: false,
        data: None,
        requires_confirmation: false,
        message: Some(msg.to_string()),
    })
}

fn sanitize_job(job: &crate::models::ScheduledJob) -> serde_json::Value {
    let mut value = serde_json::to_value(job).unwrap_or(serde_json::Value::Null);
    if let Some(cfg) = value.get_mut("config").and_then(|c| c.as_object_mut()) {
        cfg.remove("password");
    }
    value
}

#[cfg(test)]
mod tests {
    use super::sanitize_job;
    use crate::models::{JobType, ScheduledJob};
    use chrono::Utc;

    fn job_with_password() -> ScheduledJob {
        ScheduledJob {
            id: uuid::Uuid::new_v4(),
            name: "backup nightly".to_string(),
            connection_id: uuid::Uuid::new_v4(),
            job_type: JobType::Backup,
            cron_expression: None,
            config: serde_json::json!({
                "dbType": "mariadb",
                "host": "localhost",
                "password": "supersecret",
                "database": "app",
            }),
            enabled: true,
            last_run: None,
            next_run: None,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn sanitize_job_removes_password_from_config() {
        let value = sanitize_job(&job_with_password());
        let config = &value["config"];
        assert!(
            config.get("password").is_none(),
            "password must be stripped"
        );
        assert_eq!(config["host"], "localhost");
        assert_eq!(config["database"], "app");
        assert_eq!(value["name"], "backup nightly");
    }

    #[test]
    fn sanitize_job_keeps_non_secret_fields() {
        let value = sanitize_job(&job_with_password());
        assert_eq!(value["jobType"], "backup");
    }

    #[test]
    fn job_config_dto_roundtrip_preserves_extra_fields() {
        let dto: crate::models::JobConfigDto = serde_json::from_value(serde_json::json!({
            "query": "SELECT 1",
            "custom": 42,
        }))
        .unwrap();
        let value = dto.to_value();
        assert_eq!(value["query"], "SELECT 1");
        assert_eq!(value["custom"], 42);
    }
}
