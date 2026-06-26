use crate::db::DbType;
use crate::error::AppResult;
use crate::models::{DbConnectionConfig, SshConfig, ScheduledJob, JobType, JobExecutionLog};
use chrono::{DateTime, Utc};
use secrecy::ExposeSecret;
use sqlx::{Row, sqlite::SqlitePool};
use std::path::PathBuf;
use uuid::Uuid;

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

        let db_type: DbType =
            serde_json::from_value(serde_json::Value::String(db_type_str)).unwrap_or(DbType::Mysql);
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
                .map(secrecy::SecretString::from),
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
            .map(|s| serde_json::to_string(&s).unwrap_or_default());
        let db_type = serde_json::to_value(&config.db_type)
            .unwrap()
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
                    .map(secrecy::SecretString::from),
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
            .unwrap()
            .as_str()
            .unwrap_or("backup")
            .to_string();
        let config = serde_json::to_string(&job.config).unwrap_or_default();
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
}
