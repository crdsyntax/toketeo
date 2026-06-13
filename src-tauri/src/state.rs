use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::error::{AppError, AppResult};
use crate::db::DbDriver;

pub struct AppState {
    pub connections: RwLock<HashMap<String, Arc<dyn DbDriver>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
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
            .ok_or_else(|| AppError::Internal(format!("Connection {} not found", id)))
    }

    pub async fn remove_connection(&self, id: &str) -> AppResult<()> {
        let mut conns = self.connections.write().await;
        if let Some(driver) = conns.remove(id) {
            driver.close().await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use crate::models::QueryResult;

    struct MockDriver;

    #[async_trait]
    impl DbDriver for MockDriver {
        async fn execute(&self, _query: &str) -> AppResult<QueryResult> {
            Ok(QueryResult { columns: vec![], rows: vec![], execution_time_ms: 0 })
        }
        async fn fetch_tables(&self) -> AppResult<Vec<String>> {
            Ok(vec![])
        }
        async fn close(&self) -> AppResult<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_app_state_management() {
        let state = AppState::new();
        let id = "test-id".to_string();
        let driver = Arc::new(MockDriver);

        state.add_connection(id.clone(), driver).await;
        
        let retrieved = state.get_connection(&id).await;
        assert!(retrieved.is_ok());

        state.remove_connection(&id).await.unwrap();
        let retrieved_after = state.get_connection(&id).await;
        assert!(retrieved_after.is_err());
    }
}
