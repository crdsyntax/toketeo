use crate::models::{JobType, ScheduledJob};
use chrono::Utc;
use std::process::Command as ProcessCommand;

pub struct ExecutionResult {
    pub success: bool,
    pub output_path: Option<String>,
    pub error: Option<String>,
    pub rows_affected: Option<i64>,
}

impl ExecutionResult {
    pub fn is_success(&self) -> bool {
        self.success
    }
}

pub struct JobExecutor;

impl JobExecutor {
    pub async fn execute(job: &ScheduledJob) -> ExecutionResult {
        match job.job_type {
            JobType::Backup => Self::execute_backup(job).await,
            JobType::Report => Self::execute_report(job).await,
            JobType::CsvExport => Self::execute_csv_export(job).await,
        }
    }

    async fn execute_backup(job: &ScheduledJob) -> ExecutionResult {
        let db_type = job.config.get("dbType").and_then(|v| v.as_str()).unwrap_or("postgres");
        let host = job.config.get("host").and_then(|v| v.as_str()).unwrap_or("localhost");
        let port = job.config.get("port").and_then(|v| v.as_i64()).unwrap_or(5432);
        let database = job.config.get("database").and_then(|v| v.as_str()).unwrap_or("");
        let user = job.config.get("user").and_then(|v| v.as_str()).unwrap_or("");
        let password = job.config.get("password").and_then(|v| v.as_str()).unwrap_or("");
        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");
        let tables = job.config.get("tables").and_then(|v| v.as_array()).map(|a| {
            a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()
        }).unwrap_or_default();

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("{}/backup_{}_{}.sql", output_dir, database, timestamp);

        let result = match db_type {
            "postgres" => {
                let mut cmd = ProcessCommand::new("pg_dump");
                cmd.arg("--host").arg(host)
                    .arg("--port").arg(port.to_string())
                    .arg("--username").arg(user)
                    .arg("--dbname").arg(database)
                    .arg("--file").arg(&filename);

                if !tables.is_empty() {
                    for table in &tables {
                        cmd.arg("--table").arg(table);
                    }
                }

                if !password.is_empty() {
                    cmd.env("PGPASSWORD", password);
                }

                cmd.output()
            }
            "mysql" | "mariadb" => {
                let mut cmd = ProcessCommand::new("mysqldump");
                cmd.arg("--host").arg(host)
                    .arg("--port").arg(port.to_string())
                    .arg("--user").arg(user)
                    .arg("--databases").arg(database)
                    .arg("--result-file").arg(&filename);

                if !tables.is_empty() {
                    for table in &tables {
                        cmd.arg("--tables").arg(table);
                    }
                }

                if !password.is_empty() {
                    cmd.arg(format!("-p{}", password));
                }

                cmd.output()
            }
            "sqlite" => {
                let db_path = job.config.get("dbPath").and_then(|v| v.as_str()).unwrap_or("");
                if !db_path.is_empty() && !filename.is_empty() {
                    ProcessCommand::new("sqlite3")
                        .arg(db_path)
                        .arg(format!(".output {}", filename))
                        .arg(".dump")
                        .output()
                } else {
                    return ExecutionResult {
                        success: false,
                        output_path: None,
                        error: Some("SQLite backup requires dbPath config".into()),
                        rows_affected: None,
                    };
                }
            }
            _ => {
                return ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some(format!("Unsupported database type: {}", db_type)),
                    rows_affected: None,
                };
            }
        };

        match result {
            Ok(output) => {
                if output.status.success() {
                    ExecutionResult {
                        success: true,
                        output_path: Some(filename),
                        error: None,
                        rows_affected: None,
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    ExecutionResult {
                        success: false,
                        output_path: None,
                        error: Some(stderr),
                        rows_affected: None,
                    }
                }
            }
            Err(e) => {
                ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some(format!("Failed to execute backup: {}", e)),
                    rows_affected: None,
                }
            }
        }
    }

    async fn execute_report(job: &ScheduledJob) -> ExecutionResult {
        let query = match job.config.get("query").and_then(|v| v.as_str()) {
            Some(q) => q,
            None => {
                return ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some("Report job requires a query in config".into()),
                    rows_affected: None,
                };
            }
        };

        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");
        let format = job.config.get("format").and_then(|v| v.as_str()).unwrap_or("json");

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("{}/report_{}_{}.{}", output_dir, job.name.replace(' ', "_"), timestamp, format);

        let result = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(format!("echo '{}' > '{}' 2>&1", query.replace('\'', "'\\''"), filename))
            .output()
            .await;

        match result {
            Ok(output) if output.status.success() => {
                ExecutionResult {
                    success: true,
                    output_path: Some(filename),
                    error: None,
                    rows_affected: None,
                }
            }
            Ok(output) => {
                ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
                    rows_affected: None,
                }
            }
            Err(e) => {
                ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some(format!("Failed to write report: {}", e)),
                    rows_affected: None,
                }
            }
        }
    }

    async fn execute_csv_export(job: &ScheduledJob) -> ExecutionResult {
        let query = match job.config.get("query").and_then(|v| v.as_str()) {
            Some(q) => q,
            None => {
                return ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some("CSV Export job requires a query in config".into()),
                    rows_affected: None,
                };
            }
        };

        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("{}/export_{}_{}.csv", output_dir, job.name.replace(' ', "_"), timestamp);

        let result = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(format!("echo '{}' > '{}' 2>&1", query.replace('\'', "'\\''"), filename))
            .output()
            .await;

        match result {
            Ok(output) if output.status.success() => {
                ExecutionResult {
                    success: true,
                    output_path: Some(filename),
                    error: None,
                    rows_affected: None,
                }
            }
            Ok(output) => {
                ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
                    rows_affected: None,
                }
            }
            Err(e) => {
                ExecutionResult {
                    success: false,
                    output_path: None,
                    error: Some(format!("Failed to write CSV: {}", e)),
                    rows_affected: None,
                }
            }
        }
    }
}
