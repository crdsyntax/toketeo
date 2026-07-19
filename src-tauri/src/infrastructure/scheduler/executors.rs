use crate::db::{DbDriver, DbType};
use crate::infrastructure::database::connection_string_builder::ConnectionStringBuilder;
use crate::infrastructure::drivers::driver_factory::DriverFactory;
use crate::models::{JobType, ScheduledJob};
use crate::storage::Storage;
use chrono::Utc;
use std::sync::Arc;
use std::fs;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

pub struct ExecutionResult {
    pub success: bool,
    pub output_dir: Option<String>,
    pub error: Option<String>,
    pub rows_affected: Option<i64>,
}

pub struct JobOutput {
    pub driver: Arc<dyn DbDriver>,
    pub db_type: DbType,
    pub db_name: String,
    #[allow(dead_code)]
    pub _tunnel: Option<crate::ssh::SshTunnel>,
}

impl ExecutionResult {
    pub fn is_success(&self) -> bool {
        self.success
    }
}

fn err(msg: String) -> ExecutionResult {
    ExecutionResult { success: false, output_dir: None, error: Some(msg), rows_affected: None }
}

fn ok(dir: String) -> ExecutionResult {
    ExecutionResult { success: true, output_dir: Some(dir), error: None, rows_affected: None }
}

fn quote_id(db_type: &DbType, id: &str) -> String {
    match db_type {
        DbType::Postgres => format!("\"{}\"", id.replace('"', "\"\"")),
        DbType::Mysql | DbType::Mariadb => format!("`{}`", id.replace('`', "``")),
        DbType::Sqlite => format!("\"{}\"", id.replace('"', "\"\"")),
        DbType::Sqlserver => format!("[{}]", id.replace(']', "]]")),
        _ => id.to_string(),
    }
}

fn sql_value(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::Null => "NULL".into(),
        serde_json::Value::Bool(b) => if *b { "TRUE".into() } else { "FALSE".into() },
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''").replace('\\', "\\\\")),
        serde_json::Value::Array(a) => {
            let items: Vec<String> = a.iter().map(sql_value).collect();
            format!("ARRAY[{}]", items.join(", "))
        }
        serde_json::Value::Object(o) => format!("'{}'", serde_json::to_string(o).unwrap_or_default().replace('\'', "''")),
    }
}

fn map_type<'a>(db_type: &DbType, type_name: &'a str) -> &'a str {
    let lower = type_name.to_lowercase();
    match db_type {
        DbType::Postgres => match lower.as_str() {
            "character varying" | "varying" => "VARCHAR",
            "character" | "char" => "CHAR",
            "timestamp without time zone" => "TIMESTAMP",
            "timestamp with time zone" => "TIMESTAMPTZ",
            "time without time zone" => "TIME",
            "double precision" => "DOUBLE PRECISION",
            "real" => "REAL",
            "numeric" | "decimal" => "NUMERIC",
            "integer" | "int" => "INTEGER",
            "bigint" => "BIGINT",
            "smallint" => "SMALLINT",
            "boolean" => "BOOLEAN",
            "text" => "TEXT",
            "jsonb" => "JSONB",
            "json" => "JSON",
            "uuid" => "UUID",
            "bytea" => "BYTEA",
            "date" => "DATE",
            "timestamp" => "TIMESTAMP",
            _ => type_name,
        },
        DbType::Mysql | DbType::Mariadb => match lower.as_str() {
            "varchar" => "VARCHAR",
            "char" => "CHAR",
            "int" | "integer" => "INT",
            "bigint" => "BIGINT",
            "smallint" => "SMALLINT",
            "tinyint" => "TINYINT",
            "float" => "FLOAT",
            "double" => "DOUBLE",
            "decimal" => "DECIMAL",
            "text" => "TEXT",
            "blob" => "BLOB",
            "datetime" => "DATETIME",
            "timestamp" => "TIMESTAMP",
            "date" => "DATE",
            "time" => "TIME",
            "boolean" => "TINYINT(1)",
            "json" => "JSON",
            "enum" => "VARCHAR(255)",
            _ => type_name,
        },
        DbType::Sqlite => match lower.as_str() {
            "integer" => "INTEGER",
            "text" => "TEXT",
            "real" => "REAL",
            "blob" => "BLOB",
            "numeric" => "NUMERIC",
            "boolean" => "INTEGER",
            "datetime" => "TEXT",
            "date" => "TEXT",
            "timestamp" => "TEXT",
            _ => type_name,
        },
        DbType::Sqlserver => match lower.as_str() {
            "nvarchar" | "varchar" => "NVARCHAR(MAX)",
            "nchar" | "char" => "NCHAR",
            "int" => "INT",
            "bigint" => "BIGINT",
            "smallint" => "SMALLINT",
            "tinyint" => "TINYINT",
            "float" => "FLOAT",
            "real" => "REAL",
            "decimal" => "DECIMAL",
            "bit" => "BIT",
            "datetime" => "DATETIME",
            "datetime2" => "DATETIME2",
            "date" => "DATE",
            "time" => "TIME",
            "nvarcharmax" => "NVARCHAR(MAX)",
            "varcharmax" => "VARCHAR(MAX)",
            "uniqueidentifier" => "UNIQUEIDENTIFIER",
            _ => type_name,
        },
        _ => type_name,
    }
}

