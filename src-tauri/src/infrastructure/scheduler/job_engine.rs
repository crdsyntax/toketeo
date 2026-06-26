use crate::error::AppResult;
use crate::infrastructure::scheduler::executors::JobExecutor;
use crate::models::ScheduledJob;
use crate::storage::Storage;
use chrono::Utc;
use cron::Schedule;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Clone, serde::Serialize)]
pub struct JobCompletedPayload {
    pub job_id: String,
    pub job_name: String,
    pub status: String,
    pub output_path: Option<String>,
    pub error: Option<String>,
    pub rows_affected: Option<i64>,
}

pub struct JobEngine {
    storage: Arc<Storage>,
    app_handle: Option<AppHandle>,
}

impl JobEngine {
    pub fn new(storage: Arc<Storage>) -> Self {
        Self {
            storage,
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub fn start(self: &'static Self) {
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                interval.tick().await;
                if let Err(e) = Self::process_jobs(self).await {
                    eprintln!("[JobEngine] Error processing jobs: {}", e);
                }
            }
        });
    }

    async fn process_jobs(engine: &Self) -> AppResult<()> {
        let jobs = engine.storage.get_enabled_scheduled_jobs().await?;
        let now = Utc::now();

        for mut job in jobs {
            if should_run_now(&job, &now) {
                let result = execute_job(&engine.storage, &mut job, &engine.app_handle).await;
                match result {
                    Ok(payload) => {
                        job.last_run = Some(now);
                        if let Ok(schedule) = Schedule::from_str(&job.cron_expression) {
                            job.next_run = schedule.after(&now).next();
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
                                output_path: None,
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
    if let Some(next_run) = job.next_run {
        if *now < next_run {
            return false;
        }
    }

    let schedule = match Schedule::from_str(&job.cron_expression) {
        Ok(s) => s,
        Err(_) => return false,
    };

    if let Some(next) = schedule.after(&now).next() {
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

pub async fn execute_job_now(storage: &Arc<Storage>, app_handle: &Option<AppHandle>, job_id: &str) -> AppResult<JobCompletedPayload> {
    let mut job = storage.get_scheduled_job(job_id).await?;
    let result = execute_job(storage, &mut job, app_handle).await?;

    job.last_run = Some(Utc::now());
    if let Ok(schedule) = Schedule::from_str(&job.cron_expression) {
        job.next_run = schedule.after(&Utc::now()).next();
    }
    let _ = storage.save_scheduled_job(&job).await;

    if let Some(ref handle) = app_handle {
        let _ = handle.emit("scheduler:job-completed", &result);
    }

    Ok(result)
}

async fn execute_job(
    storage: &Arc<Storage>,
    job: &mut ScheduledJob,
    _app_handle: &Option<AppHandle>,
) -> AppResult<JobCompletedPayload> {
    let job_id = job.id;
    let started_at = Utc::now();

    let result = JobExecutor::execute(job).await;

    let finished_at = Utc::now();

    let log = crate::models::JobExecutionLog {
        id: Uuid::new_v4(),
        job_id,
        started_at,
        finished_at,
        status: if result.is_success() { "success".into() } else { "error".into() },
        output_path: result.output_path.clone(),
        error: result.error.clone(),
        rows_affected: result.rows_affected,
    };

    let _ = storage.save_job_execution_log(&log).await;

    let payload = JobCompletedPayload {
        job_id: job_id.to_string(),
        job_name: job.name.clone(),
        status: if result.is_success() { "success".into() } else { "error".into() },
        output_path: result.output_path,
        error: result.error,
        rows_affected: result.rows_affected,
    };

    Ok(payload)
}
