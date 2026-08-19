use crate::db::DbType;
use crate::error::AppResult;
use crate::models::compare::CompareSession;
use crate::models::sync::{
    PipelineStatus, SyncBatch, SyncCheckpoint, SyncMode, SyncPipeline, SyncRowError, SyncRun,
    SyncTableConfig,
};
use crate::models::{DbConnectionConfig, JobExecutionLog, JobType, ScheduledJob, SshConfig};
use chrono::{DateTime, Utc};
use secrecy::ExposeSecret;
use sqlx::{
    sqlite::{SqlitePool, SqlitePoolOptions},
    Row,
};
use std::path::PathBuf;
use std::sync::RwLock;
use uuid::Uuid;
use zeroize::Zeroize;

use crate::application::audit_service::AuditEntry;

pub struct Storage {
    pool: SqlitePool,
    master_key: RwLock<Option<[u8; 32]>>,
}

impl Storage {
    pub async fn new(db_path: PathBuf) -> AppResult<Self> {
        let url = format!("sqlite:{}", db_path.to_string_lossy());
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await?;

        // WAL mode for concurrent reads + busy timeout to retry on contention
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&pool)
            .await?;
        sqlx::query("PRAGMA busy_timeout=5000")
            .execute(&pool)
            .await?;

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

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN default_database TEXT")
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
                skipped_rows INTEGER NOT NULL DEFAULT 0,
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

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY DEFAULT 'default',
                name TEXT NOT NULL DEFAULT 'Unnamed Hero',
                lore TEXT NOT NULL DEFAULT '',
                slot_order TEXT NOT NULL DEFAULT '[]'
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS app_secrets (
                key TEXT PRIMARY KEY,
                value BLOB NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS compare_sessions (
                id TEXT PRIMARY KEY,
                source_conn_id TEXT NOT NULL,
                target_conn_id TEXT NOT NULL,
                source_database TEXT,
                target_database TEXT,
                source_schema TEXT,
                target_schema TEXT,
                selected_tables TEXT,
                schema_report TEXT,
                data_report TEXT,
                sync_script TEXT,
                script_options TEXT,
                active_tab TEXT DEFAULT 'schema',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS assistant_messages (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sql TEXT,
                is_safe_delete INTEGER,
                timestamp INTEGER NOT NULL,
                connection_id TEXT
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS assistant_providers (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                model TEXT,
                api_key TEXT,
                base_url TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS assistant_knowledge (
                id TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                sql_text TEXT NOT NULL,
                engine TEXT NOT NULL,
                rating TEXT NOT NULL,
                used_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS assistant_preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS query_history (
                id TEXT PRIMARY KEY,
                connection_id TEXT NOT NULL,
                query TEXT NOT NULL,
                executed_at INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'success',
                error TEXT,
                row_count INTEGER NOT NULL DEFAULT 0
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS diagrams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_connection_id TEXT,
                source_schema TEXT,
                config TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        // Migrations
        let _ = sqlx::query("ALTER TABLE assistant_messages ADD COLUMN feedback TEXT")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN password_enc BLOB")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN password_nonce BLOB")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN ssh_enc BLOB")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN ssh_nonce BLOB")
            .execute(&pool)
            .await;

        let _ = sqlx::query(
            "ALTER TABLE sync_batches ADD COLUMN skipped_rows INTEGER NOT NULL DEFAULT 0",
        )
        .execute(&pool)
        .await;

        // Assistant migrations
        let _ = sqlx::query("ALTER TABLE assistant_messages ADD COLUMN accepted_sql TEXT")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE assistant_messages ADD COLUMN rejection_reason TEXT")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE assistant_messages ADD COLUMN tool_used TEXT")
            .execute(&pool)
            .await;
        let _ = sqlx::query(
            "ALTER TABLE assistant_knowledge ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0",
        )
        .execute(&pool)
        .await;

        // Phase 7: encrypt API keys at rest in `assistant_providers`.
        // `api_key` keeps its nullable-TEXT for back-compat (legacy plaintext
        // values are migrated on first save); new writes populate the two
        // ciphertext columns and NULL-out `api_key`.
        let _ = sqlx::query("ALTER TABLE assistant_providers ADD COLUMN api_key_enc TEXT")
            .execute(&pool)
            .await;
        let _ = sqlx::query("ALTER TABLE assistant_providers ADD COLUMN api_key_nonce TEXT")
            .execute(&pool)
            .await;

        // Per-database credentials (MongoDB: each db may have its own auth)
        let _ = sqlx::query(
            "CREATE TABLE IF NOT EXISTS connection_database_credentials (
                connection_id TEXT NOT NULL,
                database TEXT NOT NULL,
                user TEXT NOT NULL DEFAULT '',
                password_enc BLOB,
                password_nonce BLOB,
                auth_source TEXT,
                PRIMARY KEY (connection_id, database)
            )",
        )
        .execute(&pool)
        .await;

        Ok(Self {
            pool,
            master_key: RwLock::new(None),
        })
    }

    pub fn set_master_key(&self, key: [u8; 32]) {
        *self.master_key.write().unwrap() = Some(key);
    }

    pub fn get_master_key(&self) -> Option<[u8; 32]> {
        *self.master_key.read().unwrap()
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

        let db_type: DbType = serde_json::from_value(serde_json::Value::String(
            db_type_str.clone(),
        ))
        .unwrap_or_else(|e| {
            tracing::warn!(
                "Failed to parse db_type '{}': {}. Falling back to Mysql",
                db_type_str,
                e
            );
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
            password: row.get::<Option<String>, _>("password").map(|mut s| {
                let secret = secrecy::SecretString::from(s.as_str());
                s.zeroize();
                secret
            }),
            database: row.get("database"),
            default_database: row.get("default_database"),
            auth_enabled: row
                .try_get::<Option<i64>, _>("auth_enabled")
                .unwrap_or(None)
                .map(|v| v != 0),
            auth_source: row.get("auth_source"),
            replica_set: row.get("replica_set"),
            direct_connection: row
                .get::<Option<i64>, _>("direct_connection")
                .map(|v| v != 0),
            ssl: row.get("ssl"),
            ssh_tunnel,
            read_only: row
                .try_get::<Option<i64>, _>("read_only")
                .unwrap_or(None)
                .map(|v| v != 0),
            max_pool_size: row
                .try_get::<Option<i64>, _>("max_pool_size")
                .unwrap_or(None)
                .map(|v| v as i32),
            idle_timeout: row
                .try_get::<Option<i64>, _>("idle_timeout")
                .unwrap_or(None)
                .map(|v| v as i32),
            acquire_timeout: row
                .try_get::<Option<i64>, _>("acquire_timeout")
                .unwrap_or(None)
                .map(|v| v as i32),
            max_lifetime: row
                .try_get::<Option<i64>, _>("max_lifetime")
                .unwrap_or(None)
                .map(|v| v as i32),
            keep_alive: row
                .try_get::<Option<i64>, _>("keep_alive")
                .unwrap_or(None)
                .map(|v| v as i32),
            metadata_cache_ttl: row
                .try_get::<Option<i64>, _>("metadata_cache_ttl")
                .unwrap_or(None)
                .map(|v| v as i32),
            password_enc: row
                .try_get::<Option<Vec<u8>>, _>("password_enc")
                .unwrap_or(None),
            password_nonce: row
                .try_get::<Option<Vec<u8>>, _>("password_nonce")
                .unwrap_or(None),
            ssh_enc: row.try_get::<Option<Vec<u8>>, _>("ssh_enc").unwrap_or(None),
            ssh_nonce: row
                .try_get::<Option<Vec<u8>>, _>("ssh_nonce")
                .unwrap_or(None),
        })
    }

    pub async fn save_connection(&self, config: DbConnectionConfig) -> AppResult<String> {
        let id = config.id.unwrap_or_else(Uuid::new_v4).to_string();
        let ssh_json = config.ssh_tunnel.as_ref().map(|s| {
            serde_json::to_string(&s).unwrap_or_else(|e| {
                tracing::error!("Failed to serialize ssh config: {}", e);
                "{}".into()
            })
        });
        let db_type = serde_json::to_value(&config.db_type)
            .unwrap_or_else(|e| {
                tracing::error!("Failed to serialize db_type: {}", e);
                serde_json::Value::String("mysql".into())
            })
            .as_str()
            .unwrap_or("mysql")
            .to_string();

        let has_encrypted = config.password_enc.is_some() || config.ssh_enc.is_some();
        let password = if has_encrypted {
            None::<String>
        } else {
            config
                .password
                .as_ref()
                .map(|p| p.expose_secret().to_string())
        };

        sqlx::query(
            "INSERT INTO connections (id, name, environment, type, host, port, user, password, database, default_database, auth_enabled, auth_source, replica_set, direct_connection, ssl, ssh, read_only, max_pool_size, idle_timeout, acquire_timeout, max_lifetime, keep_alive, metadata_cache_ttl, password_enc, password_nonce, ssh_enc, ssh_nonce)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                environment = excluded.environment,
                type = excluded.type,
                host = excluded.host,
                port = excluded.port,
                user = excluded.user,
                password = CASE
                    WHEN excluded.password_enc IS NOT NULL THEN NULL
                    WHEN excluded.password IS NOT NULL AND excluded.password != '' THEN excluded.password
                    ELSE connections.password
                END,
                database = excluded.database,
                default_database = excluded.default_database,
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
                END,
                password_enc = excluded.password_enc,
                password_nonce = excluded.password_nonce,
                ssh_enc = excluded.ssh_enc,
                ssh_nonce = excluded.ssh_nonce"
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
        .bind(config.default_database)
        .bind(config.auth_enabled.map(|v| if v { 1 } else { 0 }))
        .bind(config.auth_source)
        .bind(config.replica_set)
        .bind(config.direct_connection.map(|v| if v { 1 } else { 0 }))
        .bind(config.ssl)
        .bind(ssh_json)
        .bind(config.read_only.map(|v| if v { 1 } else { 0 }))
        .bind(config.max_pool_size.map(|v| v as i64))
        .bind(config.idle_timeout.map(|v| v as i64))
        .bind(config.acquire_timeout.map(|v| v as i64))
        .bind(config.max_lifetime.map(|v| v as i64))
        .bind(config.keep_alive.map(|v| v as i64))
        .bind(config.metadata_cache_ttl.map(|v| v as i64))
        .bind(config.password_enc.as_deref())
        .bind(config.password_nonce.as_deref())
        .bind(config.ssh_enc.as_deref())
        .bind(config.ssh_nonce.as_deref())
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
                password: row.get::<Option<String>, _>("password").map(|mut s| {
                    let secret = secrecy::SecretString::from(s.as_str());
                    s.zeroize();
                    secret
                }),
                database: row.get("database"),
                default_database: row.get("default_database"),
                auth_enabled: row
                    .try_get::<Option<i64>, _>("auth_enabled")
                    .unwrap_or(None)
                    .map(|v| v != 0),
                auth_source: row.get("auth_source"),
                replica_set: row.get("replica_set"),
                direct_connection: row
                    .get::<Option<i64>, _>("direct_connection")
                    .map(|v| v != 0),
                ssl: row.get("ssl"),
                ssh_tunnel,
                read_only: row
                    .try_get::<Option<i64>, _>("read_only")
                    .unwrap_or(None)
                    .map(|v| v != 0),
                max_pool_size: row
                    .try_get::<Option<i64>, _>("max_pool_size")
                    .unwrap_or(None)
                    .map(|v| v as i32),
                idle_timeout: row
                    .try_get::<Option<i64>, _>("idle_timeout")
                    .unwrap_or(None)
                    .map(|v| v as i32),
                acquire_timeout: row
                    .try_get::<Option<i64>, _>("acquire_timeout")
                    .unwrap_or(None)
                    .map(|v| v as i32),
                max_lifetime: row
                    .try_get::<Option<i64>, _>("max_lifetime")
                    .unwrap_or(None)
                    .map(|v| v as i32),
                keep_alive: row
                    .try_get::<Option<i64>, _>("keep_alive")
                    .unwrap_or(None)
                    .map(|v| v as i32),
                metadata_cache_ttl: row
                    .try_get::<Option<i64>, _>("metadata_cache_ttl")
                    .unwrap_or(None)
                    .map(|v| v as i32),
                password_enc: row
                    .try_get::<Option<Vec<u8>>, _>("password_enc")
                    .unwrap_or(None),
                password_nonce: row
                    .try_get::<Option<Vec<u8>>, _>("password_nonce")
                    .unwrap_or(None),
                ssh_enc: row.try_get::<Option<Vec<u8>>, _>("ssh_enc").unwrap_or(None),
                ssh_nonce: row
                    .try_get::<Option<Vec<u8>>, _>("ssh_nonce")
                    .unwrap_or(None),
            });
        }
        Ok(connections)
    }

    pub async fn delete_connection(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM connections WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM connection_database_credentials WHERE connection_id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_connection_encrypted(&self, config: &DbConnectionConfig) -> AppResult<()> {
        let id = config.id.map(|i| i.to_string()).unwrap_or_default();
        sqlx::query(
            "UPDATE connections SET password_enc = ?, password_nonce = ?, ssh_enc = ?, ssh_nonce = ? WHERE id = ?"
        )
        .bind(&config.password_enc)
        .bind(&config.password_nonce)
        .bind(&config.ssh_enc)
        .bind(&config.ssh_nonce)
        .bind(&id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_database_credential(
        &self,
        connection_id: &str,
        database: &str,
    ) -> AppResult<Option<crate::models::DatabaseCredential>> {
        let row = sqlx::query(
            "SELECT connection_id, database, user, password_enc, password_nonce, auth_source
             FROM connection_database_credentials
             WHERE connection_id = ? AND database = ?",
        )
        .bind(connection_id)
        .bind(database)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| crate::models::DatabaseCredential {
            connection_id: r
                .get::<String, _>("connection_id")
                .parse()
                .unwrap_or_else(|_| uuid::Uuid::nil()),
            database: r.get::<String, _>("database"),
            user: r.get::<String, _>("user"),
            password: None,
            auth_source: r
                .try_get::<Option<String>, _>("auth_source")
                .unwrap_or(None),
            password_enc: r
                .try_get::<Option<Vec<u8>>, _>("password_enc")
                .unwrap_or(None),
            password_nonce: r
                .try_get::<Option<Vec<u8>>, _>("password_nonce")
                .unwrap_or(None),
        }))
    }

    pub async fn save_database_credential(
        &self,
        cred: &crate::models::DatabaseCredential,
    ) -> AppResult<()> {
        let id = cred.connection_id.to_string();
        sqlx::query(
            "INSERT INTO connection_database_credentials
                (connection_id, database, user, password_enc, password_nonce, auth_source)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(connection_id, database) DO UPDATE SET
                user = excluded.user,
                password_enc = excluded.password_enc,
                password_nonce = excluded.password_nonce,
                auth_source = excluded.auth_source",
        )
        .bind(id)
        .bind(&cred.database)
        .bind(&cred.user)
        .bind(&cred.password_enc)
        .bind(&cred.password_nonce)
        .bind(&cred.auth_source)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_database_credential(
        &self,
        connection_id: &str,
        database: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "DELETE FROM connection_database_credentials WHERE connection_id = ? AND database = ?",
        )
        .bind(connection_id)
        .bind(database)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_app_secret(&self, key: &str) -> AppResult<Option<Vec<u8>>> {
        let row = sqlx::query("SELECT value FROM app_secrets WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|r| r.get::<Vec<u8>, _>("value")))
    }

    pub async fn set_app_secret(&self, key: &str, value: &[u8]) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO app_secrets (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key)
        .bind(value)
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
        .bind(job.cron_expression.as_deref().unwrap_or(""))
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
            cron_expression: {
                let ce: String = row.get("cron_expression");
                if ce.is_empty() {
                    None
                } else {
                    Some(ce)
                }
            },
            config: serde_json::from_str(&config_str).unwrap_or_default(),
            enabled: row.get::<i64, _>("enabled") != 0,
            last_run: last_run_str.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|d| d.with_timezone(&Utc))
            }),
            next_run: next_run_str.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|d| d.with_timezone(&Utc))
            }),
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
            "SELECT * FROM job_execution_logs WHERE job_id = ? ORDER BY started_at DESC LIMIT 50",
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

    // ── Diagrams ──

    pub async fn save_diagram(
        &self,
        diagram: &crate::models::diagram::Diagram,
    ) -> AppResult<crate::models::diagram::Diagram> {
        let config = serde_json::to_string(&serde_json::json!({
            "nodes": diagram.nodes,
            "edges": diagram.edges,
            "viewport": diagram.viewport,
        }))
        .unwrap_or_default();
        let now = chrono::Utc::now().to_rfc3339();
        let diagram_id = diagram
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let created_at = diagram.created_at.clone().unwrap_or_else(|| now.clone());
        let updated_at = diagram.updated_at.clone().unwrap_or(now);

        sqlx::query(
            "INSERT INTO diagrams (id, name, source_connection_id, source_schema, config, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                source_connection_id = excluded.source_connection_id,
                source_schema = excluded.source_schema,
                config = excluded.config,
                updated_at = excluded.updated_at"
        )
        .bind(&diagram_id)
        .bind(&diagram.name)
        .bind(&diagram.source_connection_id)
        .bind(&diagram.source_schema)
        .bind(&config)
        .bind(&created_at)
        .bind(&updated_at)
        .execute(&self.pool)
        .await?;

        Ok(crate::models::diagram::Diagram {
            id: Some(diagram_id),
            name: diagram.name.clone(),
            source_connection_id: diagram.source_connection_id.clone(),
            source_schema: diagram.source_schema.clone(),
            nodes: diagram.nodes.clone(),
            edges: diagram.edges.clone(),
            viewport: diagram.viewport.clone(),
            created_at: Some(created_at),
            updated_at: Some(updated_at),
        })
    }

    pub async fn get_diagram(&self, id: &str) -> AppResult<crate::models::diagram::Diagram> {
        let row = sqlx::query("SELECT * FROM diagrams WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;
        row_to_diagram(row)
    }

    pub async fn list_diagrams(&self) -> AppResult<Vec<crate::models::diagram::Diagram>> {
        let rows = sqlx::query("SELECT * FROM diagrams ORDER BY updated_at DESC")
            .fetch_all(&self.pool)
            .await?;

        let mut diagrams = Vec::new();
        for row in rows {
            if let Ok(d) = row_to_diagram(row) {
                diagrams.push(d);
            }
        }
        Ok(diagrams)
    }

    pub async fn delete_diagram(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM diagrams WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Sync Pipelines ──

    pub async fn save_sync_pipeline(&self, pipeline: &SyncPipeline) -> AppResult<SyncPipeline> {
        let config = serde_json::to_string(&serde_json::json!({
            "source_schema": pipeline.source_schema,
            "target_schema": pipeline.target_schema,
            "tables": pipeline.tables,
        }))
        .unwrap_or_default();
        let now = chrono::Utc::now().to_rfc3339();
        let pipeline_id = pipeline
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
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
            source_schema: pipeline.source_schema.clone(),
            target_schema: pipeline.target_schema.clone(),
            mode: pipeline.mode.clone(),
            status: pipeline.status.clone(),
            tables: pipeline.tables.clone(),
            batch_size: pipeline.batch_size,
            created_at: Some(created_at),
            updated_at: Some(updated_at),
        })
    }

    pub async fn update_sync_pipeline_status(
        &self,
        id: &str,
        status: PipelineStatus,
    ) -> AppResult<()> {
        let status_str = serde_json::to_value(&status)
            .unwrap_or_else(|e| {
                tracing::error!("Failed to serialize status: {}", e);
                serde_json::Value::String("draft".into())
            })
            .as_str()
            .unwrap_or("draft")
            .to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query("UPDATE sync_pipelines SET status = ?, updated_at = ? WHERE id = ?")
            .bind(&status_str)
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
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
        let rows =
            sqlx::query("SELECT * FROM sync_runs WHERE pipeline_id = ? ORDER BY started_at DESC")
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

    pub async fn get_sync_checkpoint(
        &self,
        pipeline_id: &str,
        table_name: &str,
    ) -> AppResult<Option<SyncCheckpoint>> {
        let result =
            sqlx::query("SELECT * FROM sync_checkpoints WHERE pipeline_id = ? AND table_name = ?")
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

    pub async fn get_latest_checkpoint(
        &self,
        pipeline_id: &str,
    ) -> AppResult<Option<SyncCheckpoint>> {
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
            "INSERT INTO sync_batches (id, run_id, batch_number, table_name, rows_extracted, rows_loaded, skipped_rows, duration_ms, status, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                rows_extracted = excluded.rows_extracted,
                rows_loaded = excluded.rows_loaded,
                skipped_rows = excluded.skipped_rows,
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
        .bind(batch.skipped_rows as i64)
        .bind(batch.duration_ms as i64)
        .bind(&batch.status)
        .bind(&batch.error_message)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_sync_batches(&self, run_id: &str) -> AppResult<Vec<SyncBatch>> {
        let rows =
            sqlx::query("SELECT * FROM sync_batches WHERE run_id = ? ORDER BY batch_number ASC")
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
        let rows =
            sqlx::query("SELECT * FROM sync_row_errors WHERE batch_id = ? ORDER BY row_key ASC")
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

    pub async fn get_character(&self) -> AppResult<crate::models::Character> {
        let row = sqlx::query("SELECT * FROM characters WHERE id = 'default'")
            .fetch_optional(&self.pool)
            .await?;

        match row {
            Some(r) => Ok(crate::models::Character {
                id: r.get("id"),
                name: r.get("name"),
                lore: r.get("lore"),
                slot_order: r.get("slot_order"),
            }),
            None => Ok(crate::models::Character {
                id: "default".into(),
                name: "Unnamed Hero".into(),
                lore: String::new(),
                slot_order: "[]".into(),
            }),
        }
    }

    pub async fn save_character(&self, character: &crate::models::Character) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO characters (id, name, lore, slot_order) VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                lore = excluded.lore,
                slot_order = excluded.slot_order",
        )
        .bind(&character.id)
        .bind(&character.name)
        .bind(&character.lore)
        .bind(&character.slot_order)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn save_compare_session(
        &self,
        session: &CompareSession,
    ) -> AppResult<CompareSession> {
        let selected_tables_json = session
            .selected_tables
            .as_ref()
            .map(|t| serde_json::to_string(t).unwrap_or_default());
        let schema_report_json = session
            .schema_report
            .as_ref()
            .map(|r| serde_json::to_string(r).unwrap_or_default());
        let data_report_json = session
            .data_report
            .as_ref()
            .map(|r| serde_json::to_string(r).unwrap_or_default());
        let sync_script_json = session
            .sync_script
            .as_ref()
            .map(|s| serde_json::to_string(s).unwrap_or_default());
        let script_options_json = session
            .script_options
            .as_ref()
            .map(|o| serde_json::to_string(o).unwrap_or_default());

        sqlx::query(
            "INSERT INTO compare_sessions (id, source_conn_id, target_conn_id, source_database, target_database, source_schema, target_schema, selected_tables, schema_report, data_report, sync_script, script_options, active_tab, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                source_conn_id = excluded.source_conn_id,
                target_conn_id = excluded.target_conn_id,
                source_database = excluded.source_database,
                target_database = excluded.target_database,
                source_schema = excluded.source_schema,
                target_schema = excluded.target_schema,
                selected_tables = excluded.selected_tables,
                schema_report = excluded.schema_report,
                data_report = excluded.data_report,
                sync_script = excluded.sync_script,
                script_options = excluded.script_options,
                active_tab = excluded.active_tab,
                updated_at = excluded.updated_at"
        )
        .bind(&session.id)
        .bind(&session.source_conn_id)
        .bind(&session.target_conn_id)
        .bind(&session.source_database)
        .bind(&session.target_database)
        .bind(&session.source_schema)
        .bind(&session.target_schema)
        .bind(&selected_tables_json)
        .bind(&schema_report_json)
        .bind(&data_report_json)
        .bind(&sync_script_json)
        .bind(&script_options_json)
        .bind(&session.active_tab)
        .bind(&session.created_at)
        .bind(&session.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(session.clone())
    }

    pub async fn get_compare_session(&self, id: &str) -> AppResult<CompareSession> {
        let row = sqlx::query("SELECT * FROM compare_sessions WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;

        row_to_compare_session(row)
    }

    pub async fn list_compare_sessions(&self) -> AppResult<Vec<CompareSession>> {
        let rows = sqlx::query("SELECT * FROM compare_sessions ORDER BY updated_at DESC")
            .fetch_all(&self.pool)
            .await?;

        let mut sessions = Vec::new();
        for row in rows {
            if let Ok(s) = row_to_compare_session(row) {
                sessions.push(s);
            }
        }
        Ok(sessions)
    }

    pub async fn delete_compare_session(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM compare_sessions WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_all_compare_sessions(&self) -> AppResult<()> {
        sqlx::query("DELETE FROM compare_sessions")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Assistant Messages ──

    pub async fn save_assistant_messages(
        &self,
        messages: &[crate::models::AssistantMessage],
    ) -> AppResult<()> {
        for msg in messages {
            sqlx::query(
                "INSERT INTO assistant_messages (id, role, content, sql, is_safe_delete, feedback, accepted_sql, rejection_reason, tool_used, timestamp, connection_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    role = excluded.role,
                    content = excluded.content,
                    sql = excluded.sql,
                    is_safe_delete = excluded.is_safe_delete,
                    feedback = excluded.feedback,
                    accepted_sql = excluded.accepted_sql,
                    rejection_reason = excluded.rejection_reason,
                    tool_used = excluded.tool_used,
                    timestamp = excluded.timestamp,
                    connection_id = excluded.connection_id"
            )
            .bind(&msg.id)
            .bind(&msg.role)
            .bind(&msg.content)
            .bind(&msg.sql)
            .bind(msg.is_safe_delete.map(|v| if v { 1i64 } else { 0i64 }))
            .bind(&msg.feedback)
            .bind(&msg.accepted_sql)
            .bind(&msg.rejection_reason)
            .bind(&msg.tool_used)
            .bind(msg.timestamp)
            .bind(&msg.connection_id)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    pub async fn load_assistant_messages(
        &self,
        connection_id: &str,
    ) -> AppResult<Vec<crate::models::AssistantMessage>> {
        let rows = sqlx::query(
            "SELECT id, role, content, sql, is_safe_delete, feedback, accepted_sql, rejection_reason, tool_used, timestamp, connection_id
             FROM assistant_messages
             WHERE connection_id = ?
             ORDER BY timestamp ASC"
        )
        .bind(connection_id)
        .fetch_all(&self.pool)
        .await?;

        let mut messages = Vec::new();
        for row in rows {
            messages.push(crate::models::AssistantMessage {
                id: row.get("id"),
                role: row.get("role"),
                content: row.get("content"),
                sql: row.get("sql"),
                is_safe_delete: row.get::<Option<i64>, _>("is_safe_delete").map(|v| v != 0),
                feedback: row.get("feedback"),
                accepted_sql: row.get("accepted_sql"),
                rejection_reason: row.get("rejection_reason"),
                tool_used: row.get("tool_used"),
                timestamp: row.get("timestamp"),
                connection_id: row.get("connection_id"),
            });
        }
        Ok(messages)
    }

    pub async fn clear_assistant_messages(&self, connection_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM assistant_messages WHERE connection_id = ?")
            .bind(connection_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_assistant_feedback(
        &self,
        message_id: &str,
        feedback: &str,
    ) -> AppResult<()> {
        sqlx::query("UPDATE assistant_messages SET feedback = ? WHERE id = ?")
            .bind(feedback)
            .bind(message_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Query History ──

    pub async fn save_query_history(
        &self,
        entries: &[crate::models::QueryHistoryEntry],
    ) -> AppResult<()> {
        for entry in entries {
            sqlx::query(
                "INSERT INTO query_history (id, connection_id, query, executed_at, duration_ms, status, error, row_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    connection_id = excluded.connection_id,
                    query = excluded.query,
                    executed_at = excluded.executed_at,
                    duration_ms = excluded.duration_ms,
                    status = excluded.status,
                    error = excluded.error,
                    row_count = excluded.row_count"
            )
            .bind(&entry.id)
            .bind(&entry.connection_id)
            .bind(&entry.query)
            .bind(entry.executed_at)
            .bind(entry.duration_ms.unwrap_or(0))
            .bind(&entry.status)
            .bind(&entry.error)
            .bind(entry.row_count.unwrap_or(0))
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    pub async fn load_query_history(
        &self,
        connection_id: &str,
        limit: i64,
    ) -> AppResult<Vec<crate::models::QueryHistoryEntry>> {
        let rows = sqlx::query(
            "SELECT id, connection_id, query, executed_at, duration_ms, status, error, row_count
             FROM query_history
             WHERE connection_id = ?
             ORDER BY executed_at DESC
             LIMIT ?",
        )
        .bind(connection_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(crate::models::QueryHistoryEntry {
                id: row.get("id"),
                connection_id: row.get("connection_id"),
                query: row.get("query"),
                executed_at: row.get("executed_at"),
                duration_ms: Some(row.get::<i64, _>("duration_ms")),
                status: row.get("status"),
                error: row.get("error"),
                row_count: Some(row.get::<i64, _>("row_count")),
            });
        }
        Ok(entries)
    }

    pub async fn clear_query_history(&self, connection_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM query_history WHERE connection_id = ?")
            .bind(connection_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn search_similar_queries(
        &self,
        connection_id: &str,
        search: &str,
        limit: i64,
    ) -> AppResult<Vec<crate::models::QueryHistoryEntry>> {
        let pattern = format!("%{}%", search);
        let rows = sqlx::query(
            "SELECT id, connection_id, query, executed_at, duration_ms, status, error, row_count
             FROM query_history
             WHERE connection_id = ?
               AND query LIKE ?
             ORDER BY executed_at DESC
             LIMIT ?",
        )
        .bind(connection_id)
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(crate::models::QueryHistoryEntry {
                id: row.get("id"),
                connection_id: row.get("connection_id"),
                query: row.get("query"),
                executed_at: row.get("executed_at"),
                duration_ms: Some(row.get::<i64, _>("duration_ms")),
                status: row.get("status"),
                error: row.get("error"),
                row_count: Some(row.get::<i64, _>("row_count")),
            });
        }
        Ok(entries)
    }

    pub async fn save_provider_config(
        &self,
        config: &crate::models::assistant::ProviderConfig,
    ) -> AppResult<String> {
        let now = chrono::Utc::now().timestamp();
        let id = config
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        // Encrypt the API key at rest if the session is unlocked (master key
        // available). If the session is locked, fall back to plaintext storage
        // rather than dropping the key. Ollama (key-less) writes NULL here.
        let (api_key_plain, api_key_enc, api_key_nonce) =
            match (&config.api_key, self.get_master_key()) {
                (Some(key), Some(k)) if !key.is_empty() => {
                    let (enc, nonce) = crate::infrastructure::crypto::encrypt(key, &k)
                        .map_err(crate::error::AppError::Internal)?;
                    use base64::Engine;
                    (
                        None as Option<String>,
                        Some(base64::engine::general_purpose::STANDARD.encode(&enc)),
                        Some(base64::engine::general_purpose::STANDARD.encode(nonce)),
                    )
                }
                (Some(key), _) => (Some(key.clone()), None, None),
                (None, _) => (None, None, None),
            };

        sqlx::query(
            "INSERT OR REPLACE INTO assistant_providers
             (id, provider_id, model, api_key, api_key_enc, api_key_nonce, base_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&config.provider_id)
        .bind(&config.model)
        .bind(&api_key_plain)
        .bind(&api_key_enc)
        .bind(&api_key_nonce)
        .bind(&config.base_url)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn load_provider_configs(
        &self,
    ) -> AppResult<Vec<crate::models::assistant::ProviderConfig>> {
        let rows = sqlx::query(
            "SELECT id, provider_id, model, api_key, api_key_enc, api_key_nonce, base_url
             FROM assistant_providers ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .iter()
            .map(|row| {
                let api_key =
                    self.decrypt_provider_key(row, "api_key", "api_key_enc", "api_key_nonce");
                crate::models::assistant::ProviderConfig {
                    id: Some(row.get("id")),
                    provider_id: row.get("provider_id"),
                    model: row.get("model"),
                    api_key,
                    base_url: row.get("base_url"),
                }
            })
            .collect())
    }

    pub async fn delete_provider_config(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM assistant_providers WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_provider_config_by_id(
        &self,
        id: &str,
    ) -> AppResult<Option<crate::models::assistant::ProviderConfig>> {
        let row = sqlx::query(
            "SELECT id, provider_id, model, api_key, api_key_enc, api_key_nonce, base_url
             FROM assistant_providers WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| {
            let api_key = self.decrypt_provider_key(&r, "api_key", "api_key_enc", "api_key_nonce");
            crate::models::assistant::ProviderConfig {
                id: Some(r.get("id")),
                provider_id: r.get("provider_id"),
                model: r.get("model"),
                api_key,
                base_url: r.get("base_url"),
            }
        }))
    }

    /// Decrypt a provider's API key from a SQL row, consulting the encrypted
    /// columns first and falling back to legacy plaintext.
    fn decrypt_provider_key(
        &self,
        row: &sqlx::sqlite::SqliteRow,
        plain_col: &str,
        enc_col: &str,
        nonce_col: &str,
    ) -> Option<String> {
        let enc: Option<String> = row.try_get(enc_col).ok().flatten();
        let nonce: Option<String> = row.try_get(nonce_col).ok().flatten();
        if let (Some(enc_str), Some(nonce_str)) = (enc, nonce) {
            if let Some(key) = self.get_master_key() {
                use base64::Engine;
                let enc_bytes = base64::engine::general_purpose::STANDARD
                    .decode(enc_str.as_bytes())
                    .ok()?;
                let nonce_bytes = base64::engine::general_purpose::STANDARD
                    .decode(nonce_str.as_bytes())
                    .ok()?;
                let mut nonce_arr = [0u8; 12];
                if nonce_bytes.len() != 12 {
                    return row.get::<Option<String>, _>(plain_col);
                }
                nonce_arr.copy_from_slice(&nonce_bytes);
                if let Ok(plain) =
                    crate::infrastructure::crypto::decrypt(&enc_bytes, &nonce_arr, &key)
                {
                    return Some(plain);
                }
                // Decryption failed (e.g. wrong master password); fall through
                // to plaintext fallback below.
            }
            // Session locked → no API key in memory.
            return None;
        }
        row.get::<Option<String>, _>(plain_col)
    }

    // ── Assistant Knowledge ──

    pub async fn search_knowledge(
        &self,
        query: &str,
        engine: &str,
        limit: i64,
    ) -> AppResult<Vec<crate::models::assistant::KnowledgeCase>> {
        let pattern = format!("%{}%", query);
        let rows = sqlx::query(
            "SELECT id, question, sql_text, engine, rating, used_count, favorite
             FROM assistant_knowledge
             WHERE engine = ? AND (question LIKE ? OR sql_text LIKE ?)
             ORDER BY favorite DESC, used_count DESC, created_at DESC
             LIMIT ?",
        )
        .bind(engine)
        .bind(&pattern)
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .iter()
            .map(|row| crate::models::assistant::KnowledgeCase {
                id: row.get("id"),
                question: row.get("question"),
                sql_text: row.get("sql_text"),
                engine: row.get("engine"),
                rating: row.get("rating"),
                used_count: row.get("used_count"),
                favorite: row
                    .get::<Option<i64>, _>("favorite")
                    .map(|v| v != 0)
                    .unwrap_or(false),
            })
            .collect())
    }

    pub async fn list_knowledge_all(
        &self,
        engine: &str,
        limit: i64,
    ) -> AppResult<Vec<crate::models::assistant::KnowledgeCase>> {
        let rows = sqlx::query(
            "SELECT id, question, sql_text, engine, rating, used_count, favorite
             FROM assistant_knowledge
             WHERE engine = ?
             ORDER BY favorite DESC, used_count DESC, created_at DESC
             LIMIT ?",
        )
        .bind(engine)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .iter()
            .map(|row| crate::models::assistant::KnowledgeCase {
                id: row.get("id"),
                question: row.get("question"),
                sql_text: row.get("sql_text"),
                engine: row.get("engine"),
                rating: row.get("rating"),
                used_count: row.get("used_count"),
                favorite: row
                    .get::<Option<i64>, _>("favorite")
                    .map(|v| v != 0)
                    .unwrap_or(false),
            })
            .collect())
    }

    pub async fn list_knowledge_global(
        &self,
        limit: i64,
    ) -> AppResult<Vec<crate::models::assistant::KnowledgeCase>> {
        let rows = sqlx::query(
            "SELECT id, question, sql_text, engine, rating, used_count, favorite
             FROM assistant_knowledge
             ORDER BY favorite DESC, used_count DESC, created_at DESC
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .iter()
            .map(|row| crate::models::assistant::KnowledgeCase {
                id: row.get("id"),
                question: row.get("question"),
                sql_text: row.get("sql_text"),
                engine: row.get("engine"),
                rating: row.get("rating"),
                used_count: row.get("used_count"),
                favorite: row
                    .get::<Option<i64>, _>("favorite")
                    .map(|v| v != 0)
                    .unwrap_or(false),
            })
            .collect())
    }

    pub async fn toggle_knowledge_favorite(&self, id: &str) -> AppResult<bool> {
        let current: Option<i64> =
            sqlx::query_scalar("SELECT favorite FROM assistant_knowledge WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?;

        let new_val = match current {
            Some(v) if v != 0 => 0i64,
            _ => 1i64,
        };

        sqlx::query("UPDATE assistant_knowledge SET favorite = ? WHERE id = ?")
            .bind(new_val)
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(new_val != 0)
    }

    pub async fn save_knowledge_case(
        &self,
        case: &crate::models::assistant::KnowledgeCase,
    ) -> AppResult<()> {
        let now = chrono::Utc::now().timestamp();
        let fav_int = if case.favorite { 1i64 } else { 0i64 };
        sqlx::query(
            "INSERT OR REPLACE INTO assistant_knowledge (id, question, sql_text, engine, rating, used_count, favorite, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&case.id)
        .bind(&case.question)
        .bind(&case.sql_text)
        .bind(&case.engine)
        .bind(&case.rating)
        .bind(case.used_count)
        .bind(fav_int)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn increment_knowledge_used(&self, id: &str) -> AppResult<()> {
        sqlx::query("UPDATE assistant_knowledge SET used_count = used_count + 1 WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_knowledge_case(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM assistant_knowledge WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Assistant Preferences ──

    pub async fn get_preferences(&self) -> AppResult<Vec<crate::models::assistant::Preference>> {
        let rows = sqlx::query("SELECT key, value FROM assistant_preferences ORDER BY key")
            .fetch_all(&self.pool)
            .await?;

        Ok(rows
            .iter()
            .map(|row| crate::models::assistant::Preference {
                key: row.get("key"),
                value: row.get("value"),
            })
            .collect())
    }

    pub async fn set_preference(&self, key: &str, value: &str) -> AppResult<()> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "INSERT OR REPLACE INTO assistant_preferences (key, value, updated_at) VALUES (?, ?, ?)"
        )
        .bind(key)
        .bind(value)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_preference(&self, key: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM assistant_preferences WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_diagram(row: sqlx::sqlite::SqliteRow) -> AppResult<crate::models::diagram::Diagram> {
    let config_str: String = row.get("config");
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();

    Ok(crate::models::diagram::Diagram {
        id: Some(row.get("id")),
        name: row.get("name"),
        source_connection_id: row.get("source_connection_id"),
        source_schema: row.get("source_schema"),
        nodes: config
            .get("nodes")
            .cloned()
            .unwrap_or(serde_json::Value::Array(vec![])),
        edges: config
            .get("edges")
            .cloned()
            .unwrap_or(serde_json::Value::Array(vec![])),
        viewport: config.get("viewport").cloned(),
        created_at: Some(row.get("created_at")),
        updated_at: Some(row.get("updated_at")),
    })
}

fn row_to_sync_pipeline(row: sqlx::sqlite::SqliteRow) -> AppResult<SyncPipeline> {
    let config_str: String = row.get("config");
    let mode_str: String = row.get("mode");
    let status_str: String = row.get("status");

    let mode: SyncMode =
        serde_json::from_value(serde_json::Value::String(mode_str)).unwrap_or(SyncMode::Full);
    let status: PipelineStatus = serde_json::from_value(serde_json::Value::String(status_str))
        .unwrap_or(PipelineStatus::Draft);

    // Support both old format (just a tables array) and new format (object with schemas + tables)
    let (tables, source_schema, target_schema) =
        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&config_str) {
            match obj {
                serde_json::Value::Object(map) => {
                    let tables: Vec<SyncTableConfig> = map
                        .get("tables")
                        .and_then(|v| serde_json::from_value(v.clone()).ok())
                        .unwrap_or_default();
                    let source_schema = map
                        .get("source_schema")
                        .and_then(|v| serde_json::from_value(v.clone()).ok())
                        .unwrap_or(None);
                    let target_schema = map
                        .get("target_schema")
                        .and_then(|v| serde_json::from_value(v.clone()).ok())
                        .unwrap_or(None);
                    (tables, source_schema, target_schema)
                }
                serde_json::Value::Array(_) => {
                    let tables: Vec<SyncTableConfig> =
                        serde_json::from_str(&config_str).unwrap_or_default();
                    (tables, None, None)
                }
                _ => (vec![], None, None),
            }
        } else {
            (vec![], None, None)
        };

    Ok(SyncPipeline {
        id: Some(row.get("id")),
        name: row.get("name"),
        source_connection_id: row.get("source_connection_id"),
        target_connection_id: row.get("target_connection_id"),
        source_schema,
        target_schema,
        mode,
        status,
        tables,
        batch_size: row.get::<i64, _>("batch_size") as usize,
        created_at: Some(row.get("created_at")),
        updated_at: Some(row.get("updated_at")),
    })
}

fn row_to_compare_session(row: sqlx::sqlite::SqliteRow) -> AppResult<CompareSession> {
    let selected_tables: Option<Vec<String>> = row
        .get::<Option<String>, _>("selected_tables")
        .and_then(|s| serde_json::from_str(&s).ok());
    let schema_report = row
        .get::<Option<String>, _>("schema_report")
        .and_then(|s| serde_json::from_str(&s).ok());
    let data_report = row
        .get::<Option<String>, _>("data_report")
        .and_then(|s| serde_json::from_str(&s).ok());
    let sync_script = row
        .get::<Option<String>, _>("sync_script")
        .and_then(|s| serde_json::from_str(&s).ok());
    let script_options = row
        .get::<Option<String>, _>("script_options")
        .and_then(|s| serde_json::from_str(&s).ok());

    Ok(CompareSession {
        id: row.get("id"),
        source_conn_id: row.get("source_conn_id"),
        target_conn_id: row.get("target_conn_id"),
        source_database: row.get("source_database"),
        target_database: row.get("target_database"),
        source_schema: row.get("source_schema"),
        target_schema: row.get("target_schema"),
        selected_tables,
        schema_report,
        data_report,
        sync_script,
        script_options,
        active_tab: row.get("active_tab"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
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
        skipped_rows: row
            .try_get::<i64, _>("skipped_rows")
            .map(|v| v as u64)
            .unwrap_or(0),
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

#[cfg(test)]
mod tests {
    use super::Storage;
    use crate::models::assistant::ProviderConfig;
    use crate::models::sync::{PipelineStatus, SyncMode, SyncPipeline, SyncTableConfig};
    use uuid::Uuid;

    async fn test_storage() -> Storage {
        let dir = std::env::temp_dir().join(format!("toketeo_storage_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("test.db");
        std::fs::File::create(&db_path).unwrap();
        Storage::new(db_path).await.unwrap()
    }

    fn sample_pipeline() -> SyncPipeline {
        SyncPipeline {
            id: None,
            name: "Test pipe".to_string(),
            source_connection_id: "src-1".to_string(),
            target_connection_id: "tgt-1".to_string(),
            source_schema: None,
            target_schema: None,
            mode: SyncMode::Full,
            status: PipelineStatus::Ready,
            tables: vec![SyncTableConfig {
                source_table: "users".to_string(),
                target_table: "users".to_string(),
                column_mappings: vec![],
                filters: None,
                primary_key: None,
            }],
            batch_size: 500,
            created_at: None,
            updated_at: None,
        }
    }

    #[tokio::test]
    async fn sync_pipeline_crud() {
        let storage = test_storage().await;
        let saved = storage
            .save_sync_pipeline(&sample_pipeline())
            .await
            .unwrap();
        let id = saved.id.clone().unwrap();

        let fetched = storage.get_sync_pipeline(&id).await.unwrap();
        assert_eq!(fetched.name, "Test pipe");
        assert_eq!(fetched.tables.len(), 1);
        assert_eq!(fetched.mode, SyncMode::Full);

        storage
            .update_sync_pipeline_status(&id, PipelineStatus::Completed)
            .await
            .unwrap();
        let updated = storage.get_sync_pipeline(&id).await.unwrap();
        assert_eq!(updated.status, PipelineStatus::Completed);

        let list = storage.list_sync_pipelines().await.unwrap();
        assert_eq!(list.len(), 1);

        storage.delete_sync_pipeline(&id).await.unwrap();
        assert!(storage.get_sync_pipeline(&id).await.is_err());
    }

    #[tokio::test]
    async fn provider_config_roundtrip() {
        let storage = test_storage().await;
        let cfg = ProviderConfig {
            id: None,
            provider_id: "opencode".to_string(),
            model: Some("opencode/gpt-5.5".to_string()),
            api_key: None,
            base_url: Some("https://opencode.ai/zen/v1".to_string()),
        };
        let id = storage.save_provider_config(&cfg).await.unwrap();
        let loaded = storage
            .get_provider_config_by_id(&id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(loaded.provider_id, "opencode");
        assert_eq!(loaded.model, Some("opencode/gpt-5.5".to_string()));

        let all = storage.load_provider_configs().await.unwrap();
        assert_eq!(all.len(), 1);
    }

    #[tokio::test]
    async fn assistant_messages_roundtrip_per_connection() {
        let storage = test_storage().await;
        let msg = crate::models::AssistantMessage {
            id: Uuid::new_v4().to_string(),
            role: "user".to_string(),
            content: "hello".to_string(),
            sql: None,
            is_safe_delete: None,
            feedback: None,
            accepted_sql: None,
            rejection_reason: None,
            tool_used: None,
            timestamp: 1234567890,
            connection_id: Some("conn-a".to_string()),
        };
        storage.save_assistant_messages(&[msg]).await.unwrap();

        let from_a = storage.load_assistant_messages("conn-a").await.unwrap();
        assert_eq!(from_a.len(), 1);
        assert_eq!(from_a[0].content, "hello");

        let from_b = storage.load_assistant_messages("conn-b").await.unwrap();
        assert!(from_b.is_empty());
    }
}
