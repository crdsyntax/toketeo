use crate::error::AppResult;
use crate::infrastructure::scheduler::executors::JobExecutor;
use crate::models::ScheduledJob;
use crate::ssh::KnownHostsStore;
use crate::storage::Storage;
use chrono::Utc;
use cron::Schedule;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Clone, serde::Serialize)]
pub struct JobCompletedPayload {
    #[serde(rename = "jobId")]
    pub job_id: String,
    #[serde(rename = "jobName")]
    pub job_name: String,
    pub status: String,
    #[serde(rename = "outputDir")]
    pub output_dir: Option<String>,
    pub error: Option<String>,
    #[serde(rename = "rowsAffected")]
    pub rows_affected: Option<i64>,
}

#[derive(Clone, serde::Serialize)]
pub struct JobStartedPayload {
    #[serde(rename = "jobId")]
    pub job_id: String,
    #[serde(rename = "jobName")]
    pub job_name: String,
}

pub struct JobEngine {
    storage: Arc<Storage>,
    known_hosts: Arc<KnownHostsStore>,
    app_handle: Option<AppHandle>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    cancel_tokens: std::sync::Mutex<HashMap<String, CancellationToken>>,
}

impl Drop for JobEngine {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

impl JobEngine {
    pub fn new(storage: Arc<Storage>, known_hosts: Arc<KnownHostsStore>) -> Self {
        Self {
            storage,
            known_hosts,
            app_handle: None,
            shutdown_tx: None,
            cancel_tokens: std::sync::Mutex::new(HashMap::new()),
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub fn app_handle(&self) -> Option<AppHandle> {
        self.app_handle.clone()
    }

    pub fn cancel_job(&self, job_id: &str) -> bool {
        if let Ok(tokens) = self.cancel_tokens.lock() {
            if let Some(token) = tokens.get(job_id) {
                token.cancel();
                return true;
            }
        }
        false
    }

    pub fn register_token(&self, job_id: &str, token: CancellationToken) {
        if let Ok(mut tokens) = self.cancel_tokens.lock() {
            tokens.insert(job_id.to_string(), token);
        }
    }

    pub fn remove_token(&self, job_id: &str) {
        if let Ok(mut tokens) = self.cancel_tokens.lock() {
            tokens.remove(job_id);
        }
    }

    pub fn start(self: Arc<Self>) {
        let (tx, mut rx) = oneshot::channel();
        // Store shutdown sender so Drop sends the signal
        // We use unsafe to mutably access the field through the Arc
        // Actually, let's use a separate approach: store shutdown_tx before Arc-ifying
        // Since this is called on Arc<Self> and we need to set shutdown_tx, we do it here
        unsafe {
            let ptr = Arc::as_ptr(&self) as *mut Self;
            (*ptr).shutdown_tx = Some(tx);
        }

        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if let Err(e) = Self::process_jobs(&self).await {
                            eprintln!("[JobEngine] Error processing jobs: {}", e);
                        }
                    }
                    _ = &mut rx => {
                        tracing::info!("JobEngine shutdown signal received");
                        break;
                    }
                }
            }
        });
    }

    async fn process_jobs(engine: &Self) -> AppResult<()> {
        let jobs = engine.storage.get_enabled_scheduled_jobs().await?;
        let now = Utc::now();

        for mut job in jobs {
            if should_run_now(&job, &now) {
                let token = CancellationToken::new();
                engine.register_token(&job.id.to_string(), token.clone());
                let result = execute_job(
                    &engine.storage,
                    &engine.known_hosts,
                    &mut job,
                    &engine.app_handle,
                    Some(token.clone()),
                )
                .await;
                engine.remove_token(&job.id.to_string());
                match result {
                    Ok(payload) => {
                        job.last_run = Some(now);
                        if let Some(ref cron_str) = job.cron_expression {
                            if let Ok(schedule) = Schedule::from_str(cron_str) {
                                job.next_run = schedule.after(&now).next();
                            }
                        }
                        let _ = engine.storage.save_scheduled_job(&job).await;

                        if let Some(ref handle) = engine.app_handle {
                            let _ = handle.emit("scheduler:job-completed", &payload);
                        }
                    }
                    Err(e) => {
                        eprintln!("[JobEngine] Failed to execute job {}: {}", job.name, e);
                        if let Some(ref handle) = engine.app_handle {
                            let payload = JobCompletedPayload {
                                job_id: job.id.to_string(),
                                job_name: job.name.clone(),
                                status: "error".into(),
                                output_dir: None,
                                error: Some(e.to_string()),
                                rows_affected: None,
                            };
                            let _ = handle.emit("scheduler:job-completed", &payload);
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

fn should_run_now(job: &ScheduledJob, now: &chrono::DateTime<Utc>) -> bool {
    let cron_str = match &job.cron_expression {
        Some(s) if !s.is_empty() => s,
        _ => return false,
    };

    if let Some(next_run) = job.next_run {
        if *now < next_run {
            return false;
        }
    }

    let schedule = match Schedule::from_str(cron_str) {
        Ok(s) => s,
        Err(_) => return false,
    };

    if let Some(next) = schedule.after(now).next() {
        if let Some(last_run) = job.last_run {
            let since_last = *now - last_run;
            let since_next = next - last_run;
            if since_last < since_next && since_last.num_seconds() < 60 {
                return false;
            }
        }
        true
    } else {
        false
    }
}

pub async fn execute_job_now(
    storage: &Arc<Storage>,
    known_hosts: &Arc<KnownHostsStore>,
    app_handle: &Option<AppHandle>,
    job_id: &str,
    cancel_token: Option<CancellationToken>,
) -> AppResult<JobCompletedPayload> {
    let mut job = storage.get_scheduled_job(job_id).await?;

    let result = execute_job(storage, known_hosts, &mut job, app_handle, cancel_token).await?;

    job.last_run = Some(Utc::now());
    if let Some(ref cron_str) = job.cron_expression {
        if let Ok(schedule) = Schedule::from_str(cron_str) {
            job.next_run = schedule.after(&Utc::now()).next();
        }
    }
    let _ = storage.save_scheduled_job(&job).await;

    if let Some(ref handle) = app_handle {
        let _ = handle.emit("scheduler:job-completed", &result);
    }

    Ok(result)
}

async fn execute_job(
    storage: &Arc<Storage>,
    known_hosts: &Arc<KnownHostsStore>,
    job: &mut ScheduledJob,
    app_handle: &Option<AppHandle>,
    cancel_token: Option<CancellationToken>,
) -> AppResult<JobCompletedPayload> {
    let job_id = job.id;
    let started_at = Utc::now();

    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "scheduler:job-started",
            &JobStartedPayload {
                job_id: job_id.to_string(),
                job_name: job.name.clone(),
            },
        );
    }

    if let Some(ref token) = cancel_token {
        if token.is_cancelled() {
            return Err(crate::error::AppError::Internal("Job cancelled".into()));
        }
    }

    let result = if let Some(ref handle) = app_handle {
        JobExecutor::execute(job, storage, known_hosts, handle, cancel_token).await
    } else {
        return Err(crate::error::AppError::Internal(
            "No app handle available".into(),
        ));
    };

    let finished_at = Utc::now();

    let log = crate::models::JobExecutionLog {
        id: Uuid::new_v4(),
        job_id,
        started_at,
        finished_at,
        status: if result.is_success() {
            "success".into()
        } else {
            "error".into()
        },
        output_path: result.output_dir.clone(),
        error: result.error.clone(),
        rows_affected: result.rows_affected,
    };

    let _ = storage.save_job_execution_log(&log).await;

    let payload = JobCompletedPayload {
        job_id: job_id.to_string(),
        job_name: job.name.clone(),
        status: if result.is_success() {
            "success".into()
        } else {
            "error".into()
        },
        output_dir: result.output_dir,
        error: result.error,
        rows_affected: result.rows_affected,
    };

    Ok(payload)
}
