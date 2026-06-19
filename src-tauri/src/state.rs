use crate::application::session_service::ConnectionSession;
use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::storage::Storage;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub connections: RwLock<HashMap<String, ConnectionSession>>,
    pub storage: Storage,
}

impl AppState {
    pub async fn new(storage: Storage) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            storage,
        }
    }

    pub async fn add_connection(
        &self,
        id: String,
        driver: Arc<dyn DbDriver>,
        ssh_tunnel: Option<crate::ssh::SshTunnel>,
        transactional: bool,
    ) {
        let mut conns = self.connections.write().await;
        conns.insert(
            id,
            ConnectionSession::new(driver, ssh_tunnel, transactional),
        );
    }

    pub async fn get_connection(&self, id: &str) -> AppResult<Arc<dyn DbDriver>> {
        let mut conns = self.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.touch();
            Ok(session.driver.clone())
        } else {
            Err(crate::error::AppError::Internal(format!(
                "Connection {} not found",
                id
            )))
        }
    }

    pub async fn begin_transaction(&self, id: &str) -> AppResult<()> {
        let mut conns = self.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.touch();
            let begin_sql = match session.driver.db_type() {
                DbType::Postgres => "BEGIN",
                DbType::Mysql | DbType::Mariadb => "START TRANSACTION",
                DbType::Sqlserver => "BEGIN TRANSACTION",
                _ => "BEGIN",
            };
            session.driver.execute(begin_sql).await?;
            Ok(())
        } else {
            Err(crate::error::AppError::Internal(format!(
                "Connection {} not found",
                id
            )))
        }
    }

    pub async fn commit_transaction(&self, id: &str) -> AppResult<()> {
        let mut conns = self.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.touch();
            session.driver.execute("COMMIT").await?;
            if session.transactional {
                let begin_sql = match session.driver.db_type() {
                    DbType::Postgres => "BEGIN",
                    DbType::Mysql | DbType::Mariadb => "START TRANSACTION",
                    DbType::Sqlserver => "BEGIN TRANSACTION",
                    _ => "BEGIN",
                };
                session.driver.execute(begin_sql).await?;
            }
            Ok(())
        } else {
            Err(crate::error::AppError::Internal(format!(
                "Connection {} not found",
                id
            )))
        }
    }

    pub async fn rollback_transaction(&self, id: &str) -> AppResult<()> {
        let mut conns = self.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.touch();
            session.driver.execute("ROLLBACK").await?;
            if session.transactional {
                let begin_sql = match session.driver.db_type() {
                    DbType::Postgres => "BEGIN",
                    DbType::Mysql | DbType::Mariadb => "START TRANSACTION",
                    DbType::Sqlserver => "BEGIN TRANSACTION",
                    _ => "BEGIN",
                };
                session.driver.execute(begin_sql).await?;
            }
            Ok(())
        } else {
            Err(crate::error::AppError::Internal(format!(
                "Connection {} not found",
                id
            )))
        }
    }

    pub async fn remove_connection(&self, id: &str) -> AppResult<()> {
        let mut conns = self.connections.write().await;
        if let Some(session) = conns.remove(id) {
            session.driver.close().await?;
        }
        Ok(())
    }
}
