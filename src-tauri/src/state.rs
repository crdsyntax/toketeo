use crate::application::session_service::ConnectionSession;
use crate::db::{DbDriver, DbType};
use crate::error::AppResult;
use crate::storage::Storage;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

pub struct AppState {
    pub connections: RwLock<HashMap<String, ConnectionSession>>,
    pub storage: Arc<Storage>,
}

impl AppState {
    pub async fn new(storage: Storage) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            storage: Arc::new(storage),
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
            if db_type == DbType::Mongodb {
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

    pub async fn commit_transaction(&self, id: &str) -> AppResult<()> {
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
            if db_type == DbType::Mongodb {
                return Ok(());
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
        Ok(())
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
            if db_type == DbType::Mongodb {
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
