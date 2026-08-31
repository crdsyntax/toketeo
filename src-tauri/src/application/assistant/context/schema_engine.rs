use std::collections::HashMap;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::{SchemaContext, SchemaFingerprint};

use super::context_builder::ContextBuilder;

struct CacheEntry {
    ctx: SchemaContext,
    fingerprint: SchemaFingerprint,
    cached_at: Instant,
}

pub struct SchemaEngine {
    cache: RwLock<HashMap<String, CacheEntry>>,
    ttl: Duration,
}

impl SchemaEngine {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    pub async fn get_or_build(
        &self,
        connection_id: &str,
        driver: &dyn DbDriver,
        db_name: Option<&str>,
    ) -> AppResult<SchemaContext> {
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(connection_id) {
                if entry.cached_at.elapsed() < self.ttl {
                    let current = ContextBuilder::compute_fingerprint(&entry.ctx);
                    if current == entry.fingerprint {
                        return Ok(entry.ctx.clone());
                    }
                }
            }
        }

        let ctx = ContextBuilder::build(driver, db_name).await?;
        let fingerprint = ContextBuilder::compute_fingerprint(&ctx);

        let mut cache = self.cache.write().await;

        if cache.len() >= 20 {
            if let Some(oldest_key) = cache
                .iter()
                .min_by_key(|(_, entry)| entry.cached_at)
                .map(|(k, _)| k.clone())
            {
                cache.remove(&oldest_key);
            }
        }

        cache.insert(
            connection_id.to_string(),
            CacheEntry {
                ctx: ctx.clone(),
                fingerprint,
                cached_at: Instant::now(),
            },
        );

        Ok(ctx)
    }

    pub async fn evict_expired(&self) {
        let mut cache = self.cache.write().await;
        let ttl = self.ttl;
        cache.retain(|_, entry| entry.cached_at.elapsed() < ttl);
    }

    pub async fn invalidate(&self, connection_id: &str) {
        self.cache.write().await.remove(connection_id);
    }

    pub async fn clear(&self) {
        self.cache.write().await.clear();
    }

    pub async fn get_cached(&self, connection_id: &str) -> Option<SchemaContext> {
        let cache = self.cache.read().await;
        cache.get(connection_id).map(|e| e.ctx.clone())
    }
}
