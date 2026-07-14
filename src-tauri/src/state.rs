use crate::application::session_service::ConnectionSession;
use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::storage::Storage;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Control state for a running sync pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncControl {
    Running,
    Paused,
    Cancelled,
}

/// Thread-safe sync controller that can be shared across tasks.
#[derive(Clone)]
pub struct SyncController {
    inner: Arc<RwLock<HashMap<String, SyncControl>>>,
}

impl SyncController {
    pub fn new() -> Self {
        Self { inner: Arc::new(RwLock::new(HashMap::new())) }
    }

    pub async fn set(&self, pipeline_id: &str, control: SyncControl) {
        self.inner.write().await.insert(pipeline_id.to_string(), control);
    }

    pub async fn get(&self, pipeline_id: &str) -> Option<SyncControl> {
        self.inner.read().await.get(pipeline_id).cloned()
    }

    pub async fn remove(&self, pipeline_id: &str) {
        self.inner.write().await.remove(pipeline_id);
    }
}

pub struct AppState {
    pub connections: RwLock<HashMap<String, ConnectionSession>>,
    pub storage: Arc<Storage>,
    pub master_key: RwLock<Option<[u8; 32]>>,
    pub session_expires_at: RwLock<Option<std::time::Instant>>,
    pub sync_controller: SyncController,
}