fn ensure_parent_dir(path: &str) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create output dir: {}", e))?;
    }
    Ok(())
}

#[derive(Clone, serde::Serialize)]
pub struct JobProgressPayload {
    #[serde(rename = "jobId")]
    pub job_id: String,
    #[serde(rename = "jobName")]
    pub job_name: String,
    #[serde(rename = "currentTable")]
    pub current_table: String,
    #[serde(rename = "tableIndex")]
    pub table_index: usize,
    #[serde(rename = "totalTables")]
    pub total_tables: usize,
}

fn emit_progress(handle: &AppHandle, job: &ScheduledJob, table: &str, index: usize, total: usize) {
    let _ = handle.emit("scheduler:job-progress", &JobProgressPayload {
        job_id: job.id.to_string(),
        job_name: job.name.clone(),
        current_table: table.to_string(),
        table_index: index,
        total_tables: total,
    });
}

pub struct JobExecutor;

impl JobExecutor {
    pub async fn execute(job: &ScheduledJob, storage: &Storage, app_handle: &AppHandle, cancel_token: Option<CancellationToken>) -> ExecutionResult {
        match job.job_type {
            JobType::Backup => Self::execute_backup(job, storage, app_handle, cancel_token).await,
            JobType::Report => Self::execute_report(job, storage, cancel_token).await,
            JobType::CsvExport => Self::execute_csv_export(job, storage, cancel_token).await,
        }
    }

    async fn build_driver(job: &ScheduledJob, storage: &Storage) -> Result<JobOutput, ExecutionResult> {
        let conn_id = job.connection_id.to_string();
        let mut conn_config = storage.get_connection(&conn_id).await.map_err(|e| err(format!("Failed to get connection: {}", e)))?;

        // Use database from job config (user selection) if present, fallback to connection default
        if let Some(db) = job.config.get("database").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            conn_config.database = Some(db.to_string());
        }
        let db_name = conn_config.database.clone().unwrap_or_default();

        // Decrypt SSH credentials if SSH is configured
        if conn_config.ssh_tunnel.is_some() {
            if let Some(key) = storage.get_master_key() {
                let _ = crate::application::connection_service::ConnectionService::decrypt_connection(&mut conn_config, &key);
            }
        }

        // Open SSH tunnel if configured
        let tunnel = if let Some(ref ssh_config) = conn_config.ssh_tunnel {
            tracing::info!("[scheduler] Opening SSH tunnel to {}:{}", ssh_config.host, ssh_config.port);
            let remote_host = conn_config.host.clone();
            let remote_port = conn_config.port;
            match crate::ssh::SshTunnel::open(ssh_config, &remote_host, remote_port, Some(conn_id)).await {
                Ok(t) => {
                    conn_config.port = t.local_port;
                    Some(t)
                }
                Err(e) => {
                    tracing::error!("[scheduler] SSH tunnel failed: {}", e);
                    return Err(err(format!("SSH tunnel failed: {}", e)));
                }
            }
        } else {
            None
        };

        let url = ConnectionStringBuilder::build(&conn_config).map_err(|e| err(format!("Failed to build connection string: {}", e)))?;
        let db_type = conn_config.db_type.clone();

        let driver = DriverFactory::create(db_type.clone(), &url, false, None).await
            .map_err(|e| err(format!("Failed to connect for backup: {}", e)))?;

