use crate::application::audit_service::AuditService;
use crate::application::session_service::{MetadataCacheKey, MetadataKind};
use crate::error::{AppError, AppResult};
use crate::models::QueryResult;
use crate::state::AppState;

/// Maximum allowed page size to prevent runaway queries on large tables.
/// Rule: no more than 1000 rows per page, enforced server-side.
const MAX_PAGE_SIZE: u32 = 1000;

pub struct ExplorerService;

impl ExplorerService {
    fn is_destructive_query(query: &str) -> bool {
        let upper = query.to_uppercase();
        // A simple heuristic for destructive queries. For a robust solution, a proper SQL parser is needed.
        upper.contains("INSERT ") ||
        upper.contains("UPDATE ") ||
        upper.contains("DELETE ") ||
        upper.contains("DROP ") ||
        upper.contains("ALTER ") ||
        upper.contains("CREATE ") ||
        upper.contains("TRUNCATE ") ||
        upper.contains("REPLACE ") ||
        upper.contains("GRANT ") ||
        upper.contains("REVOKE ") ||
        upper.contains(".INSERT") ||
        upper.contains(".UPDATE") ||
        upper.contains(".DELETE") ||
        upper.contains(".DROP")
    }
    pub async fn execute_query(state: &AppState, id: &str, query: &str, schema: Option<String>) -> AppResult<QueryResult> {
        let is_read_only = state.is_read_only(id).await.unwrap_or(false);
        if is_read_only && Self::is_destructive_query(query) {
            return Err(AppError::Validation("Connection is in read-only mode. Destructive queries are disabled.".to_string()));
        }

        let driver = state.get_connection(id).await?;
        let db_type = driver.db_type();
        let start = std::time::Instant::now();

        let final_query = if let Some(ref s) = schema {
            if s.is_empty() {
                query.to_string()
            } else {
                match db_type {
                    // MySQL/MariaDB: pool is rebuilt by switch_schema with DB in URL, no USE needed
                    crate::db::DbType::Mysql | crate::db::DbType::Mariadb => query.to_string(),
                    crate::db::DbType::Postgres => {
                        driver.execute(&format!("SET search_path TO \"{}\";", s)).await?;
                        query.to_string()
                    }
                    _ => query.to_string(),
                }
            }
        } else {
            query.to_string()
        };

        match driver.execute(&final_query).await {
            Ok(result) => {
                let _ = AuditService::log_query(
                    state,
                    id.to_string(),
                    query.to_string(),
                    start.elapsed().as_millis() as u64,
                    "success".to_string(),
                    None,
                )
                .await;

                if Self::is_destructive_query(query) {
                    let mut conns = state.connections.write().await;
                    if let Some(session) = conns.get_mut(id) {
                        session.metadata_cache.clear();
                    }
                }

                Ok(result)
            }
            Err(e) => {
                let _ = AuditService::log_query(
                    state,
                    id.to_string(),
                    query.to_string(),
                    start.elapsed().as_millis() as u64,
                    "error".to_string(),
                    Some(e.to_string()),
                )
                .await;
                Err(e)
            }
        }
    }

