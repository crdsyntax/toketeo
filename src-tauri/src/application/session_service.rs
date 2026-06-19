use crate::db::DbDriver;
use crate::error::AppResult;
use crate::ssh::SshTunnel;
use crate::state::AppState;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Manager;

pub struct ConnectionSession {
    pub driver: Arc<dyn DbDriver>,
    pub ssh_tunnel: Option<SshTunnel>,
    pub transactional: bool,
    pub created_at: Instant,
    pub last_access: Instant,
    pub max_ttl: Option<Duration>,
}

impl ConnectionSession {
    pub fn new(
        driver: Arc<dyn DbDriver>,
        ssh_tunnel: Option<SshTunnel>,
        transactional: bool,
    ) -> Self {
        let now = Instant::now();
        Self {
            driver,
            ssh_tunnel,
            transactional,
            created_at: now,
            last_access: now,
            max_ttl: Some(Duration::from_secs(3600 * 8)), // 8 hours default TTL
        }
    }

    pub fn touch(&mut self) {
        self.last_access = Instant::now();
    }

    pub fn is_expired(&self, idle_timeout: Duration) -> bool {
        let now = Instant::now();
        let idle = now.duration_since(self.last_access) > idle_timeout;
        let ttl_expired = self
            .max_ttl
            .map(|ttl| now.duration_since(self.created_at) > ttl)
            .unwrap_or(false);
        idle || ttl_expired
    }
}

pub struct SessionService;

impl SessionService {
    pub async fn cleanup_sessions(state: &AppState, idle_timeout: Duration) -> AppResult<()> {
        let mut conns = state.connections.write().await;

        let to_remove: Vec<String> = conns
            .iter()
            .filter(|(_, session)| session.is_expired(idle_timeout))
            .map(|(id, _)| id.clone())
            .collect();

        for id in to_remove {
            if let Some(session) = conns.remove(&id) {
                if let Err(e) = session.driver.close().await {
                    eprintln!("Error closing driver for session {}: {:?}", id, e);
                }
            }
        }
        Ok(())
    }

    pub fn spawn_cleanup_task(
        app_handle: tauri::AppHandle,
        interval: Duration,
        idle_timeout: Duration,
    ) {
        tauri::async_runtime::spawn(async move {
            let mut timer = tokio::time::interval(interval);
            loop {
                timer.tick().await;
                let state = app_handle.state::<AppState>();
                if let Err(e) = Self::cleanup_sessions(&state, idle_timeout).await {
                    eprintln!("Session cleanup error: {:?}", e);
                }
            }
        });
    }

    pub async fn get_session_count(state: &AppState) -> usize {
        let conns = state.connections.read().await;
        conns.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbDriver;
    use crate::error::AppResult;
    use crate::models::QueryResult;
    use async_trait::async_trait;

    struct MockDriver;
    #[async_trait]
    impl DbDriver for MockDriver {
        fn db_type(&self) -> crate::db::DbType {
            crate::db::DbType::Postgres
        }
        async fn execute(&self, _: &str) -> AppResult<QueryResult> {
            todo!()
        }
        async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
            todo!()
        }
        async fn fetch_databases(&self) -> AppResult<Vec<String>> {
            todo!()
        }
        async fn fetch_tables(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> AppResult<Vec<String>> {
            todo!()
        }
        async fn fetch_views(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> AppResult<Vec<String>> {
            todo!()
        }
        async fn fetch_procedures(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> AppResult<Vec<String>> {
            todo!()
        }
        async fn fetch_triggers(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> AppResult<Vec<String>> {
            todo!()
        }
        async fn fetch_functions(
            &self,
            _: Option<String>,
            _: Option<String>,
        ) -> AppResult<Vec<String>> {
            todo!()
        }
        async fn fetch_columns(
            &self,
            _: &str,
            _: Option<String>,
        ) -> AppResult<Vec<serde_json::Value>> {
            todo!()
        }
        async fn fetch_indexes(
            &self,
            _: &str,
            _: Option<String>,
        ) -> AppResult<Vec<serde_json::Value>> {
            todo!()
        }
        async fn fetch_foreign_keys(
            &self,
            _: &str,
            _: Option<String>,
        ) -> AppResult<Vec<serde_json::Value>> {
            todo!()
        }
        async fn fetch_constraints(
            &self,
            _: &str,
            _: Option<String>,
        ) -> AppResult<Vec<serde_json::Value>> {
            todo!()
        }
        async fn fetch_ddl(&self, _: &str, _: &str, _: Option<String>) -> AppResult<String> {
            todo!()
        }
        async fn fetch_parameters(
            &self,
            _: &str,
            _: &str,
            _: Option<String>,
        ) -> AppResult<Vec<serde_json::Value>> {
            todo!()
        }
        async fn close(&self) -> AppResult<()> {
            Ok(())
        }
    }

    #[test]
    fn test_session_expiration() {
        let driver = Arc::new(MockDriver);
        let mut session = ConnectionSession::new(driver, None, false);

        // Initial state
        assert!(!session.is_expired(Duration::from_secs(3600)));

        // Fake old access
        session.last_access = Instant::now() - Duration::from_secs(4000);
        assert!(session.is_expired(Duration::from_secs(3600)));

        // Touch should revive
        session.touch();
        assert!(!session.is_expired(Duration::from_secs(3600)));
    }

    #[test]
    fn test_session_ttl_expiration() {
        let driver = Arc::new(MockDriver);
        let mut session = ConnectionSession::new(driver, None, false);
        session.max_ttl = Some(Duration::from_secs(10));

        // Fake old creation
        session.created_at = Instant::now() - Duration::from_secs(20);
        assert!(session.is_expired(Duration::from_secs(3600)));
    }
}