impl AppState {
    pub async fn new(storage: Storage) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            storage: Arc::new(storage),
            master_key: RwLock::new(None),
            session_expires_at: RwLock::new(None),
            sync_controller: SyncController::new(),
        }
    }

    pub async fn set_sync_control(&self, pipeline_id: &str, control: SyncControl) {
        self.sync_controller.set(pipeline_id, control).await;
    }

    pub async fn get_sync_control(&self, pipeline_id: &str) -> Option<SyncControl> {
        self.sync_controller.get(pipeline_id).await
    }

    pub async fn remove_sync_control(&self, pipeline_id: &str) {
        self.sync_controller.remove(pipeline_id).await;
    }

    pub async fn require_unlock(&self) -> crate::error::AppResult<[u8; 32]> {
        let key = self.master_key.read().await;
        if let Some(k) = *key {
            let expired = self.session_expires_at.read().await;
            if let Some(exp) = *expired {
                if std::time::Instant::now() > exp {
                    return Err(crate::error::AppError::Unauthorized("Session expired".into()));
                }
            }
            Ok(k)
        } else {
            Err(crate::error::AppError::Unauthorized("Session locked".into()))
        }
    }

    pub async fn set_master_key(&self, key: [u8; 32], timeout_secs: u64) {
        *self.master_key.write().await = Some(key);
        *self.session_expires_at.write().await =
            Some(std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs));
    }

    pub async fn clear_master_key(&self) {
        *self.master_key.write().await = None;
        *self.session_expires_at.write().await = None;
    }

    pub async fn is_session_unlocked(&self) -> bool {
        let key = self.master_key.read().await;
        if key.is_none() {
            return false;
        }
        let expired = self.session_expires_at.read().await;
        if let Some(exp) = *expired {
            std::time::Instant::now() <= exp
        } else {
            true
        }
    }

    pub async fn add_connection(
        &self,
        id: String,
        driver: Arc<dyn DbDriver>,
        ssh_tunnel: Option<crate::ssh::SshTunnel>,
        transactional: bool,
        read_only: bool,
        max_ttl: Option<Duration>,
        metadata_cache_ttl: Duration,
    ) {
        // Remove the old session first so the old driver's pool is NOT dropped
        // inside HashMap::insert (which would trigger Pool::drop → close_inner
        // and leave concurrent Arc holders with a closed pool).
        let old_driver = {
            let mut conns = self.connections.write().await;
            let old = conns.remove(&id);
            conns.insert(
                id,
                ConnectionSession::new(driver, ssh_tunnel, transactional, read_only, max_ttl, metadata_cache_ttl),
            );
            old.map(|s| s.driver)
        };
        // Drop old driver outside the write lock so the pool is closed gracefully.
        if let Some(d) = old_driver {
            let _ = d.close().await;
        }
    }

    pub async fn get_connection(&self, id: &str) -> AppResult<Arc<dyn DbDriver>> {
        // Phase 8: Use read lock to retrieve the driver — avoids blocking concurrent
        // metadata fetches and queries that only need to read the driver Arc.
        let driver = {
            let conns = self.connections.read().await;
            match conns.get(id) {
                Some(session) => session.driver.clone(),
                None => {
                    return Err(crate::error::AppError::Internal(format!(
                        "Connection {} not found",
                        id
                    )));
                }
            }
        };

        // Minimal write lock just to update last_access timestamp.
        {
            let mut conns = self.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
            }
        }

        Ok(driver)
    }

    pub async fn is_read_only(&self, id: &str) -> AppResult<bool> {
        let conns = self.connections.read().await;
        if let Some(session) = conns.get(id) {
            Ok(session.read_only)
        } else {
            Err(crate::error::AppError::Internal(format!(
                "Connection {} not found",
                id
            )))
        }
    }

    pub async fn begin_transaction(&self, id: &str) -> AppResult<()> {
        let db_type;
        let driver;
        {
            let mut conns = self.connections.write().await;
            let session = conns.get_mut(id).ok_or_else(|| {
                crate::error::AppError::Internal(format!("Connection {} not found", id))
            })?;
            session.touch();
            db_type = session.driver.db_type();
            if db_type == DbType::Mongodb || db_type == DbType::Redis {
                return Ok(());
            }
            driver = session.driver.clone();
        }
        let begin_sql = match db_type {
            DbType::Postgres => "BEGIN",
            DbType::Mysql | DbType::Mariadb => "START TRANSACTION",
            DbType::Sqlserver => "BEGIN TRANSACTION",
            _ => "BEGIN",
        };
        driver.execute(begin_sql).await?;
        Ok(())
    }

    pub async fn commit_transaction(&self, id: &str) -> AppResult<u64> {
        let db_type;
        let transactional;
        let driver;
        let accumulated;
        {
            let mut conns = self.connections.write().await;
            let session = conns.get_mut(id).ok_or_else(|| {
                crate::error::AppError::Internal(format!("Connection {} not found", id))
            })?;
            session.touch();
            db_type = session.driver.db_type();
            transactional = session.transactional;
            accumulated = session.accumulated_rows_affected;
            session.accumulated_rows_affected = 0;
            if db_type == DbType::Mongodb || db_type == DbType::Redis {
                return Ok(0);
            }
            driver = session.driver.clone();
        }
        driver.execute("COMMIT").await?;
        if transactional {
            let begin_sql = match db_type {
                DbType::Postgres => "BEGIN",
                DbType::Mysql | DbType::Mariadb => "START TRANSACTION",
                DbType::Sqlserver => "BEGIN TRANSACTION",
                _ => "BEGIN",
            };
            driver.execute(begin_sql).await?;
        }
        Ok(accumulated)
    }

    pub async fn rollback_transaction(&self, id: &str) -> AppResult<()> {
        let db_type;
        let transactional;
        let driver;
        {
            let mut conns = self.connections.write().await;
            let session = conns.get_mut(id).ok_or_else(|| {
                crate::error::AppError::Internal(format!("Connection {} not found", id))
            })?;
            session.touch();
            db_type = session.driver.db_type();
            transactional = session.transactional;
            session.accumulated_rows_affected = 0;
            if db_type == DbType::Mongodb || db_type == DbType::Redis {
                return Ok(());
            }
            driver = session.driver.clone();
        }
        driver.execute("ROLLBACK").await?;
        if transactional {
            let begin_sql = match db_type {
                DbType::Postgres => "BEGIN",
                DbType::Mysql | DbType::Mariadb => "START TRANSACTION",
                DbType::Sqlserver => "BEGIN TRANSACTION",
                _ => "BEGIN",
            };
            driver.execute(begin_sql).await?;
        }
        Ok(())
    }

    pub async fn remove_connection(&self, id: &str) -> AppResult<()> {
        let driver;
        {
            let mut conns = self.connections.write().await;
            if let Some(session) = conns.remove(id) {
                driver = Some(session.driver);
            } else {
                driver = None;
            }
        }
        if let Some(d) = driver {
            d.close().await?;
        }
        Ok(())
    }
}
