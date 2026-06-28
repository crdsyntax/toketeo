use crate::db::DbType;
use crate::error::AppResult;
use crate::models::sync::{SyncBatch, SyncCheckpoint, SyncPipeline, SyncRun, SyncRowError, SyncMode, PipelineStatus, SyncTableConfig};
use crate::models::{DbConnectionConfig, SshConfig, ScheduledJob, JobType, JobExecutionLog};
use chrono::{DateTime, Utc};
use secrecy::ExposeSecret;
use sqlx::{Row, sqlite::SqlitePool};
use std::path::PathBuf;
use uuid::Uuid;
use zeroize::Zeroize;

use crate::application::audit_service::AuditEntry;

pub struct Storage {
    pool: SqlitePool,
}

impl Storage {
    pub async fn new(db_path: PathBuf) -> AppResult<Self> {
        let url = format!("sqlite:{}", db_path.to_string_lossy());
        let pool = SqlitePool::connect(&url).await?;

        // WAL mode for concurrent reads + busy timeout to retry on contention
        sqlx::query("PRAGMA journal_mode=WAL").execute(&pool).await?;
        sqlx::query("PRAGMA busy_timeout=5000").execute(&pool).await?;

        // Create tables if not exists
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                user TEXT NOT NULL,
                password TEXT,
                database TEXT,
                ssh TEXT
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                connection_id TEXT NOT NULL,
                query TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                execution_time_ms INTEGER NOT NULL,
                status TEXT NOT NULL,
                error TEXT
            )",
        )
        .execute(&pool)
        .await?;

        // Migration: Add environment column if it doesn't exist
        let _ = sqlx::query(
            "ALTER TABLE connections ADD COLUMN environment TEXT NOT NULL DEFAULT 'local'",
        )
        .execute(&pool)
        .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN auth_source TEXT")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN replica_set TEXT")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN ssl TEXT")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN direct_connection INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN read_only INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN max_pool_size INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN idle_timeout INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN acquire_timeout INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN max_lifetime INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN keep_alive INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN metadata_cache_ttl INTEGER")
            .execute(&pool)
            .await;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN auth_enabled INTEGER")
            .execute(&pool)
            .await;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS scheduled_jobs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                connection_id TEXT NOT NULL,
                job_type TEXT NOT NULL,
                cron_expression TEXT NOT NULL,
                config TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_run TEXT,
                next_run TEXT,
                created_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS job_execution_logs (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT NOT NULL,
                status TEXT NOT NULL,
                output_path TEXT,
                error TEXT,
                rows_affected INTEGER
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_pipelines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_connection_id TEXT NOT NULL,
                target_connection_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                batch_size INTEGER NOT NULL DEFAULT 1000,
                config TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_runs (
                id TEXT PRIMARY KEY,
                pipeline_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                total_rows INTEGER NOT NULL DEFAULT 0,
                processed_rows INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0,
                batch_count INTEGER NOT NULL DEFAULT 0
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_checkpoints (
                id TEXT PRIMARY KEY,
                pipeline_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                last_processed_key TEXT,
                batch_number INTEGER NOT NULL DEFAULT 0
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_batches (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                batch_number INTEGER NOT NULL,
                table_name TEXT NOT NULL,
                rows_extracted INTEGER NOT NULL DEFAULT 0,
                rows_loaded INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                error_message TEXT
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_row_errors (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL,
                row_key TEXT,
                column_name TEXT,
                error_message TEXT NOT NULL,
                raw_value TEXT
            )",
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    pub async fn save_audit_log(&self, entry: AuditEntry) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO audit_logs (connection_id, query, timestamp, execution_time_ms, status, error)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&entry.connection_id)
        .bind(&entry.query)
        .bind(entry.timestamp.to_rfc3339())
        .bind(entry.execution_time_ms as i64)
        .bind(&entry.status)
        .bind(&entry.error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn prune_audit_logs(&self, max_entries: u32) -> AppResult<u32> {
        let result = sqlx::query("DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT ?)")
            .bind(max_entries as i64)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() as u32)
    }

    pub async fn get_audit_logs(&self, limit: u32, offset: u32) -> AppResult<Vec<AuditEntry>> {
        let rows = sqlx::query("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?")
            .bind(limit as i64)
            .bind(offset as i64)
            .fetch_all(&self.pool)
            .await?;

        let mut logs = Vec::new();
        for row in rows {
            let timestamp_str: String = row.get("timestamp");
            let timestamp = chrono::DateTime::parse_from_rfc3339(&timestamp_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            logs.push(AuditEntry {
                id: Some(row.get("id")),
                connection_id: row.get("connection_id"),
                query: row.get("query"),
                timestamp,
                execution_time_ms: row.get::<i64, _>("execution_time_ms") as u64,
                status: row.get("status"),
                error: row.get("error"),
            });
        }
        Ok(logs)
    }

    pub async fn get_connection(&self, id: &str) -> AppResult<DbConnectionConfig> {
        let row = sqlx::query("SELECT * FROM connections WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;

        let id_str: String = row.get("id");
        let db_type_str: String = row.get("type");
        let ssh_json: Option<String> = row.get("ssh");

        let db_type: DbType = serde_json::from_value(serde_json::Value::String(db_type_str.clone()))
            .unwrap_or_else(|e| {
                tracing::warn!("Failed to parse db_type '{}': {}. Falling back to Mysql", db_type_str, e);
                DbType::Mysql
            });
        let ssh_tunnel: Option<SshConfig> = ssh_json.and_then(|s| serde_json::from_str(&s).ok());

        Ok(DbConnectionConfig {
            id: Some(Uuid::parse_str(&id_str).unwrap_or_default()),
            name: row.get("name"),
            environment: row.get("environment"),
            db_type,
            host: row.get("host"),
            port: row.get::<i64, _>("port") as u16,
            user: row.get("user"),
            password: row
                .get::<Option<String>, _>("password")
                .map(|mut s| {
                    let secret = secrecy::SecretString::from(s.as_str());
                    s.zeroize();
                    secret
                }),
            database: row.get("database"),
            auth_enabled: row.try_get::<Option<i64>, _>("auth_enabled").unwrap_or(None).map(|v| v != 0),
            auth_source: row.get("auth_source"),
            replica_set: row.get("replica_set"),
            direct_connection: row
                .get::<Option<i64>, _>("direct_connection")
                .map(|v| v != 0),
            ssl: row.get("ssl"),
            ssh_tunnel,
            read_only: row.try_get::<Option<i64>, _>("read_only").unwrap_or(None).map(|v| v != 0),
            max_pool_size: row.try_get::<Option<i64>, _>("max_pool_size").unwrap_or(None).map(|v| v as i32),
            idle_timeout: row.try_get::<Option<i64>, _>("idle_timeout").unwrap_or(None).map(|v| v as i32),
            acquire_timeout: row.try_get::<Option<i64>, _>("acquire_timeout").unwrap_or(None).map(|v| v as i32),
            max_lifetime: row.try_get::<Option<i64>, _>("max_lifetime").unwrap_or(None).map(|v| v as i32),
            keep_alive: row.try_get::<Option<i64>, _>("keep_alive").unwrap_or(None).map(|v| v as i32),
            metadata_cache_ttl: row.try_get::<Option<i64>, _>("metadata_cache_ttl").unwrap_or(None).map(|v| v as i32),
        })
    }

    pub async fn save_connection(&self, config: DbConnectionConfig) -> AppResult<String> {
        let id = config.id.unwrap_or_else(Uuid::new_v4).to_string();
        let ssh_json = config
            .ssh_tunnel
            .as_ref()
            .map(|s| serde_json::to_string(&s).unwrap_or_else(|e| {
                tracing::error!("Failed to serialize ssh config: {}", e);
                "{}".into()
            }));
        let db_type = serde_json::to_value(&config.db_type)
            .unwrap_or_else(|e| {
                tracing::error!("Failed to serialize db_type: {}", e);
                serde_json::Value::String("mysql".into())
            })
            .as_str()
            .unwrap_or("mysql")
            .to_string();

        let password = config
            .password
            .as_ref()
            .map(|p| p.expose_secret().to_string());

        sqlx::query(
            "INSERT INTO connections (id, name, environment, type, host, port, user, password, database, auth_enabled, auth_source, replica_set, direct_connection, ssl, ssh, read_only, max_pool_size, idle_timeout, acquire_timeout, max_lifetime, keep_alive, metadata_cache_ttl)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                environment = excluded.environment,
                type = excluded.type,
                host = excluded.host,
                port = excluded.port,
                user = excluded.user,
                password = CASE 
                    WHEN excluded.password IS NOT NULL AND excluded.password != '' THEN excluded.password 
                    ELSE connections.password 
                END,
                database = excluded.database,
                auth_enabled = excluded.auth_enabled,
                auth_source = excluded.auth_source,
                replica_set = excluded.replica_set,
                direct_connection = excluded.direct_connection,
                ssl = excluded.ssl,
                read_only = excluded.read_only,
                max_pool_size = excluded.max_pool_size,
                idle_timeout = excluded.idle_timeout,
                acquire_timeout = excluded.acquire_timeout,
                max_lifetime = excluded.max_lifetime,
                keep_alive = excluded.keep_alive,
                metadata_cache_ttl = excluded.metadata_cache_ttl,
                ssh = CASE 
                    WHEN excluded.ssh IS NOT NULL THEN excluded.ssh 
                    ELSE connections.ssh 
                END"
        )
        .bind(&id)
        .bind(&config.name)
        .bind(&config.environment)
        .bind(&db_type)
        .bind(&config.host)
        .bind(config.port as i64)
        .bind(&config.user)
        .bind(password)
        .bind(config.database)
        .bind(config.auth_enabled.map(|v| if v { 1 } else { 0 }))
        .bind(config.auth_source)
        .bind(config.replica_set)
        .bind(config.direct_connection.map(|v| if v { 1 } else { 0 }))
        .bind(config.ssl)
        .bind(ssh_json)
        .bind(config.read_only.map(|v| if v { 1 } else { 0 }))
        .execute(&self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_all_connections(&self) -> AppResult<Vec<DbConnectionConfig>> {
        let rows = sqlx::query("SELECT * FROM connections")
            .fetch_all(&self.pool)
            .await?;

        let mut connections = Vec::new();
        for row in rows {
            let id: String = row.get("id");
            let db_type_str: String = row.get("type");
            let ssh_json: Option<String> = row.get("ssh");

            let db_type: DbType = serde_json::from_value(serde_json::Value::String(db_type_str))
                .unwrap_or(DbType::Mysql);
            let ssh_tunnel: Option<SshConfig> =
                ssh_json.and_then(|s| serde_json::from_str(&s).ok());

            connections.push(DbConnectionConfig {
                id: Some(Uuid::parse_str(&id).unwrap_or_default()),
                name: row.get("name"),
                environment: row.get("environment"),
                db_type,
                host: row.get("host"),
                port: row.get::<i64, _>("port") as u16,
                user: row.get("user"),
                password: row
                    .get::<Option<String>, _>("password")
                    .map(|mut s| {
                        let secret = secrecy::SecretString::from(s.as_str());
                        s.zeroize();
                        secret
                    }),
                database: row.get("database"),
                auth_enabled: row.try_get::<Option<i64>, _>("auth_enabled").unwrap_or(None).map(|v| v != 0),
                auth_source: row.get("auth_source"),
                replica_set: row.get("replica_set"),
                direct_connection: row
                    .get::<Option<i64>, _>("direct_connection")
                    .map(|v| v != 0),
                ssl: row.get("ssl"),
                ssh_tunnel,
                read_only: row.try_get::<Option<i64>, _>("read_only").unwrap_or(None).map(|v| v != 0),
                max_pool_size: row.try_get::<Option<i64>, _>("max_pool_size").unwrap_or(None).map(|v| v as i32),
                idle_timeout: row.try_get::<Option<i64>, _>("idle_timeout").unwrap_or(None).map(|v| v as i32),
                acquire_timeout: row.try_get::<Option<i64>, _>("acquire_timeout").unwrap_or(None).map(|v| v as i32),
                max_lifetime: row.try_get::<Option<i64>, _>("max_lifetime").unwrap_or(None).map(|v| v as i32),
                keep_alive: row.try_get::<Option<i64>, _>("keep_alive").unwrap_or(None).map(|v| v as i32),
                metadata_cache_ttl: row.try_get::<Option<i64>, _>("metadata_cache_ttl").unwrap_or(None).map(|v| v as i32),
            });
        }
        Ok(connections)
    }

    pub async fn delete_connection(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM connections WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn save_scheduled_job(&self, job: &ScheduledJob) -> AppResult<()> {
        let id = job.id.to_string();
        let connection_id = job.connection_id.to_string();
        let job_type = serde_json::to_value(&job.job_type)
            .unwrap_or_else(|e| {
                tracing::error!("Failed to serialize job_type: {}", e);
                serde_json::Value::String("backup".into())
            })
            .as_str()
            .unwrap_or("backup")
            .to_string();
        let config = serde_json::to_string(&job.config).unwrap_or_else(|e| {
            tracing::error!("Failed to serialize job config: {}", e);
            "{}".into()
        });
        let last_run = job.last_run.map(|d| d.to_rfc3339());
        let next_run = job.next_run.map(|d| d.to_rfc3339());
        let created_at = job.created_at.to_rfc3339();

        sqlx::query(
            "INSERT INTO scheduled_jobs (id, name, connection_id, job_type, cron_expression, config, enabled, last_run, next_run, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                connection_id = excluded.connection_id,
                job_type = excluded.job_type,
                cron_expression = excluded.cron_expression,
                config = excluded.config,
                enabled = excluded.enabled,
                last_run = excluded.last_run,
                next_run = excluded.next_run"
        )
        .bind(&id)
        .bind(&job.name)
        .bind(&connection_id)
        .bind(&job_type)
        .bind(&job.cron_expression)
        .bind(&config)
        .bind(job.enabled as i64)
        .bind(last_run)
        .bind(next_run)
        .bind(&created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_scheduled_job(&self, id: &str) -> AppResult<ScheduledJob> {
        let row = sqlx::query("SELECT * FROM scheduled_jobs WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;

        Self::row_to_scheduled_job(row)
    }

    pub async fn get_all_scheduled_jobs(&self) -> AppResult<Vec<ScheduledJob>> {
        let rows = sqlx::query("SELECT * FROM scheduled_jobs ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;

        let mut jobs = Vec::new();
        for row in rows {
            if let Ok(job) = Self::row_to_scheduled_job(row) {
                jobs.push(job);
            }
        }
        Ok(jobs)
    }

    pub async fn get_enabled_scheduled_jobs(&self) -> AppResult<Vec<ScheduledJob>> {
        let rows = sqlx::query("SELECT * FROM scheduled_jobs WHERE enabled = 1")
            .fetch_all(&self.pool)
            .await?;

        let mut jobs = Vec::new();
        for row in rows {
            if let Ok(job) = Self::row_to_scheduled_job(row) {
                jobs.push(job);
            }
        }
        Ok(jobs)
    }

    pub async fn delete_scheduled_job(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM scheduled_jobs WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    fn row_to_scheduled_job(row: sqlx::sqlite::SqliteRow) -> AppResult<ScheduledJob> {
        let id_str: String = row.get("id");
        let job_type_str: String = row.get("job_type");
        let config_str: String = row.get("config");
        let last_run_str: Option<String> = row.get("last_run");
        let next_run_str: Option<String> = row.get("next_run");
        let created_at_str: String = row.get("created_at");

        let job_type: JobType = serde_json::from_value(serde_json::Value::String(job_type_str))
            .unwrap_or(JobType::Backup);

        Ok(ScheduledJob {
            id: Uuid::parse_str(&id_str).unwrap_or_default(),
            name: row.get("name"),
            connection_id: {
                let cid: String = row.get("connection_id");
                Uuid::parse_str(&cid).unwrap_or_default()
            },
            job_type,
            cron_expression: row.get("cron_expression"),
            config: serde_json::from_str(&config_str).unwrap_or_default(),
            enabled: row.get::<i64, _>("enabled") != 0,
            last_run: last_run_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|d| d.with_timezone(&Utc))),
            next_run: next_run_str.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|d| d.with_timezone(&Utc))),
            created_at: DateTime::parse_from_rfc3339(&created_at_str)
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        })
    }

    pub async fn save_job_execution_log(&self, log: &JobExecutionLog) -> AppResult<()> {
        let id = log.id.to_string();
        let job_id = log.job_id.to_string();

        sqlx::query(
            "INSERT INTO job_execution_logs (id, job_id, started_at, finished_at, status, output_path, error, rows_affected)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&job_id)
        .bind(log.started_at.to_rfc3339())
        .bind(log.finished_at.to_rfc3339())
        .bind(&log.status)
        .bind(&log.output_path)
        .bind(&log.error)
        .bind(log.rows_affected)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_job_execution_logs(&self, job_id: &str) -> AppResult<Vec<JobExecutionLog>> {
        let rows = sqlx::query(
            "SELECT * FROM job_execution_logs WHERE job_id = ? ORDER BY started_at DESC LIMIT 50"
        )
        .bind(job_id)
        .fetch_all(&self.pool)
        .await?;

        let mut logs = Vec::new();
        for row in rows {
            let id_str: String = row.get("id");
            let jid_str: String = row.get("job_id");

            logs.push(JobExecutionLog {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                job_id: Uuid::parse_str(&jid_str).unwrap_or_default(),
                started_at: {
                    let s: String = row.get("started_at");
                    DateTime::parse_from_rfc3339(&s)
                        .map(|d| d.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now())
                },
                finished_at: {
                    let s: String = row.get("finished_at");
                    DateTime::parse_from_rfc3339(&s)
                        .map(|d| d.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now())
                },
                status: row.get("status"),
                output_path: row.get("output_path"),
                error: row.get("error"),
                rows_affected: row.get("rows_affected"),
            });
        }
        Ok(logs)
    }

    // ── Sync Pipelines ──

    pub async fn save_sync_pipeline(&self, pipeline: &SyncPipeline) -> AppResult<SyncPipeline> {
        let config = serde_json::to_string(&pipeline.tables).unwrap_or_default();
        let now = chrono::Utc::now().to_rfc3339();
        let pipeline_id = pipeline.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let created_at = pipeline.created_at.clone().unwrap_or_else(|| now.clone());
        let updated_at = pipeline.updated_at.clone().unwrap_or(now);

        sqlx::query(
            "INSERT INTO sync_pipelines (id, name, source_connection_id, target_connection_id, mode, status, batch_size, config, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                source_connection_id = excluded.source_connection_id,
                target_connection_id = excluded.target_connection_id,
                mode = excluded.mode,
                status = excluded.status,
                batch_size = excluded.batch_size,
                config = excluded.config,
                updated_at = excluded.updated_at"
        )
        .bind(&pipeline_id)
        .bind(&pipeline.name)
        .bind(&pipeline.source_connection_id)
        .bind(&pipeline.target_connection_id)
        .bind(serde_json::to_value(&pipeline.mode)
            .unwrap_or_else(|e| { tracing::error!("Failed to serialize pipeline mode: {}", e); serde_json::Value::String("full".into()) })
            .as_str().unwrap_or("full").to_string())
        .bind(serde_json::to_value(&pipeline.status)
            .unwrap_or_else(|e| { tracing::error!("Failed to serialize pipeline status: {}", e); serde_json::Value::String("draft".into()) })
            .as_str().unwrap_or("draft").to_string())
        .bind(pipeline.batch_size as i64)
        .bind(&config)
        .bind(&created_at)
        .bind(&updated_at)
        .execute(&self.pool)
        .await?;

        Ok(SyncPipeline {
            id: Some(pipeline_id),
            name: pipeline.name.clone(),
            source_connection_id: pipeline.source_connection_id.clone(),
            target_connection_id: pipeline.target_connection_id.clone(),
            mode: pipeline.mode.clone(),
            status: pipeline.status.clone(),
            tables: pipeline.tables.clone(),
            batch_size: pipeline.batch_size,
            created_at: Some(created_at),
            updated_at: Some(updated_at),
        })
    }

    pub async fn get_sync_pipeline(&self, id: &str) -> AppResult<SyncPipeline> {
        let row = sqlx::query("SELECT * FROM sync_pipelines WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;

        row_to_sync_pipeline(row)
    }

    pub async fn list_sync_pipelines(&self) -> AppResult<Vec<SyncPipeline>> {
        let rows = sqlx::query("SELECT * FROM sync_pipelines ORDER BY updated_at DESC")
            .fetch_all(&self.pool)
            .await?;

        let mut pipelines = Vec::new();
        for row in rows {
            if let Ok(p) = row_to_sync_pipeline(row) {
                pipelines.push(p);
            }
        }
        Ok(pipelines)
    }

    pub async fn delete_sync_pipeline(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM sync_pipelines WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Sync Runs ──

    pub async fn save_sync_run(&self, run: &SyncRun) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO sync_runs (id, pipeline_id, status, started_at, completed_at, total_rows, processed_rows, error_count, batch_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                completed_at = excluded.completed_at,
                processed_rows = excluded.processed_rows,
                error_count = excluded.error_count,
                batch_count = excluded.batch_count"
        )
        .bind(&run.id)
        .bind(&run.pipeline_id)
        .bind(serde_json::to_value(&run.status)
            .unwrap_or_else(|e| { tracing::error!("Failed to serialize run status: {}", e); serde_json::Value::String("running".into()) })
            .as_str().unwrap_or("running").to_string())
        .bind(&run.started_at)
        .bind(&run.completed_at)
        .bind(run.total_rows as i64)
        .bind(run.processed_rows as i64)
        .bind(run.error_count as i64)
        .bind(run.batch_count as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_sync_run(&self, id: &str) -> AppResult<SyncRun> {
        let row = sqlx::query("SELECT * FROM sync_runs WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;

        row_to_sync_run(row)
    }

    pub async fn list_sync_runs(&self, pipeline_id: &str) -> AppResult<Vec<SyncRun>> {
        let rows = sqlx::query("SELECT * FROM sync_runs WHERE pipeline_id = ? ORDER BY started_at DESC")
            .bind(pipeline_id)
            .fetch_all(&self.pool)
            .await?;

        let mut runs = Vec::new();
        for row in rows {
            if let Ok(r) = row_to_sync_run(row) {
                runs.push(r);
            }
        }
        Ok(runs)
    }

    // ── Sync Checkpoints ──

    pub async fn save_sync_checkpoint(&self, cp: &SyncCheckpoint) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO sync_checkpoints (id, pipeline_id, run_id, table_name, last_processed_key, batch_number)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                last_processed_key = excluded.last_processed_key,
                batch_number = excluded.batch_number"
        )
        .bind(&cp.id)
        .bind(&cp.pipeline_id)
        .bind(&cp.run_id)
        .bind(&cp.table_name)
        .bind(&cp.last_processed_key)
        .bind(cp.batch_number as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_sync_checkpoint(&self, pipeline_id: &str, table_name: &str) -> AppResult<Option<SyncCheckpoint>> {
        let result = sqlx::query(
            "SELECT * FROM sync_checkpoints WHERE pipeline_id = ? AND table_name = ?"
        )
        .bind(pipeline_id)
        .bind(table_name)
        .fetch_optional(&self.pool)
        .await?;

        match result {
            Some(row) => Ok(Some(row_to_sync_checkpoint(row)?)),
            None => Ok(None),
        }
    }

    pub async fn delete_sync_checkpoints(&self, pipeline_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM sync_checkpoints WHERE pipeline_id = ?")
            .bind(pipeline_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_latest_checkpoint(&self, pipeline_id: &str) -> AppResult<Option<SyncCheckpoint>> {
        let result = sqlx::query(
            "SELECT * FROM sync_checkpoints WHERE pipeline_id = ? ORDER BY batch_number DESC LIMIT 1"
        )
        .bind(pipeline_id)
        .fetch_optional(&self.pool)
        .await?;

        match result {
            Some(row) => Ok(Some(row_to_sync_checkpoint(row)?)),
            None => Ok(None),
        }
    }

    // ── Sync Batches ──

    pub async fn save_sync_batch(&self, batch: &SyncBatch) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO sync_batches (id, run_id, batch_number, table_name, rows_extracted, rows_loaded, duration_ms, status, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                rows_extracted = excluded.rows_extracted,
                rows_loaded = excluded.rows_loaded,
                duration_ms = excluded.duration_ms,
                status = excluded.status,
                error_message = excluded.error_message"
        )
        .bind(&batch.id)
        .bind(&batch.run_id)
        .bind(batch.batch_number as i64)
        .bind(&batch.table_name)
        .bind(batch.rows_extracted as i64)
        .bind(batch.rows_loaded as i64)
        .bind(batch.duration_ms as i64)
        .bind(&batch.status)
        .bind(&batch.error_message)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_sync_batches(&self, run_id: &str) -> AppResult<Vec<SyncBatch>> {
        let rows = sqlx::query(
            "SELECT * FROM sync_batches WHERE run_id = ? ORDER BY batch_number ASC"
        )
        .bind(run_id)
        .fetch_all(&self.pool)
        .await?;

        let mut batches = Vec::new();
        for row in rows {
            if let Ok(b) = row_to_sync_batch(row) {
                batches.push(b);
            }
        }
        Ok(batches)
    }

    // ── Sync Row Errors ──

    pub async fn save_sync_row_error(&self, err: &SyncRowError) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO sync_row_errors (id, batch_id, row_key, column_name, error_message, raw_value)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&err.id)
        .bind(&err.batch_id)
        .bind(&err.row_key)
        .bind(&err.column_name)
        .bind(&err.error_message)
        .bind(&err.raw_value)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_sync_row_errors(&self, batch_id: &str) -> AppResult<Vec<SyncRowError>> {
        let rows = sqlx::query(
            "SELECT * FROM sync_row_errors WHERE batch_id = ? ORDER BY row_key ASC"
        )
        .bind(batch_id)
        .fetch_all(&self.pool)
        .await?;

        let mut errors = Vec::new();
        for row in rows {
            if let Ok(e) = row_to_sync_row_error(row) {
                errors.push(e);
            }
        }
        Ok(errors)
    }
}

fn row_to_sync_pipeline(row: sqlx::sqlite::SqliteRow) -> AppResult<SyncPipeline> {
    let config_str: String = row.get("config");
    let mode_str: String = row.get("mode");
    let status_str: String = row.get("status");

    let mode: SyncMode = serde_json::from_value(serde_json::Value::String(mode_str))
        .unwrap_or(SyncMode::Full);
    let status: PipelineStatus = serde_json::from_value(serde_json::Value::String(status_str))
        .unwrap_or(PipelineStatus::Draft);
    let tables: Vec<SyncTableConfig> = serde_json::from_str(&config_str).unwrap_or_default();

    Ok(SyncPipeline {
        id: Some(row.get("id")),
        name: row.get("name"),
        source_connection_id: row.get("source_connection_id"),
        target_connection_id: row.get("target_connection_id"),
        mode,
        status,
        tables,
        batch_size: row.get::<i64, _>("batch_size") as usize,
        created_at: Some(row.get("created_at")),
        updated_at: Some(row.get("updated_at")),
    })
}

fn row_to_sync_run(row: sqlx::sqlite::SqliteRow) -> AppResult<SyncRun> {
    let status_str: String = row.get("status");
    let status: PipelineStatus = serde_json::from_value(serde_json::Value::String(status_str))
        .unwrap_or(PipelineStatus::Running);

    Ok(SyncRun {
        id: row.get("id"),
        pipeline_id: row.get("pipeline_id"),
        status,
        started_at: row.get("started_at"),
        completed_at: row.get("completed_at"),
        total_rows: row.get::<i64, _>("total_rows") as u64,
        processed_rows: row.get::<i64, _>("processed_rows") as u64,
        error_count: row.get::<i64, _>("error_count") as u64,
        batch_count: row.get::<i64, _>("batch_count") as u64,
    })
}

fn row_to_sync_batch(row: sqlx::sqlite::SqliteRow) -> AppResult<SyncBatch> {
    Ok(SyncBatch {
        id: row.get("id"),
        run_id: row.get("run_id"),
        batch_number: row.get::<i64, _>("batch_number") as u64,
        table_name: row.get("table_name"),
        rows_extracted: row.get::<i64, _>("rows_extracted") as u64,
        rows_loaded: row.get::<i64, _>("rows_loaded") as u64,
        duration_ms: row.get::<i64, _>("duration_ms") as u64,
        status: row.get("status"),
        error_message: row.get("error_message"),
    })
}

fn row_to_sync_row_error(row: sqlx::sqlite::SqliteRow) -> AppResult<SyncRowError> {
    Ok(SyncRowError {
        id: row.get("id"),
        batch_id: row.get("batch_id"),
        row_key: row.get("row_key"),
        column_name: row.get("column_name"),
        error_message: row.get("error_message"),
        raw_value: row.get("raw_value"),
    })
}

fn row_to_sync_checkpoint(row: sqlx::sqlite::SqliteRow) -> AppResult<SyncCheckpoint> {
    Ok(SyncCheckpoint {
        id: row.get("id"),
        pipeline_id: row.get("pipeline_id"),
        run_id: row.get("run_id"),
        table_name: row.get("table_name"),
        last_processed_key: row.get("last_processed_key"),
        batch_number: row.get::<i64, _>("batch_number") as u64,
    })
}
