use crate::application::assistant::context::schema_engine::SchemaEngine;
use crate::application::assistant::tools::tool_engine::ToolEngine;
use crate::application::session_service::ConnectionSession;
use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::infrastructure::scheduler::job_engine::JobEngine;
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
    pub ui_locked: RwLock<bool>,
    pub sync_controller: SyncController,
    pub compare_controller: SyncController,
    pub job_engine: RwLock<Option<Arc<JobEngine>>>,
    pub schema_engine: SchemaEngine,
    pub tool_engine: ToolEngine,
}

impl AppState {
    pub async fn new(storage: Storage) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            storage: Arc::new(storage),
            master_key: RwLock::new(None),
            session_expires_at: RwLock::new(None),
            ui_locked: RwLock::new(true),
            sync_controller: SyncController::new(),
            compare_controller: SyncController::new(),
            job_engine: RwLock::new(None),
            schema_engine: SchemaEngine::new(300),
            tool_engine: Self::init_tools(),
        }
    }

    fn init_tools() -> ToolEngine {
        use crate::application::assistant::tools::schema_tool::SchemaTool;
        use crate::application::assistant::tools::index_tool::IndexTool;
        use crate::application::assistant::tools::explain_tool::ExplainTool;
        use crate::application::assistant::tools::compare_tool::CompareSchemaTool;
        use crate::application::assistant::tools::data_compare_tool::CompareDataTool;
        use crate::application::assistant::tools::codegen_tool::CodegenTool;

        let mut engine = ToolEngine::new();
        engine.register(Box::new(SchemaTool));
        engine.register(Box::new(IndexTool));
        engine.register(Box::new(ExplainTool));
        engine.register(Box::new(CompareSchemaTool));
        engine.register(Box::new(CompareDataTool));
        engine.register(Box::new(CodegenTool));
        engine
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

    pub async fn set_compare_control(&self, compare_id: &str, control: SyncControl) {
        self.compare_controller.set(compare_id, control).await;
    }

    pub async fn get_compare_control(&self, compare_id: &str) -> Option<SyncControl> {
        self.compare_controller.get(compare_id).await
    }

    pub async fn remove_compare_control(&self, compare_id: &str) {
        self.compare_controller.remove(compare_id).await;
    }

    pub async fn require_unlock(&self) -> crate::error::AppResult<[u8; 32]> {
        let locked = self.ui_locked.read().await;
        if *locked {
            return Err(crate::error::AppError::Unauthorized("Session locked".into()));
        }
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

    /// Returns the master key for decryption purposes (connect, reconnect, etc.)
    /// regardless of UI lock state. The key must have been derived at least once
    /// since app start.
    pub async fn get_decryption_key(&self) -> crate::error::AppResult<[u8; 32]> {
        let key = self.master_key.read().await;
        match *key {
            Some(k) => Ok(k),
            None => Err(crate::error::AppError::Unauthorized("Session locked".into())),
        }
    }

    pub async fn set_master_key(&self, key: [u8; 32], timeout_secs: u64) {
        *self.master_key.write().await = Some(key);
        self.storage.set_master_key(key);
        *self.session_expires_at.write().await =
            Some(std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs));
        *self.ui_locked.write().await = false;
    }

    pub async fn clear_master_key(&self) {
        *self.master_key.write().await = None;
        *self.session_expires_at.write().await = None;
        *self.ui_locked.write().await = true;
    }

    pub async fn is_session_unlocked(&self) -> bool {
        let locked = self.ui_locked.read().await;
        if *locked {
            return false;
        }
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

    /// Mark a session as in-use so cleanup_sessions will not close it mid-operation.
    pub async fn mark_session_in_use(&self, id: &str, in_use: bool) {
        let mut conns = self.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.in_use = in_use;
            if in_use {
                session.touch();
            }
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
