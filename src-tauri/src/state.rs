use crate::application::assistant::context::schema_engine::SchemaEngine;
use crate::application::assistant::tools::tool_engine::ToolEngine;
use crate::application::script::runner::ScriptPromptStore;
use crate::application::session_service::ConnectionSession;
use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::infrastructure::scheduler::job_engine::JobEngine;
use crate::ssh::KnownHostsStore;
use crate::storage::Storage;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncControl {
    Running,
    Paused,
    Cancelled,
}

#[derive(Clone)]
pub struct SyncController {
    inner: Arc<RwLock<HashMap<String, SyncControl>>>,
}

impl Default for SyncController {
    fn default() -> Self {
        Self::new()
    }
}

impl SyncController {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn set(&self, pipeline_id: &str, control: SyncControl) {
        self.inner
            .write()
            .await
            .insert(pipeline_id.to_string(), control);
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
    pub known_hosts: Arc<KnownHostsStore>,
    pub master_key: RwLock<Option<[u8; 32]>>,
    pub session_expires_at: RwLock<Option<std::time::Instant>>,
    pub ui_locked: RwLock<bool>,
    pub secrets_blocked: RwLock<bool>,
    pub sync_controller: SyncController,
    pub compare_controller: SyncController,
    pub job_engine: RwLock<Option<Arc<JobEngine>>>,
    pub schema_engine: SchemaEngine,
    pub tool_engine: ToolEngine,
    pub script_store: ScriptPromptStore,
    pub knowledge_vectors: Arc<crate::application::assistant::knowledge::VectorIndex>,
}

impl AppState {
    pub async fn new(storage: Storage) -> Self {
        let storage = Arc::new(storage);
        let known_hosts = Arc::new(KnownHostsStore::new(storage.clone()));
        Self {
            connections: RwLock::new(HashMap::new()),
            storage: storage.clone(),
            known_hosts,
            master_key: RwLock::new(None),
            session_expires_at: RwLock::new(None),
            ui_locked: RwLock::new(true),
            secrets_blocked: RwLock::new(false),
            sync_controller: SyncController::new(),
            compare_controller: SyncController::new(),
            job_engine: RwLock::new(None),
            schema_engine: SchemaEngine::new(300),
            tool_engine: Self::init_tools(),
            script_store: ScriptPromptStore::new(),
            knowledge_vectors: Arc::new(
                crate::application::assistant::knowledge::VectorIndex::default(),
            ),
        }
    }

    pub fn spawn_index_knowledge(
        storage: &Arc<Storage>,
        vectors: &Arc<crate::application::assistant::knowledge::VectorIndex>,
        case: crate::models::assistant::KnowledgeCase,
    ) {
        let storage = Arc::clone(storage);
        let vectors = Arc::clone(vectors);
        tokio::spawn(async move {
            use crate::application::assistant::knowledge::{EmbeddingProvider, KnowledgeEngine};
            let Ok(configs) = storage.load_provider_configs().await else {
                return;
            };
            let Some(provider) = configs.first().and_then(EmbeddingProvider::from_config) else {
                return;
            };
            KnowledgeEngine::index_case(&storage, &vectors, &provider, &case).await;
        });
    }

    fn init_tools() -> ToolEngine {
        use crate::application::assistant::tools::app_settings_tool::AppSettingsTool;
        use crate::application::assistant::tools::assistant_config_tool::AssistantConfigTool;
        use crate::application::assistant::tools::auto_schema_tool::AutoSchemaTool;
        use crate::application::assistant::tools::backup_tool::BackupTool;
        use crate::application::assistant::tools::codegen_tool::CodegenTool;
        use crate::application::assistant::tools::compare_sessions_tool::CompareSessionsTool;
        use crate::application::assistant::tools::compare_tool::CompareSchemaTool;
        use crate::application::assistant::tools::connection_manage_tool::ConnectionManageTool;
        use crate::application::assistant::tools::connections_tool::ConnectionsTool;
        use crate::application::assistant::tools::data_compare_tool::CompareDataTool;
        use crate::application::assistant::tools::ddl_tool::DdlTool;
        use crate::application::assistant::tools::diagrams_tool::DiagramsTool;
        use crate::application::assistant::tools::explain_tool::ExplainTool;
        use crate::application::assistant::tools::explorer_tool::ExplorerTool;
        use crate::application::assistant::tools::export_tool::ExportTool;
        use crate::application::assistant::tools::history_tool::HistoryTool;
        use crate::application::assistant::tools::index_tool::IndexTool;
        use crate::application::assistant::tools::jobs_tool::JobsTool;
        use crate::application::assistant::tools::knowledge_tool::KnowledgeTool;
        use crate::application::assistant::tools::query_edit_tool::QueryEditTool;
        use crate::application::assistant::tools::query_tool::QueryTool;
        use crate::application::assistant::tools::schema_tool::SchemaTool;
        use crate::application::assistant::tools::sync_tool::SyncTool;
        use crate::application::assistant::tools::transaction_tool::TransactionTool;
        use crate::application::assistant::tools::workspace_tool::WorkspaceTool;

        let mut engine = ToolEngine::new();
        engine.register(Box::new(SchemaTool));
        engine.register(Box::new(IndexTool));
        engine.register(Box::new(ExplainTool));
        engine.register(Box::new(CompareSchemaTool));
        engine.register(Box::new(CompareDataTool));
        engine.register(Box::new(CodegenTool));
        engine.register(Box::new(BackupTool));
        engine.register(Box::new(ExportTool));
        engine.register(Box::new(AutoSchemaTool));
        engine.register(Box::new(SyncTool));
        engine.register(Box::new(ConnectionsTool));
        engine.register(Box::new(ExplorerTool));
        engine.register(Box::new(HistoryTool));
        engine.register(Box::new(KnowledgeTool));
        engine.register(Box::new(AssistantConfigTool));
        engine.register(Box::new(QueryTool));
        engine.register(Box::new(QueryEditTool));
        engine.register(Box::new(TransactionTool));
        engine.register(Box::new(DdlTool));
        engine.register(Box::new(ConnectionManageTool));
        engine.register(Box::new(CompareSessionsTool));
        engine.register(Box::new(JobsTool));
        engine.register(Box::new(DiagramsTool));
        engine.register(Box::new(AppSettingsTool));
        engine.register(Box::new(WorkspaceTool));
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
            return Err(crate::error::AppError::Unauthorized(
                "Session locked".into(),
            ));
        }
        let key = self.master_key.read().await;
        if let Some(k) = *key {
            let expired = self.session_expires_at.read().await;
            if let Some(exp) = *expired {
                if std::time::Instant::now() > exp {
                    return Err(crate::error::AppError::Unauthorized(
                        "Session expired".into(),
                    ));
                }
            }
            Ok(k)
        } else {
            Err(crate::error::AppError::Unauthorized(
                "Session locked".into(),
            ))
        }
    }

