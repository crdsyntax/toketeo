use crate::db::DbDriver;
use crate::error::AppResult;
use crate::ssh::SshTunnel;
use crate::state::AppState;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Manager;

/// Cache key for metadata (columns, indexes, FK, constraints) per table.
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub struct MetadataCacheKey {
    pub object: String,
    pub schema: Option<String>,
    pub filter: Option<String>,
    pub kind: MetadataKind,
}

#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub enum MetadataKind {
    Columns,
    Indexes,
    ForeignKeys,
    Constraints,
    Schemas,
    Databases,
    Tables,
    Views,
    Procedures,
    Triggers,
    Functions,
}

pub struct MetadataCacheEntry {
    pub data: Vec<serde_json::Value>,
    pub cached_at: Instant,
}

/// TTL for metadata cache entries: 5 minutes.
const METADATA_CACHE_TTL: Duration = Duration::from_secs(5 * 60);

pub struct MetadataCache {
    entries: HashMap<MetadataCacheKey, MetadataCacheEntry>,
}

impl MetadataCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    pub fn get(&self, key: &MetadataCacheKey) -> Option<&Vec<serde_json::Value>> {
        self.entries.get(key).and_then(|entry| {
            if entry.cached_at.elapsed() < METADATA_CACHE_TTL {
                Some(&entry.data)
            } else {
                None
            }
        })
    }

    pub fn set(&mut self, key: MetadataCacheKey, data: Vec<serde_json::Value>) {
        self.entries.insert(
            key,
            MetadataCacheEntry {
                data,
                cached_at: Instant::now(),
            },
        );
    }

    pub fn invalidate_table(&mut self, object: &str, schema: Option<&str>) {
        self.entries.retain(|k, _| {
            !(k.object == object && k.schema.as_deref() == schema)
        });
    }

    pub fn invalidate_schema_lists(&mut self, schema: Option<&str>) {
        self.entries.retain(|k, _| {
            !(k.object == "*" && k.schema.as_deref() == schema)
        });
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn evict_expired(&mut self) {
        self.entries.retain(|_, v| v.cached_at.elapsed() < METADATA_CACHE_TTL);
    }
}

pub struct ConnectionSession {
    pub driver: Arc<dyn DbDriver>,
    pub ssh_tunnel: Option<SshTunnel>,
    pub transactional: bool,
    pub read_only: bool,
    pub created_at: Instant,
    pub last_access: Instant,
    pub max_ttl: Option<Duration>,
    pub metadata_cache: MetadataCache,
}

impl ConnectionSession {
    pub fn new(
        driver: Arc<dyn DbDriver>,
        ssh_tunnel: Option<SshTunnel>,
        transactional: bool,
        read_only: bool,
    ) -> Self {
        let now = Instant::now();
        Self {
            driver,
            ssh_tunnel,
            transactional,
            read_only,
            created_at: now,
            last_access: now,
            max_ttl: Some(Duration::from_secs(3600 * 8)), // 8 hours default TTL
            metadata_cache: MetadataCache::new(),
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
                // Also evict expired metadata cache entries on every cleanup cycle
                let mut conns = state.connections.write().await;
                for session in conns.values_mut() {
                    session.metadata_cache.evict_expired();
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

    #[test]
    fn test_metadata_cache_hit() {
        let key = MetadataCacheKey {
            object: "users".into(),
            schema: None,
            filter: None,
            kind: MetadataKind::Columns,
        };
        let mut cache = MetadataCache::new();
        cache.set(key.clone(), vec![serde_json::json!({"name": "id"})]);
        assert!(cache.get(&key).is_some());
    }

    #[test]
    fn test_metadata_cache_invalidation() {
        let mut cache = MetadataCache::new();
        let key = MetadataCacheKey {
            object: "users".into(),
            schema: Some("public".into()),
            filter: None,
            kind: MetadataKind::Columns,
        };
        cache.set(key.clone(), vec![serde_json::json!({"name": "id"})]);
        cache.invalidate_table("users", Some("public"));
        assert!(cache.get(&key).is_none());
    }
}
