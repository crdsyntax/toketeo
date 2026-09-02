use crate::db::StatementOutcome;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScriptDecision {
    Skip,

    SkipAll,

    Cancel,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementResult {
    pub index: usize,
    pub sql: String,
    pub ok: bool,
    pub skipped: bool,
    pub rows_affected: Option<u64>,
    pub row_count: Option<usize>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptReport {
    pub run_id: String,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub skipped: usize,
    pub rolled_back: bool,

    pub pending_commit: bool,
    pub results: Vec<StatementResult>,
}

const PROMPT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

pub struct ScriptRunner;

impl ScriptRunner {
    pub async fn register_prompt(
        prompts: &RwLock<HashMap<String, mpsc::Sender<ScriptDecision>>>,
        run_id: &str,
    ) -> mpsc::Receiver<ScriptDecision> {
        let (tx, rx) = mpsc::channel::<ScriptDecision>(1);
        prompts.write().await.insert(run_id.to_string(), tx);
        rx
    }

    pub async fn unregister_prompt(
        prompts: &RwLock<HashMap<String, mpsc::Sender<ScriptDecision>>>,
        run_id: &str,
    ) {
        prompts.write().await.remove(run_id);
    }

    pub async fn run(
        state: &AppState,
        app: &AppHandle,
        conn_id: &str,
        schema: Option<String>,
        statements: Vec<String>,
    ) -> AppResult<ScriptReport> {
        if statements.is_empty() {
            return Err(AppError::Validation("Script is empty".into()));
        }
        if state.is_read_only(conn_id).await.unwrap_or(false) {
            return Err(AppError::Validation(
                "Connection is in read-only mode. Script execution is disabled.".into(),
            ));
        }

        let driver = state.get_connection(conn_id).await?;

        let transactional = state.is_transactional(conn_id).await.unwrap_or(false);
        let mut tx = if transactional {
            None
        } else {
            Some(driver.begin_script(schema.as_deref()).await?)
        };
        let run_id = uuid::Uuid::new_v4().to_string();
        let mut decision_rx = Self::register_prompt(&state.script_store.prompts, &run_id).await;

        let mut report = ScriptReport {
            run_id: run_id.clone(),
            total: statements.len(),
            ok: 0,
            failed: 0,
            skipped: 0,
            rolled_back: false,
            pending_commit: false,
            results: Vec::with_capacity(statements.len()),
        };

        let mut skip_all = false;
        let mut cancelled = false;
        let is_large_batch = statements.len() > 200;
        let mut last_progress_emit = std::time::Instant::now();

        let _ = app.emit(
            "script:run-started",
            serde_json::json!({ "runId": run_id, "total": statements.len() }),
        );

        for (index, sql) in statements.iter().enumerate() {
            if cancelled {
                break;
            }

            if !is_large_batch {
                let _ = app.emit(
                    "script:statement",
                    serde_json::json!({
                        "runId": run_id,
                        "index": index,
                        "sql": sql,
                        "phase": "running",
                    }),
                );
            }

            let outcome = if let Some(tx) = tx.as_mut() {
                tx.execute_statement(sql).await
            } else {
                let result = if let Some(schema) = schema.as_deref() {
                    driver.execute_with_schema(sql, schema).await
                } else {
                    driver.execute(sql).await
                };
                result.map(|r| {
                    let trimmed = sql.trim().to_uppercase();
                    let is_select = trimmed.starts_with("SELECT")
                        || trimmed.starts_with("SHOW")
                        || trimmed.starts_with("DESCRIBE")
                        || trimmed.starts_with("EXPLAIN")
                        || trimmed.starts_with("WITH");
                    if is_select {
                        StatementOutcome {
                            rows_affected: None,
                            row_count: Some(r.rows.len()),
                        }
                    } else {
                        StatementOutcome {
                            rows_affected: Some(r.rows_affected),
                            row_count: None,
                        }
                    }
                })
            };

            match outcome {
                Ok(outcome) => {
                    report.ok += 1;
                    if report.results.len() < 500 {
                        report.results.push(StatementResult {
                            index,
                            sql: truncate_sql(sql, 500),
                            ok: true,
                            skipped: false,
                            rows_affected: outcome.rows_affected,
                            row_count: outcome.row_count,
                            error: None,
                        });
                    }
                    if !is_large_batch {
                        let _ = app.emit(
                            "script:statement",
                            serde_json::json!({
                                "runId": run_id,
                                "index": index,
                                "sql": sql,
                                "phase": "ok",
                                "rowsAffected": outcome.rows_affected,
                                "rowCount": outcome.row_count,
                            }),
                        );
                    }
                    if !is_large_batch
                        || last_progress_emit.elapsed() >= std::time::Duration::from_millis(100)
                        || index == statements.len() - 1
                    {
                        Self::emit_progress(app, &report, "running");
                        last_progress_emit = std::time::Instant::now();
                    }
                }
                Err(err) => {
                    report.failed += 1;
                    report.results.push(StatementResult {
                        index,
                        sql: truncate_sql(sql, 500),
                        ok: false,
                        skipped: false,
                        rows_affected: None,
                        row_count: None,
                        error: Some(err.to_string()),
                    });
                    let _ = app.emit(
                        "script:statement",
                        serde_json::json!({
                            "runId": run_id,
                            "index": index,
                            "sql": truncate_sql(sql, 500),
                            "phase": "failed",
                            "error": err.to_string(),
                        }),
                    );
                    Self::emit_progress(app, &report, "running");
                    last_progress_emit = std::time::Instant::now();

                    if skip_all {
                        continue;
                    }

                    let _ = app.emit(
                        "script:error-prompt",
                        serde_json::json!({
                            "runId": run_id,
                            "index": index,
                            "sql": truncate_sql(sql, 500),
                            "error": err.to_string(),
                        }),
                    );

                    let decision = tokio::time::timeout(PROMPT_TIMEOUT, decision_rx.recv())
                        .await
                        .ok()
                        .flatten();

                    match decision {
                        Some(ScriptDecision::Skip) => continue,
                        Some(ScriptDecision::SkipAll) => {
                            skip_all = true;
                            continue;
                        }
                        Some(ScriptDecision::Cancel) | None => {
                            cancelled = true;
                            break;
                        }
                    }
                }
            }
        }

        report.skipped = report.total - report.ok - report.failed;
        report.rolled_back = cancelled;

        if report.skipped > 0 {
            let executed = report.ok + report.failed;
            for (index, sql) in statements.iter().enumerate().skip(executed) {
                if report.results.len() >= 500 {
                    break;
                }
                report.results.push(StatementResult {
                    index,
                    sql: truncate_sql(sql, 500),
                    ok: false,
                    skipped: true,
                    rows_affected: None,
                    row_count: None,
                    error: None,
                });
            }
        }

        let _ = Self::unregister_prompt(&state.script_store.prompts, &run_id).await;
        drop(decision_rx);

        if transactional {
            report.rolled_back = false;
            report.pending_commit = true;
            Self::emit_progress(app, &report, "pending");
        } else if let Some(tx) = tx {
            if cancelled {
                let rollback_err = tx.rollback().await.err();
                if let Some(e) = rollback_err {
                    return Err(e);
                }
                Self::emit_progress(app, &report, "rolled_back");
            } else {
                let commit_err = tx.commit().await.err();
                if let Some(e) = commit_err {
                    return Err(e);
                }
                Self::emit_progress(app, &report, "committed");
            }
        }

        let _ = app.emit("script:done", &report);
        Ok(report)
    }

    fn emit_progress(app: &AppHandle, report: &ScriptReport, status: &str) {
        let _ = app.emit(
            "script:progress",
            serde_json::json!({
                "runId": report.run_id,
                "total": report.total,
                "ok": report.ok,
                "failed": report.failed,
                "skipped": report.skipped,
                "status": status,
            }),
        );
    }
}

#[derive(Default)]
pub struct ScriptPromptStore {
    pub prompts: Arc<RwLock<HashMap<String, mpsc::Sender<ScriptDecision>>>>,
}

impl ScriptPromptStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn respond(&self, run_id: &str, decision: ScriptDecision) -> AppResult<()> {
        let sender = {
            let guard = self.prompts.read().await;
            guard.get(run_id).cloned()
        };
        match sender {
            Some(tx) => tx.send(decision).await.map_err(|_| {
                AppError::Internal(format!(
                    "Script run {} is not waiting for a response",
                    run_id
                ))
            }),
            None => Err(AppError::Internal(format!(
                "Script run {} not found (finished or never started)",
                run_id
            ))),
        }
    }

    pub async fn cancel(&self, run_id: &str) -> AppResult<()> {
        self.respond(run_id, ScriptDecision::Cancel).await
    }
}

fn truncate_sql(sql: &str, max_len: usize) -> String {
    if sql.len() <= max_len {
        sql.to_string()
    } else {
        let mut truncated = sql.chars().take(max_len).collect::<String>();
        truncated.push_str("... [truncated]");
        truncated
    }
}