        Ok(JobOutput { driver, db_type, db_name, _tunnel: tunnel })
    }

    async fn execute_backup(job: &ScheduledJob, storage: &Storage, app_handle: &AppHandle, cancel_token: Option<CancellationToken>) -> ExecutionResult {
        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");
        let filter_tables: Vec<String> = job.config.get("tables").and_then(|v| v.as_array()).map(|a| {
            a.iter().filter_map(|v| v.as_str().map(String::from)).collect()
        }).unwrap_or_default();

        let output = match Self::build_driver(job, storage).await {
            Ok(v) => v,
            Err(e) => return e,
        };

        if let Err(e) = ensure_parent_dir(&format!("{}/placeholder", output_dir)) {
            return err(e);
        }

        match output.db_type {
            DbType::Mongodb => Self::dump_mongodb(output.driver, output_dir, &output.db_name, &filter_tables, job, app_handle, cancel_token).await,
            _ => Self::dump_sql(output.driver, &output.db_type, output_dir, &output.db_name, &filter_tables, job, app_handle, cancel_token).await,
        }
    }

    async fn dump_sql(driver: Arc<dyn DbDriver>, db_type: &DbType, output_dir: &str, db_name: &str, filter_tables: &[String], job: &ScheduledJob, app_handle: &AppHandle, cancel_token: Option<CancellationToken>) -> ExecutionResult {
        let tables = match driver.fetch_tables(None, None).await {
            Ok(t) => t,
            Err(e) => return err(format!("Failed to fetch tables: {}", e)),
        };

        let tables: Vec<&str> = if filter_tables.is_empty() {
            tables.iter().map(|s| s.as_str()).collect()
        } else {
            tables.iter().filter(|t| filter_tables.contains(t)).map(|s| s.as_str()).collect()
        };

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let total = tables.len();
        let mut written_files: Vec<String> = Vec::new();

        for (idx, table) in tables.iter().enumerate() {
            if let Some(ref token) = cancel_token {
                if token.is_cancelled() {
                    break;
                }
            }
            emit_progress(app_handle, job, table, idx + 1, total);

            let mut output = String::new();
            output.push_str(&format!("-- Toketeo native backup\n-- Engine: {:?}\n-- Table: {}\n-- Date: {}\n\n", db_type, table, Utc::now()));

            let qid = |id: &str| quote_id(db_type, id);

            let columns = match driver.fetch_columns(table, None).await {
                Ok(c) => c,
                Err(e) => {
                    output.push_str(&format!("-- Skipping table {}: {}\n\n", table, e));
                    let filename = format!("{}/backup_{}_{}_{}.sql", output_dir, db_name, table, timestamp);
                    if let Ok(()) = ensure_parent_dir(&filename) {
                        let _ = fs::write(&filename, &output);
                    }
                    continue;
                }
            };

            let col_names: Vec<&str> = columns.iter().filter_map(|c| c.get("name").and_then(|v| v.as_str())).collect();
            if col_names.is_empty() {
                continue;
            }

            output.push_str(&format!("CREATE TABLE IF NOT EXISTS {} (\n", qid(table)));
            let col_defs: Vec<String> = columns.iter().filter_map(|col| {
                let name = col.get("name").and_then(|v| v.as_str())?;
                let data_type = col.get("type").and_then(|v| v.as_str())?;
                let nullable = col.get("isNullable").and_then(|v| v.as_bool()).unwrap_or(true);
                let default = col.get("defaultValue");

                let mut def = format!("  {}", qid(name));
                def.push_str(&format!(" {}", map_type(db_type, data_type)));
                if !nullable {
                    def.push_str(" NOT NULL");
                }
                if let Some(d) = default {
                    if !d.is_null() {
                        if let Some(s) = d.as_str() {
                            if !s.is_empty() {
                                def.push_str(&format!(" DEFAULT {}", s));
                            }
                        }
                    }
                }
                Some(def)
            }).collect();
            output.push_str(&col_defs.join(",\n"));

            let pk_cols: Vec<&str> = columns.iter().filter_map(|c| {
                if c.get("isPrimaryKey").and_then(|v| v.as_bool()).unwrap_or(false) {
                    c.get("name").and_then(|v| v.as_str())
                } else { None }
            }).collect();
            if !pk_cols.is_empty() {
                output.push_str(&format!(",\n  PRIMARY KEY ({})", pk_cols.iter().map(|c| qid(c)).collect::<Vec<_>>().join(", ")));
            }

            output.push_str("\n);\n\n");

            let query = format!("SELECT * FROM {}", qid(table));
            match driver.execute(&query).await {
                Ok(result) => {
                    if !result.rows.is_empty() {
                        let qcols: Vec<String> = result.columns.iter().map(|c| qid(c)).collect();
                        for chunk in result.rows.chunks(500) {
                            let values: Vec<String> = chunk.iter().map(|row| {
                                let vals: Vec<String> = result.columns.iter().map(|col| {
                                    sql_value(row.get(col).unwrap_or(&serde_json::Value::Null))
                                }).collect();
                                format!("({})", vals.join(", "))
                            }).collect();
                            output.push_str(&format!("INSERT INTO {} ({}) VALUES\n{};\n\n", qid(table), qcols.join(", "), values.join(",\n")));
                        }
                    }
                }
                Err(e) => {
                    output.push_str(&format!("-- Error reading data for {}: {}\n\n", qid(table), e));
                }
            }

            let filename = format!("{}/backup_{}_{}_{}.sql", output_dir, db_name, table, timestamp);
            if let Err(e) = ensure_parent_dir(&filename) {
                tracing::error!("[scheduler] Failed to create dir for {}: {}", table, e);
                continue;
            }
            match fs::write(&filename, &output) {
                Ok(()) => written_files.push(filename),
                Err(e) => {
                    tracing::error!("[scheduler] Failed to write backup for {}: {}", table, e);
                }
            }
        }

        if written_files.is_empty() && total > 0 {
            return err("Failed to write any table backup files".into());
        }

        ok(output_dir.to_string())
    }

    async fn dump_mongodb(driver: Arc<dyn DbDriver>, output_dir: &str, db_name: &str, filter_collections: &[String], job: &ScheduledJob, app_handle: &AppHandle, cancel_token: Option<CancellationToken>) -> ExecutionResult {
        let collections = match driver.fetch_tables(None, None).await {
            Ok(t) => t,
            Err(e) => return err(format!("Failed to fetch collections: {}", e)),
        };

        let collections: Vec<&str> = if filter_collections.is_empty() {
            collections.iter().map(|s| s.as_str()).collect()
        } else {
            collections.iter().filter(|t| filter_collections.contains(t)).map(|s| s.as_str()).collect()
        };

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let total = collections.len();
        let mut written_files: Vec<String> = Vec::new();

        for (idx, collection) in collections.iter().enumerate() {
            if let Some(ref token) = cancel_token {
                if token.is_cancelled() {
                    break;
                }
            }
            emit_progress(app_handle, job, collection, idx + 1, total);

            let query = format!("{{\"collection\":\"{}\",\"find\":{{}},\"limit\":0}}", collection);
            match driver.execute(&query).await {
                Ok(result) => {
                    let json_array = serde_json::to_string_pretty(&result.rows).unwrap_or_else(|_| "[]".into());
                    let filename = format!("{}/backup_{}_{}_{}.json", output_dir, db_name, collection, timestamp);
                    if let Err(e) = ensure_parent_dir(&filename) {
                        tracing::error!("[scheduler] Failed to create dir for {}: {}", collection, e);
                        continue;
                    }
                    match fs::write(&filename, &json_array) {
                        Ok(()) => written_files.push(filename),
                        Err(e) => {
                            tracing::error!("[scheduler] Failed to write backup for {}: {}", collection, e);
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("[scheduler] Failed to dump collection {}: {}", collection, e);
                }
            }
        }

        if written_files.is_empty() && total > 0 {
            return err("Failed to write any collection backup files".into());
        }

        ok(output_dir.to_string())
    }

    async fn execute_report(job: &ScheduledJob, storage: &Storage, cancel_token: Option<CancellationToken>) -> ExecutionResult {
        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");
        let filter_tables: Vec<String> = job.config.get("tables").and_then(|v| v.as_array()).map(|a| {
            a.iter().filter_map(|v| v.as_str().map(String::from)).collect()
        }).unwrap_or_default();

        let output = match Self::build_driver(job, storage).await {
            Ok(v) => v,
            Err(e) => return e,
        };

        if let Err(e) = ensure_parent_dir(&format!("{}/placeholder", output_dir)) {
            return err(e);
        }

        if filter_tables.is_empty() {
            let query = match job.config.get("query").and_then(|v| v.as_str()) {
                Some(q) => q,
                None => return err("Report job requires a query or tables in config".into()),
            };

            if let Some(ref token) = cancel_token {
                if token.is_cancelled() {
                    return err("Job cancelled".into());
                }
            }

            match output.driver.execute(query).await {
                Ok(result) => {
                    let json = serde_json::to_string_pretty(&result.rows).unwrap_or_else(|_| "[]".into());
                    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
                    let filename = format!("{}/report_{}_{}.json", output_dir, job.name.replace(' ', "_"), timestamp);
                    if let Err(e) = ensure_parent_dir(&filename) {
                        return err(e);
                    }
                    match fs::write(&filename, &json) {
                        Ok(()) => ok(output_dir.to_string()),
                        Err(e) => err(format!("Failed to write report: {}", e)),
                    }
                }
                Err(e) => err(format!("Failed to execute query: {}", e)),
            }
        } else {
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            let total = filter_tables.len();
            let mut written_files: Vec<String> = Vec::new();

            for (_idx, table) in filter_tables.iter().enumerate() {
                if let Some(ref token) = cancel_token {
                    if token.is_cancelled() {
                        break;
                    }
                }

                let query = format!("SELECT * FROM {}", table);
                match output.driver.execute(&query).await {
                    Ok(result) => {
                        let json = serde_json::to_string_pretty(&result.rows).unwrap_or_else(|_| "[]".into());
                        let filename = format!("{}/report_{}_{}_{}.json", output_dir, job.name.replace(' ', "_"), table, timestamp);
                        if let Err(e) = ensure_parent_dir(&filename) {
                            tracing::error!("[scheduler] Failed to create dir for report {}: {}", table, e);
                            continue;
                        }
                        match fs::write(&filename, &json) {
                            Ok(()) => written_files.push(filename),
                            Err(e) => {
                                tracing::error!("[scheduler] Failed to write report for {}: {}", table, e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("[scheduler] Failed to execute query for {}: {}", table, e);
                    }
                }
            }

            if written_files.is_empty() && total > 0 {
                return err("Failed to write any report files".into());
            }

            ok(output_dir.to_string())
        }
    }

    async fn execute_csv_export(job: &ScheduledJob, storage: &Storage, cancel_token: Option<CancellationToken>) -> ExecutionResult {
        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");
        let filter_tables: Vec<String> = job.config.get("tables").and_then(|v| v.as_array()).map(|a| {
            a.iter().filter_map(|v| v.as_str().map(String::from)).collect()
        }).unwrap_or_default();

        let output = match Self::build_driver(job, storage).await {
            Ok(v) => v,
            Err(e) => return e,
        };

        if let Err(e) = ensure_parent_dir(&format!("{}/placeholder", output_dir)) {
            return err(e);
        }

        if filter_tables.is_empty() {
            let query = match job.config.get("query").and_then(|v| v.as_str()) {
                Some(q) => q,
                None => return err("CSV Export job requires a query or tables in config".into()),
            };

            if let Some(ref token) = cancel_token {
                if token.is_cancelled() {
                    return err("Job cancelled".into());
                }
            }

            match output.driver.execute(query).await {
                Ok(result) => {
                    let csv = Self::build_csv(&result);
                    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
                    let filename = format!("{}/export_{}_{}.csv", output_dir, job.name.replace(' ', "_"), timestamp);
                    if let Err(e) = ensure_parent_dir(&filename) {
                        return err(e);
                    }
                    match fs::write(&filename, &csv) {
                        Ok(()) => ok(output_dir.to_string()),
                        Err(e) => err(format!("Failed to write CSV: {}", e)),
                    }
                }
                Err(e) => err(format!("Failed to execute query: {}", e)),
            }
        } else {
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            let total = filter_tables.len();
            let mut written_files: Vec<String> = Vec::new();

            for (_idx, table) in filter_tables.iter().enumerate() {
                if let Some(ref token) = cancel_token {
                    if token.is_cancelled() {
                        break;
                    }
                }

                let query = format!("SELECT * FROM {}", table);
                match output.driver.execute(&query).await {
                    Ok(result) => {
                        let csv = Self::build_csv(&result);
                        let filename = format!("{}/export_{}_{}_{}.csv", output_dir, job.name.replace(' ', "_"), table, timestamp);
                        if let Err(e) = ensure_parent_dir(&filename) {
                            tracing::error!("[scheduler] Failed to create dir for csv {}: {}", table, e);
                            continue;
                        }
                        match fs::write(&filename, &csv) {
                            Ok(()) => written_files.push(filename),
                            Err(e) => {
                                tracing::error!("[scheduler] Failed to write csv for {}: {}", table, e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("[scheduler] Failed to execute query for {}: {}", table, e);
                    }
                }
            }

            if written_files.is_empty() && total > 0 {
                return err("Failed to write any CSV files".into());
            }

            ok(output_dir.to_string())
        }
    }

    fn build_csv(result: &crate::models::QueryResult) -> String {
        let mut csv = String::new();
        csv.push_str(&result.columns.join(","));
        csv.push('\n');
        for row in &result.rows {
            let vals: Vec<String> = result.columns.iter().map(|col| {
                match row.get(col).unwrap_or(&serde_json::Value::Null) {
                    serde_json::Value::Null => String::new(),
                    serde_json::Value::String(s) => format!("\"{}\"", s.replace('"', "\"\"")),
                    other => other.to_string(),
                }
            }).collect();
            csv.push_str(&vals.join(","));
            csv.push('\n');
        }
        csv
    }
}
