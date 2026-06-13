use std::sync::Arc;
use tokio::sync::RwLock;
use crate::error::AppResult;
use crate::storage::Storage;
use crate::db::DbDriver;
use std::collections::HashMap;

pub struct AppState {
    pub connections: RwLock<HashMap<String, Arc<dyn DbDriver>>>,
    pub storage: Storage,
}

impl AppState {
    pub async fn new(storage: Storage) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            storage,
        }
    }

    pub async fn add_connection(&self, id: String, driver: Arc<dyn DbDriver>) {
        let mut conns = self.connections.write().await;
        conns.insert(id, driver);
    }

    pub async fn get_connection(&self, id: &str) -> AppResult<Arc<dyn DbDriver>> {
        let conns = self.connections.read().await;
        conns.get(id)
            .cloned()
            .ok_or_else(|| crate::error::AppError::Internal(format!("Connection {} not found", id)))
    }

    pub async fn remove_connection(&self, id: &str) -> AppResult<()> {
        let mut conns = self.connections.write().await;
        if let Some(driver) = conns.remove(id) {
            driver.close().await?;
        }
        Ok(())
    }
}