    pub async fn get_schemas(state: &AppState, id: &str) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey { object: "*".into(), schema: None, filter: None, kind: MetadataKind::Schemas };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.iter().filter_map(|v| v.as_str().map(String::from)).collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_schemas().await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.iter().map(|s| serde_json::Value::String(s.clone())).collect());
            }
        }
        Ok(data)
    }

    pub async fn get_databases(state: &AppState, id: &str) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey { object: "*".into(), schema: None, filter: None, kind: MetadataKind::Databases };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.iter().filter_map(|v| v.as_str().map(String::from)).collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_databases().await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.iter().map(|s| serde_json::Value::String(s.clone())).collect());
            }
        }
        Ok(data)
    }

    pub async fn get_tables(
        state: &AppState,
        id: &str,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey { object: "*".into(), schema: schema.clone(), filter: filter.clone(), kind: MetadataKind::Tables };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.iter().filter_map(|v| v.as_str().map(String::from)).collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_tables(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.iter().map(|s| serde_json::Value::String(s.clone())).collect());
            }
        }
        Ok(data)
    }

    pub async fn get_views(
        state: &AppState,
        id: &str,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey { object: "*".into(), schema: schema.clone(), filter: filter.clone(), kind: MetadataKind::Views };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.iter().filter_map(|v| v.as_str().map(String::from)).collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_views(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.iter().map(|s| serde_json::Value::String(s.clone())).collect());
            }
        }
        Ok(data)
    }

    pub async fn get_procedures(
        state: &AppState,
        id: &str,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey { object: "*".into(), schema: schema.clone(), filter: filter.clone(), kind: MetadataKind::Procedures };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.iter().filter_map(|v| v.as_str().map(String::from)).collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_procedures(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.iter().map(|s| serde_json::Value::String(s.clone())).collect());
            }
        }
        Ok(data)
    }

    pub async fn get_triggers(
        state: &AppState,
        id: &str,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey { object: "*".into(), schema: schema.clone(), filter: filter.clone(), kind: MetadataKind::Triggers };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.iter().filter_map(|v| v.as_str().map(String::from)).collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_triggers(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.iter().map(|s| serde_json::Value::String(s.clone())).collect());
            }
        }
        Ok(data)
    }

    pub async fn get_functions(
        state: &AppState,
        id: &str,
        schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey { object: "*".into(), schema: schema.clone(), filter: filter.clone(), kind: MetadataKind::Functions };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.iter().filter_map(|v| v.as_str().map(String::from)).collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_functions(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.iter().map(|s| serde_json::Value::String(s.clone())).collect());
            }
        }
        Ok(data)
    }

    // ─── Cached metadata accessors ───────────────────────────────────────────

    pub async fn get_columns(
        state: &AppState,
        id: &str,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let cache_key = MetadataCacheKey {
            object: table.to_string(),
            schema: schema.clone(),
            filter: None,
            kind: MetadataKind::Columns,
        };

        // Check cache first (read lock)
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    tracing::debug!("Metadata cache HIT: columns for {}", table);
                    return Ok(cached.clone());
                }
            }
        }

        // Cache miss — fetch from driver
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_columns(table, schema.clone()).await?;

        // Store in cache (write lock)
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.clone());
            }
        }

        tracing::debug!("Metadata cache MISS + stored: columns for {}", table);
        Ok(data)
    }

    pub async fn get_indexes(
        state: &AppState,
        id: &str,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let cache_key = MetadataCacheKey {
            object: table.to_string(),
            schema: schema.clone(),
            filter: None,
            kind: MetadataKind::Indexes,
        };

        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.clone());
                }
            }
        }

        let driver = state.get_connection(id).await?;
        let data = driver.fetch_indexes(table, schema).await?;

        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.clone());
            }
        }

        Ok(data)
    }

    pub async fn get_foreign_keys(
        state: &AppState,
        id: &str,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let cache_key = MetadataCacheKey {
            object: table.to_string(),
            schema: schema.clone(),
            filter: None,
            kind: MetadataKind::ForeignKeys,
        };

        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.clone());
                }
            }
        }

        let driver = state.get_connection(id).await?;
        let data = driver.fetch_foreign_keys(table, schema).await?;

        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.clone());
            }
        }

        Ok(data)
    }

    pub async fn get_constraints(
        state: &AppState,
        id: &str,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let cache_key = MetadataCacheKey {
            object: table.to_string(),
            schema: schema.clone(),
            filter: None,
            kind: MetadataKind::Constraints,
        };

        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached.clone());
                }
            }
        }

        let driver = state.get_connection(id).await?;
        let data = driver.fetch_constraints(table, schema).await?;

        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(cache_key, data.clone());
            }
        }

        Ok(data)
    }

    /// Invalidate cached metadata for a given table (called after schema mutations).
    pub async fn invalidate_metadata_cache(
        state: &AppState,
        id: &str,
        table: &str,
        schema: Option<&str>,
    ) {
        let mut conns = state.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.metadata_cache.invalidate_table(table, schema);
            session.metadata_cache.invalidate_schema_lists(schema);
        }
    }

    // ─── Non-cached accessors ─────────────────────────────────────────────────

    pub async fn get_ddl(
        state: &AppState,
        id: &str,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<String> {
        let driver = state.get_connection(id).await?;
        driver.fetch_ddl(name, object_type, schema).await
    }

    pub async fn get_parameters(
        state: &AppState,
        id: &str,
        name: &str,
        object_type: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_parameters(name, object_type, schema).await
    }

    // ─── Execute explorer (paginated, capped at MAX_PAGE_SIZE) ────────────────

    pub async fn execute_explorer(
        state: &AppState,
        id: &str,
        database: Option<String>,
        name: &str,
        object_type: String,
        page: u32,
        page_size: u32,
        filter: Option<String>,
    ) -> AppResult<QueryResult> {
        let driver = state.get_connection(id).await?;
        let db_type = driver.db_type();

        // Enforce hard cap: >1000 rows per page is not allowed
        if page_size > MAX_PAGE_SIZE {
            return Err(AppError::Validation(format!(
                "Page size {} exceeds maximum allowed ({} rows). Reduce page size to continue.",
                page_size, MAX_PAGE_SIZE
            )));
        }

        let effective_page_size = page_size.max(1).min(MAX_PAGE_SIZE);
        let effective_page = page.max(1);
        let offset = (effective_page - 1) * effective_page_size;

        let start = std::time::Instant::now();

        // Identifier quoting based on DB type
        let (q_open, q_close, q_esc) = match db_type {
            crate::db::DbType::Postgres => ("\"", "\"", "\"\""),
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => ("`", "`", "``"),
            _ => ("\"", "\"", "\"\""), // Default
        };

        // Handle MongoDB separately
        if matches!(db_type, crate::db::DbType::Mongodb) {
            let mut mongo_query_map = serde_json::Map::new();
            mongo_query_map.insert("collection".to_string(), serde_json::Value::String(name.to_string()));
            
            let mut find_filter = serde_json::json!({});
            if let Some(f) = filter.as_deref().map(str::trim).filter(|f| !f.is_empty()) {
                match serde_json::from_str::<serde_json::Value>(f) {
                    Ok(mut parsed) => {
                        if let Some(o) = parsed.as_object_mut() {
                            if o.contains_key("$find") {
                                find_filter = o.remove("$find").unwrap();
                                if let Some(p) = o.remove("$project") { mongo_query_map.insert("project".to_string(), p); }
                                if let Some(s) = o.remove("$sort") { mongo_query_map.insert("sort".to_string(), s); }
                                if let Some(c) = o.remove("$collation") { mongo_query_map.insert("collation".to_string(), c); }
                                if let Some(h) = o.remove("$hint") { mongo_query_map.insert("hint".to_string(), h); }
                            } else {
                                find_filter = parsed;
                            }
                        } else {
                            find_filter = parsed;
                        }
                    },
                    Err(e) => return Err(crate::error::AppError::Validation(format!("MongoDB filter must be valid JSON: {}", e))),
                }
            }
            
            mongo_query_map.insert("find".to_string(), find_filter);
            mongo_query_map.insert("limit".to_string(), serde_json::json!(effective_page_size as i64));
            mongo_query_map.insert("skip".to_string(), serde_json::json!(offset as i64));
            
            if let Some(db_name) = database {
                mongo_query_map.insert("database".to_string(), serde_json::Value::String(db_name));
            }
            
            let mongo_query = serde_json::Value::Object(mongo_query_map);
            return driver.execute(&mongo_query.to_string()).await;
        }

        let full_name = if let Some(schema) = database.as_ref() {
            format!(
                "{}{}{}.{}{}{}",
                q_open,
                schema.replace(q_close, q_esc),
                q_close,
                q_open,
                name.replace(q_close, q_esc),
                q_close
            )
        } else {
            format!("{}{}{}", q_open, name.replace(q_close, q_esc), q_close)
        };

        let result = match object_type.to_lowercase().as_str() {
            "table" | "view" => {
                // Use cached columns when possible
                let columns = Self::get_columns(state, id, name, database.clone()).await?;
                let col_names: Vec<String> = columns
                    .iter()
                    .filter_map(|c| {
                        c.get("name")
                            .and_then(|v| v.as_str())
                            .map(|s| format!("{}{}{}", q_open, s.replace(q_close, q_esc), q_close))
                    })
                    .collect();

                let select_clause = if col_names.is_empty() {
                    "*".to_string()
                } else {
                    col_names.join(", ")
                };

                let mut query = format!("SELECT {} FROM {}", select_clause, full_name);

                if let Some(f) = filter.as_deref().map(str::trim).filter(|f| !f.is_empty()) {
                    query.push_str(&format!(" WHERE {}", f));
                }

                // Deterministic ordering is required for paginated queries
                let order_by = if col_names.is_empty() {
                    "ORDER BY (SELECT NULL)".to_string() // Fallback
                } else {
                    format!("ORDER BY {}", col_names[0]) // Use first column as basic deterministic order
                };

                query.push_str(&format!(
                    " {} LIMIT {} OFFSET {}",
                    order_by, effective_page_size, offset
                ));

                driver.execute(&query).await
            }
            "procedure" => {
                let query = format!("CALL {}()", full_name);
                driver.execute(&query).await
            }
            _ => Err(AppError::Internal(
                "Unsupported object type for data execution".into(),
            )),
        };

        match result {
            Ok(res) => {
                let _ = AuditService::log_query(
                    state,
                    id.to_string(),
                    format!("Explorer: {}", full_name),
                    start.elapsed().as_millis() as u64,
                    "success".to_string(),
                    None,
                )
                .await;
                Ok(res)
            }
            Err(e) => {
                let _ = AuditService::log_query(
                    state,
                    id.to_string(),
                    format!("Explorer: {}", full_name),
                    start.elapsed().as_millis() as u64,
                    "error".to_string(),
                    Some(e.to_string()),
                )
                .await;
                Err(e)
            }
        }
    }

    pub async fn restore_database(state: &AppState, id: &str, file_path: String) -> AppResult<()> {
        use tokio::fs::File;
        use tokio::io::{AsyncBufReadExt, BufReader};

        let driver = state.get_connection(id).await?;
        let file = File::open(file_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to open dump file: {}", e)))?;

        let mut reader = BufReader::new(file);
        let mut line = String::new();
        let mut current_query = String::new();

        while reader.read_line(&mut line).await? > 0 {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("--") || trimmed.starts_with("/*") {
                line.clear();
                continue;
            }

            current_query.push_str(&line);
            if trimmed.ends_with(';') {
                if let Err(e) = driver.execute(&current_query).await {
                    eprintln!("Error executing restore chunk: {:?}", e);
                }
                current_query.clear();
            }
            line.clear();
        }

        if !current_query.trim().is_empty() {
            let _ = driver.execute(&current_query).await;
        }

        Ok(())
    }

    pub async fn switch_schema(state: &AppState, id: &str, schema: String) -> AppResult<()> {
        let driver = state.get_connection(id).await?;
        let schemas = driver.fetch_schemas().await?;

        if !schemas.contains(&schema) {
            return Err(AppError::Validation(format!(
                "Database '{}' not found",
                schema
            )));
        }

        // For MySQL/MariaDB, schema == database. Rebuild the pool with the new database
        // in the connection URL so all pool connections start on the right database.
        // For other databases, SET search_path / USE would need a single-connection approach.
        match driver.db_type() {
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => {
                drop(driver);
                crate::application::connection_service::ConnectionService::switch_database(state, id, &schema).await?;
            }
            _ => {}
        }

        Ok(())
    }

    pub async fn get_mongo_structure(state: &AppState, id: &str) -> AppResult<serde_json::Value> {
        let driver = state.get_connection(id).await?;
        driver.fetch_mongo_structure().await
    }
}
