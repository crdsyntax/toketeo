use crate::db::{DbDriver, DbType};
use crate::infrastructure::database::connection_string_builder::ConnectionStringBuilder;
use crate::infrastructure::drivers::driver_factory::DriverFactory;
use crate::models::{JobType, ScheduledJob};
use crate::storage::Storage;
use chrono::Utc;
use std::sync::Arc;
use std::fs;

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

fn err(msg: String) -> ExecutionResult {
    ExecutionResult { success: false, output_path: None, error: Some(msg), rows_affected: None }
}

fn ok(path: String) -> ExecutionResult {
    ExecutionResult { success: true, output_path: Some(path), error: None, rows_affected: None }
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

pub struct JobExecutor;

impl JobExecutor {
    pub async fn execute(job: &ScheduledJob, storage: &Storage) -> ExecutionResult {
        match job.job_type {
            JobType::Backup => Self::execute_backup(job, storage).await,
            JobType::Report => Self::execute_report(job).await,
            JobType::CsvExport => Self::execute_csv_export(job).await,
        }
    }

    async fn build_driver(job: &ScheduledJob, storage: &Storage) -> Result<(Arc<dyn DbDriver>, DbType, String), ExecutionResult> {
        let conn_id = job.connection_id.to_string();
        let mut conn_config = storage.get_connection(&conn_id).await.map_err(|e| err(format!("Failed to get connection: {}", e)))?;

        // Use database from job config (user selection) if present, fallback to connection default
        if let Some(db) = job.config.get("database").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            conn_config.database = Some(db.to_string());
        }
        let db_name = conn_config.database.clone().unwrap_or_default();

        let url = ConnectionStringBuilder::build(&conn_config).map_err(|e| err(format!("Failed to build connection string: {}", e)))?;
        let db_type = conn_config.db_type.clone();

        let driver = DriverFactory::create(db_type.clone(), &url, false, None).await
            .map_err(|e| err(format!("Failed to connect for backup: {}", e)))?;

        Ok((driver, db_type, db_name))
    }

    async fn execute_backup(job: &ScheduledJob, storage: &Storage) -> ExecutionResult {
        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");
        let filter_tables: Vec<String> = job.config.get("tables").and_then(|v| v.as_array()).map(|a| {
            a.iter().filter_map(|v| v.as_str().map(String::from)).collect()
        }).unwrap_or_default();

        let (driver, db_type, db_name) = match Self::build_driver(job, storage).await {
            Ok(v) => v,
            Err(e) => return e,
        };

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let extension = if db_type == DbType::Mongodb { "json" } else { "sql" };
        let filename = format!("{}/backup_{}_{}.{}", output_dir, db_name, timestamp, extension);

        if let Err(e) = ensure_parent_dir(&filename) {
            return err(e);
        }

        match db_type {
            DbType::Mongodb => Self::dump_mongodb(driver, &filename, &db_name, &filter_tables).await,
            _ => Self::dump_sql(driver, &db_type, &filename, &db_name, &filter_tables).await,
        }
    }

    async fn dump_sql(driver: Arc<dyn DbDriver>, db_type: &DbType, filename: &str, _db_name: &str, filter_tables: &[String]) -> ExecutionResult {
        let tables = match driver.fetch_tables(None, None).await {
            Ok(t) => t,
            Err(e) => return err(format!("Failed to fetch tables: {}", e)),
        };

        let tables: Vec<&str> = if filter_tables.is_empty() {
            tables.iter().map(|s| s.as_str()).collect()
        } else {
            tables.iter().filter(|t| filter_tables.contains(t)).map(|s| s.as_str()).collect()
        };

        let mut output = String::new();
        output.push_str(&format!("-- Toketeo native backup\n-- Engine: {:?}\n-- Date: {}\n\n", db_type, Utc::now()));

        for table in &tables {
            // Schema
            let columns = match driver.fetch_columns(table, None).await {
                Ok(c) => c,
                Err(e) => {
                    output.push_str(&format!("-- Skipping table {}: {}\n\n", table, e));
                    continue;
                }
            };

            let col_names: Vec<&str> = columns.iter().filter_map(|c| c.get("name").and_then(|v| v.as_str())).collect();
            if col_names.is_empty() {
                continue;
            }

            let qid = |id: &str| quote_id(db_type, id);

            output.push_str(&format!("CREATE TABLE IF NOT EXISTS {} (\n", qid(table)));
            let col_defs: Vec<String> = columns.iter().filter_map(|col| {
                let name = col.get("name").and_then(|v| v.as_str())?;
                let data_type = col.get("type").and_then(|v| v.as_str())?;
                let is_pk = col.get("isPrimaryKey").and_then(|v| v.as_bool()).unwrap_or(false);
                let nullable = col.get("isNullable").and_then(|v| v.as_bool()).unwrap_or(true);
                let default = col.get("defaultValue");

                let mut def = format!("  {}", qid(name));
                def.push_str(&format!(" {}", map_type(db_type, data_type)));
                if is_pk {
                    // PK noted separately to keep it simple
                }
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

            // Primary key
            let pk_cols: Vec<&str> = columns.iter().filter_map(|c| {
                if c.get("isPrimaryKey").and_then(|v| v.as_bool()).unwrap_or(false) {
                    c.get("name").and_then(|v| v.as_str())
                } else { None }
            }).collect();
            if !pk_cols.is_empty() {
                output.push_str(&format!(",\n  PRIMARY KEY ({})", pk_cols.iter().map(|c| qid(c)).collect::<Vec<_>>().join(", ")));
            }

            output.push_str("\n);\n\n");

            // Data
            let query = format!("SELECT * FROM {}", qid(table));
            match driver.execute(&query).await {
                Ok(result) => {
                    if result.rows.is_empty() {
                        continue;
                    }
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
                Err(e) => {
                    output.push_str(&format!("-- Error reading data for {}: {}\n\n", qid(table), e));
                }
            }
        }

        match fs::write(filename, &output) {
            Ok(()) => ok(filename.to_string()),
            Err(e) => err(format!("Failed to write backup: {}", e)),
        }
    }

    async fn dump_mongodb(driver: Arc<dyn DbDriver>, filename: &str, db_name: &str, filter_collections: &[String]) -> ExecutionResult {
        let collections = match driver.fetch_tables(None, None).await {
            Ok(t) => t,
            Err(e) => return err(format!("Failed to fetch collections: {}", e)),
        };

        let collections: Vec<&str> = if filter_collections.is_empty() {
            collections.iter().map(|s| s.as_str()).collect()
        } else {
            collections.iter().filter(|t| filter_collections.contains(t)).map(|s| s.as_str()).collect()
        };

        let mut output = serde_json::Map::new();
        output.insert("database".into(), serde_json::Value::String(db_name.to_string()));
        output.insert("exportedAt".into(), serde_json::Value::String(Utc::now().to_rfc3339()));

        let mut colls = serde_json::Map::new();
        for collection in &collections {
            let query = format!("{{\"collection\":\"{}\",\"find\":{{}},\"limit\":0}}", collection);
            match driver.execute(&query).await {
                Ok(result) => {
                    colls.insert(collection.to_string(), serde_json::Value::Array(result.rows));
                }
                Err(e) => {
                    colls.insert(collection.to_string(), serde_json::Value::String(format!("__error__: {}", e)));
                }
            }
        }
        output.insert("collections".into(), serde_json::Value::Object(colls));

        let json = serde_json::to_string_pretty(&output).unwrap_or_default();
        match fs::write(filename, &json) {
            Ok(()) => ok(filename.to_string()),
            Err(e) => err(format!("Failed to write backup: {}", e)),
        }
    }

    async fn execute_report(job: &ScheduledJob) -> ExecutionResult {
        let query = match job.config.get("query").and_then(|v| v.as_str()) {
            Some(q) => q,
            None => return err("Report job requires a query in config".into()),
        };

        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");
        let format = job.config.get("format").and_then(|v| v.as_str()).unwrap_or("json");

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("{}/report_{}_{}.{}", output_dir, job.name.replace(' ', "_"), timestamp, format);

        if let Err(e) = ensure_parent_dir(&filename) {
            return err(e);
        }

        match fs::write(&filename, query) {
            Ok(()) => ok(filename),
            Err(e) => err(format!("Failed to write report: {}", e)),
        }
    }

    async fn execute_csv_export(job: &ScheduledJob) -> ExecutionResult {
        let query = match job.config.get("query").and_then(|v| v.as_str()) {
            Some(q) => q,
            None => return err("CSV Export job requires a query in config".into()),
        };

        let output_dir = job.config.get("outputDir").and_then(|v| v.as_str()).unwrap_or("/tmp");

        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("{}/export_{}_{}.csv", output_dir, job.name.replace(' ', "_"), timestamp);

        if let Err(e) = ensure_parent_dir(&filename) {
            return err(e);
        }

        match fs::write(&filename, query) {
            Ok(()) => ok(filename),
            Err(e) => err(format!("Failed to write CSV: {}", e)),
        }
    }
}
