use crate::db::DbType;
use crate::error::AppResult;
use crate::models::{DbConnectionConfig, SshConfig};
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
            auth_source: row.get("auth_source"),
            replica_set: row.get("replica_set"),
            direct_connection: row
                .get::<Option<i64>, _>("direct_connection")
                .map(|v| v != 0),
            ssl: row.get("ssl"),
            ssh_tunnel,
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
            "INSERT INTO connections (id, name, environment, type, host, port, user, password, database, auth_source, replica_set, direct_connection, ssl, ssh)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                auth_source = excluded.auth_source,
                replica_set = excluded.replica_set,
                direct_connection = excluded.direct_connection,
                ssl = excluded.ssl,
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
        .bind(config.auth_source)
        .bind(config.replica_set)
        .bind(config.direct_connection.map(|v| if v { 1 } else { 0 }))
        .bind(config.ssl)
        .bind(ssh_json)
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
                auth_source: row.get("auth_source"),
                replica_set: row.get("replica_set"),
                direct_connection: row
                    .get::<Option<i64>, _>("direct_connection")
                    .map(|v| v != 0),
                ssl: row.get("ssl"),
                ssh_tunnel,
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
}