    pub async fn get_decryption_key(&self) -> crate::error::AppResult<[u8; 32]> {
        let key = self.master_key.read().await;
        match *key {
            Some(k) => Ok(k),
            None => Err(crate::error::AppError::Unauthorized(
                "Session locked".into(),
            )),
        }
    }

    pub async fn require_session_auth(&self) -> crate::error::AppResult<()> {
        if crate::application::auth_service::check_master_password_exists(&self.storage)
            .await
            .unwrap_or(false)
        {
            self.require_unlock().await?;
        }
        Ok(())
    }

    pub async fn require_secret_auth(&self) -> crate::error::AppResult<()> {
        self.require_session_auth().await?;
        if *self.secrets_blocked.read().await {
            return Err(crate::error::AppError::Unauthorized(
                "Secret reveal locked".into(),
            ));
        }
        Ok(())
    }

    pub async fn lock_secrets(&self) {
        *self.secrets_blocked.write().await = true;
    }

    pub async fn is_secrets_blocked(&self) -> bool {
        *self.secrets_blocked.read().await
    }

    pub async fn set_master_key(&self, key: [u8; 32], timeout_secs: u64) {
        *self.master_key.write().await = Some(key);
        self.storage.set_master_key(key);
        *self.session_expires_at.write().await =
            Some(std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs));
        *self.ui_locked.write().await = false;

        *self.secrets_blocked.write().await = false;
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
        let old_driver = {
            let mut conns = self.connections.write().await;
            let old = conns.remove(&id);
            conns.insert(
                id,
                ConnectionSession::new(
                    driver,
                    ssh_tunnel,
                    transactional,
                    read_only,
                    max_ttl,
                    metadata_cache_ttl,
                ),
            );
            old.map(|s| s.driver)
        };

        if let Some(d) = old_driver {
            let _ = d.close().await;
        }
    }

    pub async fn mark_session_in_use(&self, id: &str, in_use: bool) {
        let mut conns = self.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.in_use = in_use;
            if in_use {
                session.touch();
            }
        }
    }

    pub async fn get_or_connect_driver(&self, conn_id: &str) -> AppResult<Arc<dyn DbDriver>> {
        if let Ok(driver) = self.get_connection(conn_id).await {
            let healthy = match driver.db_type() {
                DbType::Postgres
                | DbType::Mysql
                | DbType::Mariadb
                | DbType::Sqlite
                | DbType::Sqlserver => driver.execute("SELECT 1").await.is_ok(),

                DbType::Mongodb => driver.fetch_databases().await.is_ok(),
                DbType::Redis => driver.execute("PING").await.is_ok(),
            };
            if healthy {
                return Ok(driver);
            }

            tracing::warn!("Connection {conn_id} is stale, reconnecting...");
        }

        let config = self.storage.get_connection(conn_id).await?;

        let _ = self.remove_connection(conn_id).await;
        crate::application::connection_service::ConnectionService::connect(self, config).await?;
        self.get_connection(conn_id).await
    }

    pub async fn get_connection(&self, id: &str) -> AppResult<Arc<dyn DbDriver>> {
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

    pub async fn is_transactional(&self, id: &str) -> AppResult<bool> {
        let conns = self.connections.read().await;
        if let Some(session) = conns.get(id) {
            Ok(session.transactional)
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
