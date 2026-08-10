use crate::db::PoolConfig;
use crate::error::AppResult;
use neo4rs::ConfigBuilder;
use std::time::Duration;

/// Default Bolt port used by the tunnel (the driver never knows SSH exists:
/// `ConnectionService::connect` rewrites host/port to the local tunnel).
pub const DEFAULT_BOLT_PORT: u16 = 7687;

/// Builds the `neo4rs` connection config from a Bolt URL plus optional pool
/// settings. Auth (basic) and the default database come from the config, never
/// from the URL (neo4rs ignores credentials embedded in the URI).
pub fn build_config(
    uri: &str,
    user: &str,
    password: &str,
    database: Option<&str>,
    pool_config: Option<&PoolConfig>,
) -> AppResult<neo4rs::Config> {
    let mut builder = ConfigBuilder::default()
        .uri(uri)
        .user(user)
        .password(password)
        .connection_timeout(Duration::from_secs(10));

    if let Some(db) = database {
        if !db.is_empty() {
            builder = builder.db(db);
        }
    }

    if let Some(pool) = pool_config {
        builder = builder.max_connections(pool.max_connections.max(1) as usize);
        if let Some(idle) = pool.idle_timeout {
            builder = builder.idle_timeout(idle);
        }
        if let Some(life) = pool.max_lifetime {
            builder = builder.max_lifetime(life);
        }
    }

    builder
        .build()
        .map_err(|e| crate::error::AppError::Connection(format!("Neo4j config error: {}", e)))
}
