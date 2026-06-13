use sqlx::{sqlite::SqlitePool, Row};
use std::path::PathBuf;
use crate::models::{DbConnectionConfig, SshConfig};
use crate::db::DbType;
use crate::error::AppResult;
use uuid::Uuid;

pub struct Storage {
    pool: SqlitePool,
}

impl Storage {
    pub async fn new(db_path: PathBuf) -> AppResult<Self> {
        let url = format!("sqlite:{}", db_path.to_string_lossy());
        let pool = SqlitePool::connect(&url).await?;

        // Create table if not exists
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
            )"
        )
        .execute(&pool)
        .await?;

        // Migration: Add environment column if it doesn't exist
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN environment TEXT NOT NULL DEFAULT 'local'")
            .execute(&pool)
            .await;

        Ok(Self { pool })
    }

    pub async fn save_connection(&self, config: DbConnectionConfig) -> AppResult<String> {
        let id = config.id.unwrap_or_else(Uuid::new_v4).to_string();
        let ssh_json = config.ssh_tunnel.map(|s| serde_json::to_string(&s).unwrap_or_default());
        let db_type = serde_json::to_value(&config.db_type).unwrap().as_str().unwrap_or("mysql").to_string();

        sqlx::query(
            "INSERT INTO connections (id, name, environment, type, host, port, user, password, database, ssh)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                environment = excluded.environment,
                type = excluded.type,
                host = excluded.host,
                port = excluded.port,
                user = excluded.user,
                password = excluded.password,
                database = excluded.database,
                ssh = excluded.ssh"
        )
        .bind(&id)
        .bind(&config.name)
        .bind(&config.environment)
        .bind(&db_type)
        .bind(&config.host)
        .bind(config.port as i64)
        .bind(&config.user)
        .bind(config.password)
        .bind(config.database)
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

            let db_type: DbType = serde_json::from_value(serde_json::Value::String(db_type_str)).unwrap_or(DbType::Mysql);
            let ssh_tunnel: Option<SshConfig> = ssh_json.and_then(|s| serde_json::from_str(&s).ok());

            connections.push(DbConnectionConfig {
                id: Some(Uuid::parse_str(&id).unwrap_or_default()),
                name: row.get("name"),
                environment: row.get("environment"),
                db_type,
                host: row.get("host"),
                port: row.get::<i64, _>("port") as u16,
                user: row.get("user"),
                password: row.get("password"),
                database: row.get("database"),
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
