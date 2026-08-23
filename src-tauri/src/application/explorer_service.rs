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
        upper.contains("INSERT ")
            || upper.contains("UPDATE ")
            || upper.contains("DELETE ")
            || upper.contains("DROP ")
            || upper.contains("ALTER ")
            || upper.contains("CREATE ")
            || upper.contains("TRUNCATE ")
            || upper.contains("REPLACE ")
            || upper.contains("GRANT ")
            || upper.contains("REVOKE ")
            || upper.contains(".INSERT")
            || upper.contains(".UPDATE")
            || upper.contains(".DELETE")
            || upper.contains(".DROP")
    }
    pub async fn execute_query(
        state: &AppState,
        id: &str,
        query: &str,
        schema: Option<String>,
    ) -> AppResult<QueryResult> {
        Self::execute_query_with_origin(state, id, query, schema, "user").await
    }

    /// Same as [execute_query] but attributes the audit entry to `origin`
    /// (e.g. "assistant") so the audit log can distinguish who ran it.
    pub async fn execute_query_with_origin(
        state: &AppState,
        id: &str,
        query: &str,
        schema: Option<String>,
        origin: &str,
    ) -> AppResult<QueryResult> {
        let is_read_only = state.is_read_only(id).await.unwrap_or(false);
        if is_read_only && Self::is_destructive_query(query) {
            return Err(AppError::Validation(
                "Connection is in read-only mode. Destructive queries are disabled.".to_string(),
            ));
        }

        let driver = state.get_connection(id).await?;
        let db_type = driver.db_type();
        let start = std::time::Instant::now();

        let mut use_schema_context = false;
        let final_query = if let Some(ref s) = schema {
            if s.is_empty() {
                query.to_string()
            } else {
                match db_type {
                    crate::db::DbType::Mysql
                    | crate::db::DbType::Mariadb
                    | crate::db::DbType::Postgres => {
                        use_schema_context = true;
                        query.to_string()
                    }
                    crate::db::DbType::Mongodb => {
                        // Inject the database name into MongoDB JSON commands
                        if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(query) {
                            if let Some(obj) = json_val.as_object_mut() {
                                if !obj.contains_key("database") {
                                    let clean_db = s.trim_end_matches(';').trim().to_string();
                                    obj.insert(
                                        "database".to_string(),
                                        serde_json::Value::String(clean_db),
                                    );
                                    serde_json::to_string(&json_val)
                                        .unwrap_or_else(|_| query.to_string())
                                } else {
                                    query.to_string()
                                }
                            } else {
                                query.to_string()
                            }
                        } else {
                            query.to_string()
                        }
                    }
                    _ => query.to_string(),
                }
            }
        } else {
            query.to_string()
        };

        tracing::info!(
            "[ExplorerService] execute_query: db_type={:?}, schema={:?}, initial_query={}",
            db_type,
            schema,
            query
        );

        // Handle MongoDB use <db> command — switch the connection's database
        if db_type == crate::db::DbType::Mongodb {
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&final_query) {
                if let Some(obj) = json_val.as_object() {
                    if let Some(use_db) = obj
                        .get("use")
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim_end_matches(';').trim().to_string())
                    {
                        crate::application::connection_service::ConnectionService::switch_database(
                            state, id, &use_db,
                        )
                        .await?;
                        return Ok(QueryResult {
                            columns: vec!["message".to_string()],
                            column_types: None,
                            rows: vec![
                                serde_json::json!({"message": format!("Switched to db {}", use_db), "db": use_db}),
                            ],
                            execution_time_ms: start.elapsed().as_millis() as u64,
                            primary_keys: None,
                            rows_affected: 0,

                            next_cursor: None,
                        });
                    }
                }
            }
        }

        let result = if use_schema_context {
            if let Some(ref s) = schema {
                driver.execute_with_schema(&final_query, s).await
            } else {
                driver.execute(&final_query).await
            }
        } else {
            driver.execute(&final_query).await
        };

        match result {
            Ok(result) => {
                let _ = AuditService::log_query_with_origin(
                    state,
                    id.to_string(),
                    query.to_string(),
                    start.elapsed().as_millis() as u64,
                    "success".to_string(),
                    None,
                    origin,
                )
                .await;

                if Self::is_destructive_query(query) {
                    let mut conns = state.connections.write().await;
                    if let Some(session) = conns.get_mut(id) {
                        session.metadata_cache.clear();
                        session.accumulated_rows_affected += result.rows_affected;
                    }
                }

                Ok(result)
            }
            Err(e) => {
                let _ = AuditService::log_query_with_origin(
                    state,
                    id.to_string(),
                    query.to_string(),
                    start.elapsed().as_millis() as u64,
                    "error".to_string(),
                    Some(e.to_string()),
                    origin,
                )
                .await;
                Err(e)
            }
        }
    }

    pub async fn get_schemas(state: &AppState, id: &str) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey {
            object: "*".into(),
            schema: None,
            filter: None,
            kind: MetadataKind::Schemas,
        };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_schemas().await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(
                    cache_key,
                    data.iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                );
            }
        }
        Ok(data)
    }

    pub async fn get_databases(state: &AppState, id: &str) -> AppResult<Vec<String>> {
        let cache_key = MetadataCacheKey {
            object: "*".into(),
            schema: None,
            filter: None,
            kind: MetadataKind::Databases,
        };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_databases().await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(
                    cache_key,
                    data.iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                );
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
        let cache_key = MetadataCacheKey {
            object: "*".into(),
            schema: schema.clone(),
            filter: filter.clone(),
            kind: MetadataKind::Tables,
        };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_tables(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(
                    cache_key,
                    data.iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                );
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
        let cache_key = MetadataCacheKey {
            object: "*".into(),
            schema: schema.clone(),
            filter: filter.clone(),
            kind: MetadataKind::Views,
        };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_views(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(
                    cache_key,
                    data.iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                );
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
        let cache_key = MetadataCacheKey {
            object: "*".into(),
            schema: schema.clone(),
            filter: filter.clone(),
            kind: MetadataKind::Procedures,
        };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_procedures(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(
                    cache_key,
                    data.iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                );
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
        let cache_key = MetadataCacheKey {
            object: "*".into(),
            schema: schema.clone(),
            filter: filter.clone(),
            kind: MetadataKind::Triggers,
        };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_triggers(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(
                    cache_key,
                    data.iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                );
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
        let cache_key = MetadataCacheKey {
            object: "*".into(),
            schema: schema.clone(),
            filter: filter.clone(),
            kind: MetadataKind::Functions,
        };
        {
            let conns = state.connections.read().await;
            if let Some(session) = conns.get(id) {
                if let Some(cached) = session.metadata_cache.get(&cache_key) {
                    return Ok(cached
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect());
                }
            }
        }
        let driver = state.get_connection(id).await?;
        let data = driver.fetch_functions(schema, filter).await?;
        {
            let mut conns = state.connections.write().await;
            if let Some(session) = conns.get_mut(id) {
                session.touch();
                session.metadata_cache.set(
                    cache_key,
                    data.iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                );
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

    pub async fn get_referenced_by_keys(
        state: &AppState,
        id: &str,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let cache_key = MetadataCacheKey {
            object: table.to_string(),
            schema: schema.clone(),
            filter: None,
            kind: MetadataKind::ReferencedByKeys,
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
        let data = driver.fetch_referenced_by_keys(table, schema).await?;

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

    /// Clear the entire metadata cache for a connection (called on manual refresh).
    pub async fn clear_metadata_cache(state: &AppState, id: &str) {
        let mut conns = state.connections.write().await;
        if let Some(session) = conns.get_mut(id) {
            session.metadata_cache.clear();
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

        let effective_page_size = page_size.clamp(1, MAX_PAGE_SIZE);
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
            mongo_query_map.insert(
                "collection".to_string(),
                serde_json::Value::String(name.to_string()),
            );

            fn fix_mongo_shell_json(s: &str) -> String {
                let s = s.trim();
                let wrapped = if !s.starts_with('{') && !s.starts_with('[') {
                    format!("{{{}}}", s)
                } else {
                    s.to_string()
                };
                let re = regex::Regex::new(r#"([\{,]\s*)([a-zA-Z_]\w*)(\s*:)"#).unwrap();
                re.replace_all(&wrapped, r#"$1"$2"$3"#).to_string()
            }

            fn fix_mongo_shell_types(s: &str) -> String {
                let re_oid =
                    regex::Regex::new(r#"ObjectId\(\s*["']([0-9a-fA-F]{24})["']\s*\)"#).unwrap();
                let re_numlong =
                    regex::Regex::new(r#"NumberLong\(\s*["']?(\d+)["']?\s*\)"#).unwrap();
                let re_numint =
                    regex::Regex::new(r#"NumberInt\(\s*["']?(-?\d+)["']?\s*\)"#).unwrap();
                let re_numdec =
                    regex::Regex::new(r#"NumberDecimal\(\s*["']([0-9.]+)["']\s*\)"#).unwrap();
                let re_isodate = regex::Regex::new(r#"ISODate\(\s*["']([^"']+)["']\s*\)"#).unwrap();
                let re_timestamp =
                    regex::Regex::new(r#"Timestamp\(\s*(\d+)\s*,\s*(\d+)\s*\)"#).unwrap();
                let s = re_oid.replace_all(s, r#"{"$oid":"$1"}"#);
                let s = re_numlong.replace_all(&s, r#"{"$numberLong":"$1"}"#);
                let s = re_numint.replace_all(&s, r#"{"$numberInt":"$1"}"#);
                let s = re_numdec.replace_all(&s, r#"{"$numberDecimal":"$1"}"#);
                let s = re_isodate.replace_all(&s, r#"{"$date":"$1"}"#);
                let s = re_timestamp.replace_all(&s, r#"{"$timestamp":{"t":$2,"i":$1}}"#);
                s.to_string()
            }

            fn coerce_id_values(val: &mut serde_json::Value) {
                if let Some(obj) = val.as_object_mut() {
                    let keys: Vec<String> = obj.keys().cloned().collect();
                    for key in keys {
                        if key == "_id" {
                            if let Some(serde_json::Value::String(s)) = obj.get(&key) {
                                if is_oid_hex(s) {
                                    obj.insert("_id".to_string(), serde_json::json!({ "$oid": s }));
                                }
                            }
                        } else if let Some(v) = obj.get_mut(&key) {
                            coerce_id_values(v);
                        }
                    }
                } else if let Some(arr) = val.as_array_mut() {
                    for item in arr.iter_mut() {
                        coerce_id_values(item);
                    }
                }
            }

            fn is_oid_hex(s: &str) -> bool {
                s.len() == 24 && s.chars().all(|c| c.is_ascii_hexdigit())
            }

            fn parse_mongo_field(
                value: serde_json::Value,
                label: &str,
            ) -> AppResult<serde_json::Value> {
                let raw = match &value {
                    serde_json::Value::String(s) => s.clone(),
                    other => return Ok(other.clone()),
                };
                if raw.trim().is_empty() {
                    return match label {
                        "find" => Ok(serde_json::json!({})),
                        _ => Err(AppError::Validation(format!(
                            "${} value cannot be empty",
                            label
                        ))),
                    };
                }
                let raw = fix_mongo_shell_types(&raw);
                match serde_json::from_str::<serde_json::Value>(&raw) {
                    Ok(v) => Ok(v),
                    Err(_) => {
                        let fixed = fix_mongo_shell_json(&raw);
                        match serde_json::from_str::<serde_json::Value>(&fixed) {
                            Ok(v) => Ok(v),
                            Err(e) => Err(AppError::Validation(
                                format!("${} has invalid syntax: {}. Use JSON format like {{\"field\": value}}", label, e)
                            )),
                        }
                    }
                }
            }

            fn collect_field_keys(value: &serde_json::Value) -> Vec<String> {
                let mut keys = Vec::new();
                if let serde_json::Value::Object(map) = value {
                    for k in map.keys() {
                        if !k.starts_with('$') {
                            keys.push(k.clone());
                        }
                    }
                }
                keys
            }

            fn find_closest<'a>(name: &str, known: &[&'a str]) -> Option<&'a str> {
                let name_lower = name.to_lowercase();
                known
                    .iter()
                    .map(|k| (k, strsim::levenshtein(&name_lower, &k.to_lowercase())))
                    .filter(|(_, d)| *d <= 3)
                    .min_by_key(|(_, d)| *d)
                    .map(|(k, _)| *k)
            }

            let mut find_filter = serde_json::json!({});
            if let Some(f) = filter.as_deref().map(str::trim).filter(|f| !f.is_empty()) {
                let fixed = fix_mongo_shell_types(f);
                match serde_json::from_str::<serde_json::Value>(&fixed) {
                    Ok(mut parsed) => {
                        if let Some(o) = parsed.as_object_mut() {
                            if o.contains_key("$find")
                                || o.contains_key("$project")
                                || o.contains_key("$sort")
                                || o.contains_key("$collation")
                                || o.contains_key("$hint")
                            {
                                find_filter = parse_mongo_field(
                                    o.remove("$find").unwrap_or(serde_json::json!({})),
                                    "find",
                                )?;
                                if let Some(p) = o.remove("$project") {
                                    mongo_query_map.insert(
                                        "project".to_string(),
                                        parse_mongo_field(p, "project")?,
                                    );
                                }
                                if let Some(s) = o.remove("$sort") {
                                    mongo_query_map
                                        .insert("sort".to_string(), parse_mongo_field(s, "sort")?);
                                }
                                if let Some(c) = o.remove("$collation") {
                                    mongo_query_map.insert(
                                        "collation".to_string(),
                                        parse_mongo_field(c, "collation")?,
                                    );
                                }
                                if let Some(h) = o.remove("$hint") {
                                    mongo_query_map
                                        .insert("hint".to_string(), parse_mongo_field(h, "hint")?);
                                }
                            } else {
                                find_filter = parsed;
                            }
                        } else {
                            find_filter = parsed;
                        }
                    }
                    Err(e) => {
                        return Err(AppError::Validation(format!(
                            "MongoDB filter must be valid JSON: {}",
                            e
                        )))
                    }
                }
            }

            coerce_id_values(&mut find_filter);

            // Validate field names against known columns
            let find_keys = collect_field_keys(&find_filter);
            let project_keys = mongo_query_map
                .get("project")
                .map(collect_field_keys)
                .unwrap_or_default();
            let sort_keys = mongo_query_map
                .get("sort")
                .map(collect_field_keys)
                .unwrap_or_default();
            let all_keys: std::collections::BTreeSet<&str> = find_keys
                .iter()
                .chain(project_keys.iter())
                .chain(sort_keys.iter())
                .map(|s| s.as_str())
                .collect();

            if !all_keys.is_empty() {
                let columns = driver.fetch_columns(name, database.clone()).await?;
                let known: Vec<&str> = columns
                    .iter()
                    .filter_map(|c| c.get("name").and_then(|n| n.as_str()))
                    .collect();

                for key in all_keys {
                    if !known.contains(&key) {
                        let suggestion = find_closest(key, &known);
                        let msg = match suggestion {
                            Some(s) => format!("Unknown field '{}'. Did you mean '{}'?", key, s),
                            None => format!(
                                "Unknown field '{}'. Available fields: {}",
                                key,
                                known.join(", ")
                            ),
                        };
                        return Err(AppError::Validation(msg));
                    }
                }
            }

            mongo_query_map.insert("find".to_string(), find_filter);
            mongo_query_map.insert(
                "limit".to_string(),
                serde_json::json!(effective_page_size as i64),
            );
            mongo_query_map.insert("skip".to_string(), serde_json::json!(offset as i64));

            if let Some(db_name) = database {
                mongo_query_map.insert("database".to_string(), serde_json::Value::String(db_name));
            }

            let mongo_query = serde_json::Value::Object(mongo_query_map);
            return driver.execute(&mongo_query.to_string()).await;
        }

        // Handle Redis separately
        if matches!(db_type, crate::db::DbType::Redis) {
            let query_str =
                if let Some(f) = filter.as_deref().map(str::trim).filter(|f| !f.is_empty()) {
                    f.to_string()
                } else {
                    format!(
                        "SCAN {} MATCH {}:* COUNT {}",
                        offset, name, effective_page_size
                    )
                };
            return driver.execute(&query_str).await;
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

    pub async fn dump_schema(
        state: &AppState,
        id: &str,
        schema: &str,
        selection: &crate::models::DumpSelection,
        file_path: &str,
    ) -> AppResult<()> {
        use tokio::io::AsyncWriteExt;

        let driver = state.get_connection(id).await?;
        let db_type = driver.db_type();

        let (q_open, q_close, q_esc) = match db_type {
            crate::db::DbType::Postgres => ("\"", "\"", "\"\""),
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => ("`", "`", "``"),
            _ => ("\"", "\"", "\"\""),
        };

        let schema_quoted = format!("{}{}{}", q_open, schema.replace(q_close, q_esc), q_close);
        let mut output = String::new();

        output.push_str(&format!(
            "-- Toketeo dump of schema {}\n--\n\n",
            schema_quoted
        ));

        if matches!(db_type, crate::db::DbType::Postgres) {
            output.push_str(&format!("SET search_path TO {};\n\n", schema_quoted));
        }

        // Helper to filter names from all available
        let filter_names = |all: Vec<String>, selected: &[String]| -> Vec<String> {
            if selected.is_empty() {
                all
            } else {
                all.into_iter().filter(|n| selected.contains(n)).collect()
            }
        };

        let all_objs = driver.fetch_tables(Some(schema.to_string()), None).await?;
        for table in filter_names(all_objs, &selection.tables) {
            let tbl_quoted = format!("{}{}{}", q_open, table.replace(q_close, q_esc), q_close);
            let full_name = format!("{}.{}", schema_quoted, tbl_quoted);

            let ddl_ok = match driver
                .fetch_ddl(&table, "table", Some(schema.to_string()))
                .await
            {
                Ok(ddl) => {
                    output.push_str(&format!(
                        "--\n-- DDL for table {}\n--\n\n{}\n\n",
                        full_name, ddl
                    ));
                    true
                }
                Err(e) => {
                    output.push_str(&format!(
                        "-- Error getting DDL for {}: {} — skipping data\n\n",
                        full_name, e
                    ));
                    false
                }
            };

            if ddl_ok {
                let query = format!("SELECT * FROM {}", full_name);
                match driver.execute(&query).await {
                    Ok(result) => {
                        if !result.rows.is_empty() {
                            let columns: Vec<String> = result
                                .columns
                                .iter()
                                .map(|c| {
                                    format!("{}{}{}", q_open, c.replace(q_close, q_esc), q_close)
                                })
                                .collect();
                            let col_list = columns.join(", ");
                            output
                                .push_str(&format!("--\n-- Data for table {}\n--\n\n", full_name));
                            for row in &result.rows {
                                if let Some(obj) = row.as_object() {
                                    let values: Vec<String> = result
                                        .columns
                                        .iter()
                                        .map(|col| {
                                            let v =
                                                obj.get(col).unwrap_or(&serde_json::Value::Null);
                                            match v {
                                                serde_json::Value::Null => "NULL".to_string(),
                                                serde_json::Value::String(s) => {
                                                    format!("'{}'", s.replace('\'', "''"))
                                                }
                                                serde_json::Value::Number(n) => n.to_string(),
                                                serde_json::Value::Bool(b) => {
                                                    if *b {
                                                        "TRUE".to_string()
                                                    } else {
                                                        "FALSE".to_string()
                                                    }
                                                }
                                                other => format!(
                                                    "'{}'",
                                                    other.to_string().replace('\'', "''")
                                                ),
                                            }
                                        })
                                        .collect();
                                    output.push_str(&format!(
                                        "INSERT INTO {} ({}) VALUES ({});\n",
                                        full_name,
                                        col_list,
                                        values.join(", ")
                                    ));
                                }
                            }
                            output.push('\n');
                        }
                    }
                    Err(e) => output.push_str(&format!(
                        "-- Error getting data for {}: {}\n\n",
                        full_name, e
                    )),
                }
            }
        }

        macro_rules! dump_ddl {
            ($obj_type:literal, $all_fetch:expr, $selected:expr) => {
                let all_objs = $all_fetch;
                for name in filter_names(all_objs, $selected) {
                    let q = format!("{}{}{}", q_open, name.replace(q_close, q_esc), q_close);
                    let full = format!("{}.{}", schema_quoted, q);
                    match driver
                        .fetch_ddl(&name, $obj_type, Some(schema.to_string()))
                        .await
                    {
                        Ok(ddl) => output.push_str(&format!(
                            "--\n-- DDL for {} {}\n--\n\n{}\n\n",
                            $obj_type, full, ddl
                        )),
                        Err(e) => output.push_str(&format!(
                            "-- Error getting DDL for {} {}: {}\n\n",
                            $obj_type, full, e
                        )),
                    }
                }
            };
        }

        dump_ddl!(
            "view",
            driver.fetch_views(Some(schema.to_string()), None).await?,
            &selection.views
        );
        dump_ddl!(
            "trigger",
            driver
                .fetch_triggers(Some(schema.to_string()), None)
                .await?,
            &selection.triggers
        );
        dump_ddl!(
            "procedure",
            driver
                .fetch_procedures(Some(schema.to_string()), None)
                .await?,
            &selection.procedures
        );
        dump_ddl!(
            "function",
            driver
                .fetch_functions(Some(schema.to_string()), None)
                .await?,
            &selection.functions
        );

        let mut file = tokio::fs::File::create(file_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to create dump file: {}", e)))?;

        file.write_all(output.as_bytes())
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write dump file: {}", e)))?;

        Ok(())
    }

    pub async fn restore_database(state: &AppState, id: &str, file_path: String) -> AppResult<()> {
        use tokio::fs::File;
        use tokio::io::{AsyncBufReadExt, BufReader};

        let driver = state.get_connection(id).await?;

        // On a transactional session (production) the restore runs INSIDE the
        // session transaction: no own BEGIN/COMMIT, so nothing persists until
        // the user presses Commit. Otherwise begin an atomic restore when
        // possible (Postgres DDL is transactional).
        let transactional = state.is_transactional(id).await.unwrap_or(false);
        if !transactional {
            let _ = driver.execute("BEGIN").await;
        }

        let file = File::open(file_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to open dump file: {}", e)))?;

        let mut reader = BufReader::new(file);
        let mut line = String::new();
        let mut current_query = String::new();
        let mut errors = Vec::new();

        while reader.read_line(&mut line).await? > 0 {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("--") || trimmed.starts_with("/*") {
                line.clear();
                continue;
            }

            current_query.push_str(&line);
            if trimmed.ends_with(';') {
                if let Err(e) = driver.execute(&current_query).await {
                    errors.push(format!(
                        "Error in statement near '{}': {}",
                        &trimmed[..trimmed.len().min(80)],
                        e
                    ));
                }
                current_query.clear();
            }
            line.clear();
        }

        if !current_query.trim().is_empty() {
            if let Err(e) = driver.execute(&current_query).await {
                errors.push(format!("Error in trailing statement: {}", e));
            }
        }

        if !errors.is_empty() {
            if !transactional {
                let _ = driver.execute("ROLLBACK").await;
            }
            return Err(AppError::Internal(format!(
                "Restore completed with {} error(s). First error: {}",
                errors.len(),
                errors[0]
            )));
        }

        if !transactional {
            let _ = driver.execute("COMMIT").await;
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
                crate::application::connection_service::ConnectionService::switch_database(
                    state, id, &schema,
                )
                .await?;
            }
            _ => {}
        }

        Ok(())
    }

    pub async fn get_mongo_structure(state: &AppState, id: &str) -> AppResult<serde_json::Value> {
        let driver = state.get_connection(id).await?;
        driver.fetch_mongo_structure().await
    }

    /// Fetch metadata for selected tables in a schema diagram.
    /// Only fetches columns + foreign keys for the specified table names.
    /// Returns tables with columns + foreign keys.
    pub async fn get_schema_diagram_data(
        state: &AppState,
        id: &str,
        schema: &str,
        table_names: Vec<String>,
    ) -> AppResult<serde_json::Value> {
        let mut tables_data = Vec::with_capacity(table_names.len());
        for name in &table_names {
            let (columns, foreign_keys) = tokio::join!(
                Self::get_columns(state, id, name, Some(schema.to_string())),
                Self::get_foreign_keys(state, id, name, Some(schema.to_string())),
            );
            tables_data.push(serde_json::json!({
                "name": name,
                "columns": columns.unwrap_or_default(),
                "foreign_keys": foreign_keys.unwrap_or_default(),
            }));
        }

        Ok(serde_json::json!({
            "tables": tables_data,
        }))
    }

    /// Fetch table sizes in bytes for a given schema.
    /// Returns a map of table_name -> size_bytes.
    pub async fn get_table_sizes(
        state: &AppState,
        id: &str,
        schema: &str,
    ) -> AppResult<Vec<(String, i64)>> {
        let driver = state.get_connection(id).await?;
        let db_type = driver.db_type();

        match db_type {
            crate::db::DbType::Postgres => {
                let result = driver
                    .execute(&format!(
                        "SELECT relname AS table_name, pg_total_relation_size(relid) AS size \
                         FROM pg_catalog.pg_statio_user_tables \
                         WHERE schemaname = '{}' ORDER BY relname",
                        schema.replace('\'', "''")
                    ))
                    .await?;
                let sizes = result
                    .rows
                    .iter()
                    .filter_map(|row| {
                        let arr = row.as_array()?;
                        let name = arr.first()?.as_str()?.to_string();
                        let size = arr.get(1).and_then(|v| v.as_i64()).unwrap_or(0);
                        Some((name, size))
                    })
                    .collect();
                Ok(sizes)
            }
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => {
                let result = driver
                    .execute(&format!(
                        "SELECT TABLE_NAME, (DATA_LENGTH + INDEX_LENGTH) AS size \
                         FROM information_schema.TABLES \
                         WHERE TABLE_SCHEMA = '{}' AND TABLE_TYPE = 'BASE TABLE' \
                         ORDER BY TABLE_NAME",
                        schema.replace('\'', "''")
                    ))
                    .await?;
                let sizes = result
                    .rows
                    .iter()
                    .filter_map(|row| {
                        let arr = row.as_array()?;
                        let name = arr.first()?.as_str()?.to_string();
                        let size = arr.get(1).and_then(|v| v.as_i64()).unwrap_or(0);
                        Some((name, size))
                    })
                    .collect();
                Ok(sizes)
            }
            _ => Ok(Vec::new()),
        }
    }

    /// Truncate a set of tables in foreign-key-safe order (children first).
    /// Returns the execution order, the generated SQL, per-table outcomes and
    /// warnings. Execution is engine-specific:
    /// - Postgres: single `TRUNCATE TABLE a, b` statement (FK-aware).
    /// - MySQL/MariaDB: `SET FOREIGN_KEY_CHECKS = 0; TRUNCATE ...; SET FOREIGN_KEY_CHECKS = 1;`.
    /// - SQLite: `DELETE FROM` per table in order (no TRUNCATE in SQLite).
    /// - SQL Server: disables incoming FK constraints (selected set only),
    ///   truncates, then re-enables them.
    pub async fn truncate_tables(
        state: &AppState,
        id: &str,
        schema: Option<String>,
        tables: Vec<String>,
    ) -> AppResult<crate::models::TruncateTablesResult> {
        use crate::models::{TruncateTableOutcome, TruncateTablesResult};
        use std::collections::{HashMap, HashSet, VecDeque};

        const MAX_TABLES: usize = 100;

        if tables.is_empty() {
            return Err(AppError::Validation(
                "No tables selected to truncate".into(),
            ));
        }
        if tables.len() > MAX_TABLES {
            return Err(AppError::Validation(format!(
                "Cannot truncate more than {} tables in a single operation (got {}).",
                MAX_TABLES,
                tables.len()
            )));
        }

        let driver = state.get_connection(id).await?;
        let db_type = driver.db_type();

        if matches!(
            db_type,
            crate::db::DbType::Mongodb | crate::db::DbType::Redis
        ) {
            return Err(AppError::Validation(
                "TRUNCATE is not supported for this database type".into(),
            ));
        }

        // Dedupe preserving selection order.
        let mut seen: HashSet<String> = HashSet::new();
        let mut unique: Vec<String> = Vec::new();
        for t in tables {
            if seen.insert(t.clone()) {
                unique.push(t);
            }
        }
        let index: HashMap<String, usize> = unique
            .iter()
            .enumerate()
            .map(|(i, t)| (t.clone(), i))
            .collect();

        // Build the FK graph among the selected tables. Edge child -> parent
        // means the child must be truncated before the parent.
        let mut adjacency: Vec<Vec<usize>> = vec![Vec::new(); unique.len()];
        let mut in_degree = vec![0usize; unique.len()];

        for (i, table) in unique.iter().enumerate() {
            let fks = driver.fetch_foreign_keys(table, schema.clone()).await?;
            for fk in fks {
                let parent = fk
                    .get("referencedTable")
                    .and_then(|v| v.as_str())
                    .or_else(|| fk.get("referencedTableName").and_then(|v| v.as_str()))
                    .or_else(|| fk.get("table").and_then(|v| v.as_str()));
                if let Some(parent) = parent {
                    if let Some(&p) = index.get(parent) {
                        if p != i && !adjacency[i].contains(&p) {
                            adjacency[i].push(p);
                            in_degree[p] += 1;
                        }
                    }
                }
            }
        }

        // Detect tables outside the selection that reference selected tables.
        // These are left intact and foreign key enforcement stays ON so the
        // engine rejects truncating any referenced parent instead of orphaning
        // data (MySQL would otherwise allow it silently with FK checks off).
        let mut unselected_refs: Vec<String> = Vec::new();
        for table in &unique {
            let referenced_by = driver
                .fetch_referenced_by_keys(table, schema.clone())
                .await?;
            for rk in referenced_by {
                if let Some(referencing) = rk.get("referencingTable").and_then(|v| v.as_str()) {
                    if !index.contains_key(referencing) {
                        unselected_refs.push(format!("{referencing} references {table}"));
                    }
                }
            }
        }
        let has_unselected_refs = !unselected_refs.is_empty();

        // Topological sort (Kahn): children (in-degree 0) come first.
        let mut warnings: Vec<String> = Vec::new();
        if has_unselected_refs {
            warnings.push(format!(
                "These tables are not selected but reference selected tables. They are left intact and foreign key enforcement stays on, so the database may reject truncating the referenced parents:\n- {}",
                unselected_refs.join("\n- ")
            ));
        }
        let mut order: Vec<String> = Vec::new();
        let mut queue: VecDeque<usize> = (0..unique.len()).filter(|&i| in_degree[i] == 0).collect();
        let mut placed = vec![false; unique.len()];

        while let Some(i) = queue.pop_front() {
            order.push(unique[i].clone());
            placed[i] = true;
            for &p in &adjacency[i] {
                in_degree[p] -= 1;
                if in_degree[p] == 0 {
                    queue.push_back(p);
                }
            }
        }

        // Tables not reached by the sort participate in an FK cycle.
        let remaining: Vec<usize> = (0..unique.len()).filter(|&i| !placed[i]).collect();
        if !remaining.is_empty() {
            let cycle: Vec<String> = remaining.iter().map(|&i| unique[i].clone()).collect();
            warnings.push(format!(
                "Circular foreign key dependency detected between: {}. Order between them is not guaranteed.",
                cycle.join(", ")
            ));
            order.extend(remaining.into_iter().map(|i| unique[i].clone()));
        }

        // Identifier quoting per engine.
        let (q_open, q_close, q_esc) = match db_type {
            crate::db::DbType::Postgres => ("\"", "\"", "\"\""),
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => ("`", "`", "``"),
            crate::db::DbType::Sqlserver => ("[", "]", "]]"),
            _ => ("\"", "\"", "\"\""), // SQLite
        };

        let quote_table = |name: &str| -> String {
            let quoted = format!("{}{}{}", q_open, name.replace(q_close, q_esc), q_close);
            match schema.as_ref() {
                Some(s) if !s.is_empty() && db_type != crate::db::DbType::Sqlite => format!(
                    "{}{}{}.{}",
                    q_open,
                    s.replace(q_close, q_esc),
                    q_close,
                    quoted
                ),
                _ => quoted,
            }
        };

        let make_outcome =
            |table: &str, ok: bool, error: Option<String>, rows_affected: Option<u64>| {
                TruncateTableOutcome {
                    table: table.to_string(),
                    ok,
                    error,
                    rows_affected,
                }
            };

        let mut statements: Vec<String> = Vec::new();
        let mut outcomes: Vec<TruncateTableOutcome> = Vec::new();

        match db_type {
            crate::db::DbType::Postgres => {
                if has_unselected_refs {
                    // Fall back to per-table statements so the engine decides
                    // table by table (children succeed, referenced parents fail).
                    for t in &order {
                        let sql = format!("TRUNCATE TABLE {}", quote_table(t));
                        statements.push(sql.clone());
                        match Self::execute_query(state, id, &sql, schema.clone()).await {
                            Ok(res) => {
                                outcomes.push(make_outcome(t, true, None, Some(res.rows_affected)));
                            }
                            Err(e) => {
                                outcomes.push(make_outcome(t, false, Some(e.to_string()), None));
                            }
                        }
                    }
                } else {
                    let quoted: Vec<String> = order.iter().map(|t| quote_table(t)).collect();
                    let sql = format!("TRUNCATE TABLE {}", quoted.join(", "));
                    statements.push(sql.clone());
                    match Self::execute_query(state, id, &sql, schema.clone()).await {
                        Ok(res) => {
                            for t in &order {
                                outcomes.push(make_outcome(t, true, None, Some(res.rows_affected)));
                            }
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            for t in &order {
                                outcomes.push(make_outcome(t, false, Some(msg.clone()), None));
                            }
                        }
                    }
                }
            }
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => {
                if has_unselected_refs {
                    // Per-table so the engine decides. FK checks stay ON so a
                    // referenced parent is rejected instead of orphaning rows
                    // in the unselected referencing tables.
                    for t in &order {
                        let sql = format!("TRUNCATE TABLE {}", quote_table(t));
                        statements.push(sql.clone());
                        match Self::execute_query(state, id, &sql, schema.clone()).await {
                            Ok(res) => {
                                outcomes.push(make_outcome(t, true, None, Some(res.rows_affected)));
                            }
                            Err(e) => {
                                outcomes.push(make_outcome(t, false, Some(e.to_string()), None));
                            }
                        }
                    }
                } else {
                    let mut parts = vec!["SET FOREIGN_KEY_CHECKS = 0".to_string()];
                    for t in &order {
                        parts.push(format!("TRUNCATE TABLE {}", quote_table(t)));
                    }
                    parts.push("SET FOREIGN_KEY_CHECKS = 1".to_string());
                    let sql = parts.join("; ");
                    statements.push(sql.clone());
                    match Self::execute_query(state, id, &sql, schema.clone()).await {
                        Ok(_) => {
                            for t in &order {
                                outcomes.push(make_outcome(t, true, None, None));
                            }
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            for t in &order {
                                outcomes.push(make_outcome(t, false, Some(msg.clone()), None));
                            }
                        }
                    }
                }
            }
            crate::db::DbType::Sqlite => {
                for t in &order {
                    let sql = format!("DELETE FROM {}", quote_table(t));
                    statements.push(sql.clone());
                    match Self::execute_query(state, id, &sql, schema.clone()).await {
                        Ok(res) => {
                            outcomes.push(make_outcome(t, true, None, Some(res.rows_affected)));
                        }
                        Err(e) => outcomes.push(make_outcome(t, false, Some(e.to_string()), None)),
                    }
                }
            }
            crate::db::DbType::Sqlserver => {
                // Incoming FK constraints from selected children (needed to
                // TRUNCATE a referenced table).
                let mut disable_map: HashMap<String, Vec<String>> = HashMap::new();
                for table in &order {
                    let referenced_by = driver
                        .fetch_referenced_by_keys(table, schema.clone())
                        .await?;
                    let mut names: Vec<String> = Vec::new();
                    for rk in referenced_by {
                        let referencing = rk.get("referencingTable").and_then(|v| v.as_str());
                        let fk = rk.get("constraintName").and_then(|v| v.as_str());
                        if let (Some(r), Some(f)) = (referencing, fk) {
                            if index.contains_key(r) {
                                names.push(f.to_string());
                            }
                        }
                    }
                    if !names.is_empty() {
                        disable_map.insert(table.clone(), names);
                    }
                }

                for t in &order {
                    let full = quote_table(t);
                    let names = disable_map.get(t).cloned().unwrap_or_default();

                    // 1. Disable incoming FK constraints.
                    let mut disabled: Vec<String> = Vec::new();
                    let mut disable_failed = false;
                    for fk in &names {
                        let sql = format!(
                            "ALTER TABLE {} NOCHECK CONSTRAINT {}",
                            full,
                            crate::db::quote_identifier(&db_type, fk)
                        );
                        statements.push(sql.clone());
                        match Self::execute_query(state, id, &sql, schema.clone()).await {
                            Ok(_) => disabled.push(fk.clone()),
                            Err(e) => {
                                disable_failed = true;
                                outcomes.push(make_outcome(t, false, Some(e.to_string()), None));
                                break;
                            }
                        }
                    }

                    if disable_failed {
                        // Best-effort re-enable of what was disabled.
                        for fk in &disabled {
                            let sql = format!(
                                "ALTER TABLE {} WITH CHECK CHECK CONSTRAINT {}",
                                full,
                                crate::db::quote_identifier(&db_type, fk)
                            );
                            statements.push(sql.clone());
                            let _ = Self::execute_query(state, id, &sql, schema.clone()).await;
                        }
                        continue;
                    }

                    // 2. Truncate.
                    let sql = format!("TRUNCATE TABLE {}", full);
                    statements.push(sql.clone());
                    match Self::execute_query(state, id, &sql, schema.clone()).await {
                        Ok(res) => {
                            outcomes.push(make_outcome(t, true, None, Some(res.rows_affected)));
                        }
                        Err(e) => {
                            outcomes.push(make_outcome(t, false, Some(e.to_string()), None));
                        }
                    }

                    // 3. Re-enable constraints (best effort).
                    for fk in &names {
                        let sql = format!(
                            "ALTER TABLE {} WITH CHECK CHECK CONSTRAINT {}",
                            full,
                            crate::db::quote_identifier(&db_type, fk)
                        );
                        statements.push(sql.clone());
                        let _ = Self::execute_query(state, id, &sql, schema.clone()).await;
                    }
                }
            }
            _ => {
                return Err(AppError::Validation(
                    "TRUNCATE is not supported for this database type".into(),
                ))
            }
        }

        // Invalidate cached metadata for the affected tables.
        for t in &unique {
            Self::invalidate_metadata_cache(state, id, t, schema.as_deref()).await;
        }

        Ok(TruncateTablesResult {
            order,
            statements,
            outcomes,
            warnings,
        })
    }

    /// Verify dump file integrity: count statements vs expected tables.
    pub fn verify_dump_integrity(
        file_path: &str,
        expected_tables: usize,
    ) -> AppResult<serde_json::Value> {
        let bytes = std::fs::read(file_path)
            .map_err(|e| AppError::Internal(format!("Failed to read dump file: {}", e)))?;
        let content = String::from_utf8_lossy(&bytes);

        let file_size = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);

        let create_count = content.matches("CREATE TABLE").count()
            + content.matches("CREATE VIEW").count()
            + content.matches("CREATE TRIGGER").count()
            + content.matches("CREATE PROCEDURE").count()
            + content.matches("CREATE FUNCTION").count();

        let insert_count = content.matches("INSERT INTO").count();

        Ok(serde_json::json!({
            "fileSizeBytes": file_size,
            "fileSizeKB": (file_size as f64 / 1024.0 * 100.0).round() / 100.0,
            "createStatements": create_count,
            "insertStatements": insert_count,
            "totalStatements": create_count + insert_count,
            "expectedTables": expected_tables,
            "passed": expected_tables == 0 || (create_count > 0),
        }))
    }

    /// Parse a SQL dump file and extract unique table names from
    /// CREATE TABLE and INSERT INTO statements.
    pub fn parse_dump_tables(content: &str) -> Vec<String> {
        let mut tables: Vec<String> = Vec::new();
        let upper = content.to_uppercase();

        let keywords: [&str; 2] = ["CREATE TABLE", "INSERT INTO"];

        for kw in keywords {
            let mut pos = 0;
            while let Some(idx) = upper[pos..].find(kw) {
                let start = pos + idx + kw.len();
                let after = &content[start..];
                let name = after
                    .trim_start()
                    .trim_start_matches(['"', '`'])
                    .split(|c: char| {
                        c == '"' || c == '`' || c == '.' || c == '(' || c.is_whitespace()
                    })
                    .next()
                    .unwrap_or("")
                    .to_string();

                if !name.is_empty() && !tables.contains(&name) {
                    tables.push(name);
                }
                pos = start + 1;
            }
        }

        tables
    }

    /// Restore only the selected tables from a dump file.
    /// Splits the file into top-level SQL statements with dollar-quote awareness
    /// (handles PostgreSQL $function$ / $body$ blocks), then executes only
    /// statements that reference any of the selected table names.
    /// Uses execute_with_schema for PostgreSQL to ensure search_path is set.
    pub async fn restore_database_selected(
        state: &AppState,
        id: &str,
        file_path: &str,
        tables: &[String],
        schema: &str,
    ) -> AppResult<()> {
        let bytes = tokio::fs::read(file_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to read dump file: {}", e)))?;
        let content = String::from_utf8_lossy(&bytes);

        let driver = state.get_connection(id).await?;
        let is_postgres = matches!(driver.db_type(), crate::db::DbType::Postgres);

        let statements = split_sql_statements(&content);
        let mut errors = Vec::new();

        for stmt in &statements {
            let trimmed = stmt.trim();
            if trimmed.is_empty() || trimmed.starts_with("--") || trimmed.starts_with("/*") {
                continue;
            }

            let upper_stmt = trimmed.to_uppercase();
            let should_execute = tables.is_empty()
                || tables.iter().any(|t| {
                    let tu = t.to_uppercase();
                    upper_stmt.contains(&format!(" {}", tu))
                        || upper_stmt.contains(&format!(" \"{}\" ", tu))
                        || upper_stmt.contains(&format!("`{}`", tu))
                        || upper_stmt.contains(&format!(" {}(", tu))
                        || upper_stmt.contains(&format!(" {}\n", tu))
                        || upper_stmt.contains(&format!(" {};", tu))
                        || upper_stmt.contains(&format!(" {},", tu))
                        // Schema-qualified: "schema"."table"
                        || upper_stmt.contains(&format!(".\\\"{}\\\"", tu))
                        // At start: TABLE ... or TABLE(...)
                        || upper_stmt.starts_with(&format!("{} ", tu))
                        || upper_stmt.starts_with(&format!("{}(", tu))
                });

            if should_execute {
                // Before CREATE TABLE for a selected table, drop the table first
                // so INSERT data does not fail on duplicate keys.
                if is_postgres && upper_stmt.starts_with("CREATE TABLE") {
                    if let Some(table_name) = extract_table_name_from_create(trimmed) {
                        if tables.is_empty()
                            || tables.iter().any(|t| t.eq_ignore_ascii_case(&table_name))
                        {
                            let drop_sql = format!(
                                "DROP TABLE IF EXISTS \"{}\".\"{}\" CASCADE",
                                schema.replace('"', "\"\""),
                                table_name.replace('"', "\"\"")
                            );
                            let _ = driver.execute_with_schema(&drop_sql, schema).await;
                        }
                    }
                }

                let exec_result = if is_postgres {
                    driver.execute_with_schema(trimmed, schema).await
                } else {
                    driver.execute(trimmed).await
                };
                if let Err(e) = exec_result {
                    errors.push(format!(
                        "Error in statement near '{}': {}",
                        &trimmed[..trimmed.len().min(80)],
                        e
                    ));
                }
            }
        }

        if !errors.is_empty() {
            return Err(AppError::Internal(format!(
                "Restore completed with {} error(s). First error: {}",
                errors.len(),
                errors[0]
            )));
        }

        Ok(())
    }
}

/// Splits SQL text into top-level statements by `;` while respecting:
/// - PostgreSQL dollar-quoting ($tag$...$tag$)
/// - Single-quoted string literals (''...'')
/// - Single-line (--) and block (/* */) comments
fn split_sql_statements(content: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = content.chars().collect();
    let len = chars.len();
    let mut i = 0;

    // State tracking
    let mut in_single_quote = false;
    let mut in_dollar_tag: Option<String> = None;
    let mut in_block_comment = false;

    while i < len {
        // Block comment: /* ... */
        if !in_single_quote
            && in_dollar_tag.is_none()
            && !in_block_comment
            && i + 1 < len
            && chars[i] == '/'
            && chars[i + 1] == '*'
        {
            in_block_comment = true;
            i += 2;
            continue;
        }
        if in_block_comment {
            if i + 1 < len && chars[i] == '*' && chars[i + 1] == '/' {
                in_block_comment = false;
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }

        // Single-line comment: -- ...
        if !in_single_quote
            && in_dollar_tag.is_none()
            && !in_block_comment
            && i + 1 < len
            && chars[i] == '-'
            && chars[i + 1] == '-'
        {
            // Skip to end of line
            while i < len && chars[i] != '\n' {
                i += 1;
            }
            if i < len {
                i += 1;
            } // skip the newline
            continue;
        }

        // Dollar quote start: $tag$
        if !in_single_quote && !in_block_comment && in_dollar_tag.is_none() && chars[i] == '$' {
            if let Some(end) = find_dollar_tag_end(&chars, i, len) {
                let tag: String = chars[i + 1..end].iter().collect();
                in_dollar_tag = Some(tag);
                current.push('$');
                for &c in chars[i + 1..=end].iter() {
                    current.push(c);
                }
                i = end + 2;
                continue;
            }
        }
        // Dollar quote end: $tag$
        if !in_single_quote && !in_block_comment {
            if let Some(ref tag) = in_dollar_tag {
                if chars[i] == '$' {
                    if let Some(end) = find_dollar_tag_end(&chars, i, len) {
                        let end_tag: String = chars[i + 1..end].iter().collect();
                        if &end_tag == tag {
                            current.push('$');
                            for &c in chars[i + 1..=end].iter() {
                                current.push(c);
                            }
                            in_dollar_tag = None;
                            i = end + 2;
                            continue;
                        }
                    }
                }
            }
        }

        // Single quote toggle (skip doubled quotes inside strings)
        if in_dollar_tag.is_none() && chars[i] == '\'' {
            in_single_quote = !in_single_quote;
            current.push(chars[i]);
            i += 1;
            // Handle doubled quotes inside string: ''
            if in_single_quote && i < len && chars[i] == '\'' {
                current.push(chars[i]);
                i += 1;
            }
            continue;
        }

        // Statement separator at top level
        if !in_single_quote && in_dollar_tag.is_none() && !in_block_comment && chars[i] == ';' {
            let stmt = current.trim().to_string();
            if !stmt.is_empty() {
                statements.push(stmt);
            }
            current.clear();
            i += 1;
            continue;
        }

        current.push(chars[i]);
        i += 1;
    }

    // Final trailing statement
    let remaining = current.trim().to_string();
    if !remaining.is_empty() {
        statements.push(remaining);
    }

    statements
}

/// Find the closing `$` of a dollar tag starting at position `start` (where chars[start] == '$').
/// Returns the index of the closing `$` if found, or None.
fn find_dollar_tag_end(chars: &[char], start: usize, len: usize) -> Option<usize> {
    let mut j = start + 1;
    while j < len && chars[j] != '$' {
        j += 1;
    }
    if j < len && j > start {
        Some(j - 1)
    } else {
        None
    }
}

/// Extracts the unquoted table name from a CREATE TABLE statement.
/// Handles: `CREATE TABLE "schema"."table"`, `CREATE TABLE "table"`,
/// `CREATE TABLE IF NOT EXISTS "schema"."table"`, and unquoted variants.
fn extract_table_name_from_create(stmt: &str) -> Option<String> {
    let upper = stmt.to_uppercase();
    let after = if upper.starts_with("CREATE TABLE IF NOT EXISTS") {
        stmt[25..].trim()
    } else if upper.starts_with("CREATE TABLE") {
        stmt[12..].trim()
    } else {
        return None;
    };

    let name_part = if after.starts_with('"') {
        let after_first = after.split_once('.').map(|x| x.1).unwrap_or(after);
        after_first.trim().trim_start_matches('"')
    } else {
        after.split_once('.').map(|x| x.1).unwrap_or(after)
    };

    let name = name_part
        .trim_start()
        .trim_end_matches('"')
        .split([' ', '(', '\n', '\r'])
        .next()?;

    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}
