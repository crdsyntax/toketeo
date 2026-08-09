use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::sync::RwLock;

/// Decisión del usuario ante un statement fallido.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScriptDecision {
    /// Saltar este statement y continuar con el siguiente.
    Skip,
    /// Saltar este y todos los errores futuros sin volver a preguntar.
    SkipAll,
    /// Cancelar el script completo (rollback de lo aplicado).
    Cancel,
}

/// Resultado individual de un statement dentro del script.
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

/// Reporte final del script, devuelto al frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptReport {
    pub run_id: String,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub skipped: usize,
    pub rolled_back: bool,
    pub results: Vec<StatementResult>,
}

/// Cuánto tiempo espera el runner una respuesta del usuario ante un error
/// antes de tratar el script como cancelado (rollback).
const PROMPT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

/// Ejecuta un script SQL statement a statement dentro de una transacción,
/// pausando ante errores para pedir decisión al usuario (skip / skip_all /
/// cancel = rollback).
pub struct ScriptRunner;

impl ScriptRunner {
    /// Crea el canal de decisión para un run en curso y devuelve el receiver.
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
        let mut tx = driver.begin_script(schema.as_deref()).await?;
        let run_id = uuid::Uuid::new_v4().to_string();
        let mut decision_rx = Self::register_prompt(&state.script_store.prompts, &run_id).await;

        let mut report = ScriptReport {
            run_id: run_id.clone(),
            total: statements.len(),
            ok: 0,
            failed: 0,
            skipped: 0,
            rolled_back: false,
            results: Vec::with_capacity(statements.len()),
        };

        let mut skip_all = false;
        let mut cancelled = false;

        let _ = app.emit(
            "script:run-started",
            serde_json::json!({ "runId": run_id, "total": statements.len() }),
        );

        for (index, sql) in statements.iter().enumerate() {
            if cancelled {
                break;
            }

            let _ = app.emit(
                "script:statement",
                serde_json::json!({
                    "runId": run_id,
                    "index": index,
                    "sql": sql,
                    "phase": "running",
                }),
            );

            match tx.execute_statement(sql).await {
                Ok(outcome) => {
                    report.ok += 1;
                    report.results.push(StatementResult {
                        index,
                        sql: sql.clone(),
                        ok: true,
                        skipped: false,
                        rows_affected: outcome.rows_affected,
                        row_count: outcome.row_count,
                        error: None,
                    });
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
                    Self::emit_progress(app, &report, "running");
                }
                Err(err) => {
                    report.failed += 1;
                    report.results.push(StatementResult {
                        index,
                        sql: sql.clone(),
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
                            "sql": sql,
                            "phase": "failed",
                            "error": err.to_string(),
                        }),
                    );
                    Self::emit_progress(app, &report, "running");

                    if skip_all {
                        continue;
                    }

                    // Pedir decisión al usuario.
                    let _ = app.emit(
                        "script:error-prompt",
                        serde_json::json!({
                            "runId": run_id,
                            "index": index,
                            "sql": sql,
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

        // Statements no intentados (cancelados) → skipped.
        report.skipped = report.total - report.ok - report.failed;
        report.rolled_back = cancelled;

        // Añadir al reporte los statements saltados (para que el resumen
        // pueda mostrarlos/filtrarlos; no se ejecutaron).
        if report.skipped > 0 {
            let executed = report.ok + report.failed;
            for (index, sql) in statements.iter().enumerate().skip(executed) {
                report.results.push(StatementResult {
                    index,
                    sql: sql.clone(),
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

/// Almacén de prompts de script en curso: run_id → canal de decisión.
#[derive(Default)]
pub struct ScriptPromptStore {
    pub prompts: Arc<RwLock<HashMap<String, mpsc::Sender<ScriptDecision>>>>,
}

impl ScriptPromptStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Envía una decisión a un run en curso. Devuelve false si el run ya no
    /// existe o su canal está cerrado.
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

    /// Cancela un run en curso enviando la decisión Cancel.
    pub async fn cancel(&self, run_id: &str) -> AppResult<()> {
        self.respond(run_id, ScriptDecision::Cancel).await
    }
}
