use crate::db::DbDriver;
use crate::db::{CapabilityProvider, DataReader, DataWriter, PoolConfig, UpsertResult};
use crate::error::{AppError, AppResult};
use crate::models::sync::{DriverCapabilities, UpsertStrategy};
use crate::models::QueryResult;
use async_trait::async_trait;
use fred::clients::RedisClient;
use fred::prelude::*;
use fred::types::{InfoKind, RedisValue};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Instant;

pub struct RedisDriver {
    client: RedisClient,
    db: AtomicU8,
}

impl RedisDriver {
    pub async fn new(
        url: &str,
        _transactional: bool,
        pool_config: Option<PoolConfig>,
    ) -> AppResult<Self> {
        let sanitized_url = if let Some(idx) = url.find('@') {
            format!(
                "{}@{}",
                &url[..idx.min(url.find("://").unwrap_or(0) + 3)],
                &url[idx + 1..]
            )
        } else {
            url.to_string()
        };

        let has_password = url
            .find('@')
            .map(|at| {
                let after_scheme = &url[url.find("://").unwrap_or(0) + 3..at];
                after_scheme.contains(':')
                    && after_scheme
                        .split(':')
                        .next_back()
                        .map(|p| !p.is_empty())
                        .unwrap_or(false)
            })
            .unwrap_or(false);
        tracing::debug!(
            "Initializing Redis driver with URL: {} (password_present: {})",
            sanitized_url,
            has_password
        );

        let config = fred::types::RedisConfig::from_url(url).map_err(|e| {
            tracing::error!("Failed to parse Redis URL: {}. Error: {}", sanitized_url, e);
            AppError::Connection(format!("Failed to parse Redis URL: {}", e))
        })?;

        let client = RedisClient::new(config, None, None, None);

        if let Some(ref cfg) = pool_config {
            tracing::debug!(
                "Redis pool config: max_connections={}, acquire_timeout={:?}",
                cfg.max_connections,
                cfg.acquire_timeout
            );
            let _ = cfg.max_connections;
        }

        let connect_start = Instant::now();

        client.init().await.map_err(|e| {
            let msg = e.to_string().to_uppercase();
            tracing::error!("Redis init failed after {:?} for {}: {}", connect_start.elapsed(), sanitized_url, msg);

            if msg.contains("CONNECTION REFUSED") || msg.contains("OS ERROR 111") {
                AppError::Connection("Redis connection refused: the server might not be running or the port is blocked".into())
            } else if msg.contains("TIMEOUT") {
                AppError::Connection("Redis connection timeout: check if the host is reachable and the port is open".into())
            } else if msg.contains("AUTH") || msg.contains("NOAUTH") {
                AppError::Auth("Redis authentication failed: please check your credentials".into())
            } else {
                AppError::Connection(format!("Redis error (after {:?}): {}", connect_start.elapsed(), msg))
            }
        })?;

        // Verify with PING
        let ping_result: RedisValue = client
            .ping()
            .await
            .map_err(|e| AppError::Connection(format!("Redis PING failed: {}", e)))?;

        tracing::info!(
            "Redis connection to {} verified in {:?} (PING: {:?})",
            sanitized_url,
            connect_start.elapsed(),
            ping_result
        );

        // Extract database number from URL if present
        let db = Self::extract_db_from_url(url);

        // SELECT database if not 0
        if db > 0 {
            client
                .select(db)
                .await
                .map_err(|e| AppError::Connection(format!("Redis SELECT {} failed: {}", db, e)))?;
            tracing::debug!("Redis SELECT {} completed", db);
        }

        Ok(Self {
            client,
            db: AtomicU8::new(db),
        })
    }

    fn extract_db_from_url(url: &str) -> u8 {
        // Parse the path segment after the authority: scheme://[user:pass@]host:port/db?opts
        let rest = match url.find("://") {
            Some(idx) => &url[idx + 3..],
            None => url,
        };

        // Skip userinfo if present
        let authority = match rest.find('@') {
            Some(at) => &rest[at + 1..],
            None => rest,
        };

        // The database number is everything after the first '/' in the authority
        match authority.find('/') {
            Some(slash) => {
                let db_segment = &authority[slash + 1..];
                let db_segment = match db_segment.find('?') {
                    Some(q) => &db_segment[..q],
                    None => db_segment,
                };
                db_segment.trim().parse::<u8>().unwrap_or(0)
            }
            None => 0,
        }
    }

    fn parse_redis_command(input: &str) -> AppResult<Vec<String>> {
        let input = input.trim();
        if input.is_empty() {
            return Err(AppError::Validation("Empty command".into()));
        }

        let mut tokens = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;
        let mut quote_char = '"';
        let mut chars = input.chars().peekable();

        while let Some(c) = chars.next() {
            if in_quotes {
                if c == '\\' {
                    if let Some(&next) = chars.peek() {
                        chars.next();
                        current.push(next);
                    }
                } else if c == quote_char {
                    in_quotes = false;
                } else {
                    current.push(c);
                }
            } else {
                match c {
                    '"' | '\'' => {
                        in_quotes = true;
                        quote_char = c;
                    }
                    ' ' | '\t' | '\n' | '\r' => {
                        if !current.is_empty() {
                            tokens.push(std::mem::take(&mut current));
                        }
                    }
                    _ => current.push(c),
                }
            }
        }

        if !current.is_empty() {
            tokens.push(current);
        }

        if tokens.is_empty() {
            return Err(AppError::Validation("Empty command".into()));
        }

        Ok(tokens)
    }

    fn parse_scalar_str(s: &str) -> serde_json::Value {
        // Try numeric parsing only for canonical numeric-looking strings,
        // avoiding false positives such as "007", "1e", or hex identifiers.
        let t = s.trim();
        if !t.is_empty()
            && !t.starts_with('0')
            && t.chars().all(|c| c.is_ascii_digit())
            && t.len() <= 18
        {
            if let Ok(n) = t.parse::<i64>() {
                return serde_json::Value::Number(n.into());
            }
        }
        if !t.is_empty() && t.contains('.') && !t.starts_with('0') {
            if let Ok(f) = t.parse::<f64>() {
                return serde_json::json!(f);
            }
        }
        // Try to parse as JSON (arrays/objects stored as JSON strings)
        let trimmed = s.trim();
        if trimmed.starts_with('{') || trimmed.starts_with('[') {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                return value;
            }
        }
        serde_json::Value::String(s.to_string())
    }

    fn redis_value_to_json(val: &RedisValue) -> serde_json::Value {
        match val {
            RedisValue::String(s) => Self::parse_scalar_str(s),
            RedisValue::Integer(n) => serde_json::Value::Number((*n).into()),
            RedisValue::Double(f) => serde_json::Number::from_f64(*f)
                .map_or(serde_json::Value::Null, serde_json::Value::Number),
            RedisValue::Boolean(b) => serde_json::Value::Bool(*b),
            RedisValue::Array(arr) => {
                serde_json::Value::Array(arr.iter().map(Self::redis_value_to_json).collect())
            }
            RedisValue::Null | RedisValue::Queued => serde_json::Value::Null,
            RedisValue::Bytes(b) => {
                // Detect binary vs utf-8 text
                if b.is_ascii() {
                    Self::parse_scalar_str(&String::from_utf8_lossy(b))
                } else {
                    // Try UTF-8, fall back to base64 for truly binary payloads
                    match std::str::from_utf8(b) {
                        Ok(s) => Self::parse_scalar_str(s),
                        Err(_) => {
                            use base64::Engine;
                            serde_json::Value::String(format!(
                                "base64:{}",
                                base64::engine::general_purpose::STANDARD.encode(b)
                            ))
                        }
                    }
                }
            }
            RedisValue::Map(entries) => {
                let mut map = serde_json::Map::new();
                for (k, v) in entries.iter() {
                    let key = k.as_str_lossy().to_string();
                    map.insert(key, Self::redis_value_to_json(v));
                }
                serde_json::Value::Object(map)
            }
        }
    }

    fn redis_value_to_string(val: &RedisValue) -> String {
        match val {
            RedisValue::String(s) => s.to_string(),
            RedisValue::Integer(n) => n.to_string(),
            RedisValue::Double(f) => f.to_string(),
            RedisValue::Boolean(b) => b.to_string(),
            RedisValue::Null => "nil".to_string(),
            RedisValue::Queued => "queued".to_string(),
            RedisValue::Bytes(b) => String::from_utf8_lossy(b).to_string(),
            _ => "[complex value]".to_string(),
        }
    }

    fn build_key_row(key: &str, namespace: &str) -> serde_json::Value {
        let mut map = serde_json::Map::new();
        map.insert("key".into(), serde_json::Value::String(key.to_string()));
        map.insert(
            "namespace".into(),
            serde_json::Value::String(namespace.to_string()),
        );
        serde_json::Value::Object(map)
    }

    fn extract_namespace(key: &str) -> String {
        if let Some(pos) = key.find(':') {
            key[..pos].to_string()
        } else {
            key.to_string()
        }
    }

    async fn scan_keys(&self, pattern: &str, count: i64) -> AppResult<Vec<String>> {
        use futures::StreamExt;

        let batch_size = count.max(100) as u32;

        tracing::debug!(
            "scan_keys: pattern='{}', batch_size={}, db={}",
            pattern,
            batch_size,
            self.db.load(Ordering::Relaxed)
        );

        // First check how many keys exist
        let dbsize: i64 = self.client.dbsize().await.unwrap_or(-1);
        tracing::debug!("scan_keys: DBSIZE={}", dbsize);

        if dbsize == 0 {
            tracing::debug!("scan_keys: DB has 0 keys, returning empty");
            return Ok(Vec::new());
        }

        // Use SCAN via scan_buffered
        let mut all_keys = Vec::new();
        let mut stream = self.client.scan_buffered(pattern, Some(batch_size), None);

        while let Some(result) = stream.next().await {
            match result {
                Ok(key) => {
                    let key_str = key.as_str_lossy().to_string();
                    all_keys.push(key_str);
                }
                Err(e) => {
                    tracing::error!("scan_keys: SCAN item error: {}", e);
                    return Err(AppError::Database(format!("SCAN failed: {}", e)));
                }
            }
        }

        tracing::debug!(
            "scan_keys complete: pattern='{}', total_keys={}",
            pattern,
            all_keys.len()
        );
        Ok(all_keys)
    }

    /// Run a single SCAN page starting from `cursor`, returning the keys in this page
    /// and the cursor to continue with (0 when iteration has finished).
    async fn scan_page(
        &self,
        pattern: &str,
        count: i64,
        cursor: &str,
    ) -> AppResult<(Vec<String>, String)> {
        let batch_size = count.max(10) as u32;
        let cmd = format!("SCAN {} MATCH {} COUNT {}", cursor, pattern, batch_size);

        tracing::debug!("scan_page: {} db={}", cmd, self.db.load(Ordering::Relaxed));

        // The raw SCAN response is a two-element array: [next_cursor, keys]
        // because we need to expose the cursor back to the caller.
        let response: RedisValue = self
            .client
            .custom(
                fred::types::CustomCommand::new_static(
                    "SCAN",
                    fred::types::ClusterHash::FirstKey,
                    false,
                ),
                vec![
                    RedisValue::String(cursor.into()),
                    RedisValue::String("MATCH".into()),
                    RedisValue::String(pattern.into()),
                    RedisValue::String("COUNT".into()),
                    RedisValue::Integer(batch_size as i64),
                ],
            )
            .await
            .map_err(|e| AppError::Database(format!("SCAN failed: {}", e)))?;

        let mut next_cursor = "0".to_string();
        let mut keys = Vec::new();

        if let RedisValue::Array(parts) = response {
            if parts.len() >= 2 {
                next_cursor = Self::redis_value_to_string(&parts[0]);
                if let RedisValue::Array(items) = &parts[1] {
                    for item in items {
                        keys.push(Self::redis_value_to_string(item));
                    }
                }
            }
        }

        Ok((keys, next_cursor))
    }

    async fn get_key_type(&self, key: &str) -> AppResult<String> {
        let key_type: String = self
            .client
            .r#type(key)
            .await
            .map_err(|e| AppError::Database(format!("TYPE {} failed: {}", key, e)))?;
        Ok(key_type.to_lowercase())
    }

    async fn read_key_value(&self, key: &str, key_type: &str) -> AppResult<serde_json::Value> {
        match key_type {
            "string" => {
                let val: RedisValue = self
                    .client
                    .get(key)
                    .await
                    .map_err(|e| AppError::Database(format!("GET {} failed: {}", key, e)))?;
                Ok(Self::redis_value_to_json(&val))
            }
            "list" => {
                let len: i64 = self
                    .client
                    .llen(key)
                    .await
                    .map_err(|e| AppError::Database(format!("LLEN {} failed: {}", key, e)))?;
                if len == 0 {
                    return Ok(serde_json::Value::Array(vec![]));
                }
                let vals: Vec<RedisValue> = self
                    .client
                    .lrange(key, 0, len - 1)
                    .await
                    .map_err(|e| AppError::Database(format!("LRANGE {} failed: {}", key, e)))?;
                Ok(serde_json::Value::Array(
                    vals.iter().map(Self::redis_value_to_json).collect(),
                ))
            }
            "set" => {
                let vals: Vec<RedisValue> =
                    self.client.smembers(key).await.map_err(|e| {
                        AppError::Database(format!("SMEMBERS {} failed: {}", key, e))
                    })?;
                Ok(serde_json::Value::Array(
                    vals.iter().map(Self::redis_value_to_json).collect(),
                ))
            }
            "zset" => {
                let vals: Vec<RedisValue> = self
                    .client
                    .zrange(key, 0, -1, None, false, None, true)
                    .await
                    .map_err(|e| AppError::Database(format!("ZRANGE {} failed: {}", key, e)))?;
                let mut arr = Vec::new();
                let mut i = 0;
                while i + 1 < vals.len() {
                    let member = &vals[i];
                    if let Some(score) = vals[i + 1].as_f64() {
                        let mut map = serde_json::Map::new();
                        map.insert("member".into(), Self::redis_value_to_json(member));
                        map.insert("score".into(), serde_json::json!(score));
                        arr.push(serde_json::Value::Object(map));
                    }
                    i += 2;
                }
                Ok(serde_json::Value::Array(arr))
            }
            "hash" => {
                let entries: Vec<(RedisValue, RedisValue)> =
                    self.client.hgetall(key).await.map_err(|e| {
                        AppError::Database(format!("HGETALL {} failed: {}", key, e))
                    })?;
                let mut map = serde_json::Map::new();
                for (field, val) in entries {
                    let field_str = Self::redis_value_to_string(&field);
                    map.insert(field_str, Self::redis_value_to_json(&val));
                }
                Ok(serde_json::Value::Object(map))
            }
            _ => Ok(serde_json::Value::Null),
        }
    }

    async fn execute_redis_command(&self, tokens: &[String]) -> AppResult<QueryResult> {
        let start = Instant::now();
        let cmd = tokens[0].to_uppercase();

        match cmd.as_str() {
            "GET" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("GET requires a key".into()));
                }
                let val: RedisValue = self.client.get(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("GET failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": Self::redis_value_to_json(&val)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "MGET" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("MGET requires at least 2 keys".into()));
                }
                let keys: Vec<&str> = tokens[1..].iter().map(|s| s.as_str()).collect();
                let vals: Vec<RedisValue> = self.client.mget(keys).await
                    .map_err(|e| AppError::Database(format!("MGET failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = tokens[1..].iter().zip(vals.iter()).map(|(key, val)| {
                    serde_json::json!({"key": key, "value": Self::redis_value_to_json(val)})
                }).collect();
                Ok(QueryResult {
                    columns: vec!["key".into(), "value".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SET" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("SET requires key and value".into()));
                }
                let _: RedisValue = self.client.set(&tokens[1], &tokens[2], None, None, false).await
                    .map_err(|e| AppError::Database(format!("SET failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": "OK"})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "DEL" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("DEL requires at least one key".into()));
                }
                let keys: Vec<&str> = tokens[1..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.del(keys).await
                    .map_err(|e| AppError::Database(format!("DEL failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["deleted".into()],
                    rows: vec![serde_json::json!({"deleted": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: count as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "EXISTS" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("EXISTS requires at least one key".into()));
                }
                let keys: Vec<&str> = tokens[1..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.exists(keys).await
                    .map_err(|e| AppError::Database(format!("EXISTS failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["exists".into()],
                    rows: vec![serde_json::json!({"exists": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "TYPE" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("TYPE requires a key".into()));
                }
                let key_type: String = self.client.r#type(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("TYPE failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["type".into()],
                    rows: vec![serde_json::json!({"type": key_type})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "TTL" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("TTL requires a key".into()));
                }
                let ttl: i64 = self.client.ttl(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("TTL failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["ttl".into()],
                    rows: vec![serde_json::json!({"ttl": ttl})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "PTTL" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("PTTL requires a key".into()));
                }
                let pttl: i64 = self.client.pttl(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("PTTL failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["pttl".into()],
                    rows: vec![serde_json::json!({"pttl": pttl})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "EXPIRE" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("EXPIRE requires key and seconds".into()));
                }
                let seconds: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("EXPIRE seconds must be a number".into()))?;
                let result: bool = self.client.expire(&tokens[1], seconds).await
                    .map_err(|e| AppError::Database(format!("EXPIRE failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "PEXPIRE" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("PEXPIRE requires key and milliseconds".into()));
                }
                let ms: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("PEXPIRE milliseconds must be a number".into()))?;
                let result: bool = self.client.pexpire(&tokens[1], ms, None).await
                    .map_err(|e| AppError::Database(format!("PEXPIRE failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HGET" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("HGET requires key and field".into()));
                }
                let val: RedisValue = self.client.hget(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("HGET failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": Self::redis_value_to_json(&val)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HSET" => {
                if tokens.len() < 4 || tokens.len() % 2 != 0 {
                    return Err(AppError::Validation("HSET requires key and field-value pairs".into()));
                }
                let key = &tokens[1];
                let mut affected = 0i64;
                let mut i = 2;
                while i + 1 < tokens.len() {
                    let result: RedisValue = self.client.hset(key, (&tokens[i], &tokens[i + 1])).await
                        .map_err(|e| AppError::Database(format!("HSET failed: {}", e)))?;
                    if let RedisValue::Integer(n) = result {
                        affected += n;
                    }
                    i += 2;
                }
                Ok(QueryResult {
                    columns: vec!["affected".into()],
                    rows: vec![serde_json::json!({"affected": affected})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: affected as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HGETALL" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("HGETALL requires a key".into()));
                }
                let entries: Vec<(RedisValue, RedisValue)> = self.client.hgetall(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("HGETALL failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = entries.iter().map(|(field, val)| {
                    serde_json::json!({
                        "field": Self::redis_value_to_json(field),
                        "value": Self::redis_value_to_json(val)
                    })
                }).collect();
                Ok(QueryResult {
                    columns: vec!["field".into(), "value".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HDEL" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("HDEL requires key and fields".into()));
                }
                let fields: Vec<&str> = tokens[2..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.hdel(&tokens[1], fields).await
                    .map_err(|e| AppError::Database(format!("HDEL failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["deleted".into()],
                    rows: vec![serde_json::json!({"deleted": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: count as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HEXISTS" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("HEXISTS requires key and field".into()));
                }
                let result: bool = self.client.hexists(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("HEXISTS failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["exists".into()],
                    rows: vec![serde_json::json!({"exists": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HLEN" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("HLEN requires a key".into()));
                }
                let count: i64 = self.client.hlen(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("HLEN failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["hlen".into()],
                    rows: vec![serde_json::json!({"hlen": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HKEYS" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("HKEYS requires a key".into()));
                }
                let keys: Vec<RedisValue> = self.client.hkeys(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("HKEYS failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = keys.iter().map(|k| {
                    serde_json::json!({"field": Self::redis_value_to_json(k)})
                }).collect();
                Ok(QueryResult {
                    columns: vec!["field".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HVALS" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("HVALS requires a key".into()));
                }
                let vals: Vec<RedisValue> = self.client.hvals(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("HVALS failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = vals.iter().map(|v| {
                    serde_json::json!({"value": Self::redis_value_to_json(v)})
                }).collect();
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "LPUSH" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("LPUSH requires key and values".into()));
                }
                let values: Vec<&str> = tokens[2..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.lpush(&tokens[1], values).await
                    .map_err(|e| AppError::Database(format!("LPUSH failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["length".into()],
                    rows: vec![serde_json::json!({"length": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: count as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "RPUSH" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("RPUSH requires key and values".into()));
                }
                let values: Vec<&str> = tokens[2..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.rpush(&tokens[1], values).await
                    .map_err(|e| AppError::Database(format!("RPUSH failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["length".into()],
                    rows: vec![serde_json::json!({"length": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: count as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "LPOP" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("LPOP requires a key".into()));
                }
                let val: RedisValue = self.client.lpop(&tokens[1], None).await
                    .map_err(|e| AppError::Database(format!("LPOP failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": Self::redis_value_to_json(&val)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "RPOP" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("RPOP requires a key".into()));
                }
                let val: RedisValue = self.client.rpop(&tokens[1], None).await
                    .map_err(|e| AppError::Database(format!("RPOP failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": Self::redis_value_to_json(&val)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "LRANGE" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("LRANGE requires key, start, and stop".into()));
                }
                let start_idx: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("LRANGE start must be a number".into()))?;
                let stop_idx: i64 = tokens[3].parse()
                    .map_err(|_| AppError::Validation("LRANGE stop must be a number".into()))?;
                let vals: Vec<RedisValue> = self.client.lrange(&tokens[1], start_idx, stop_idx).await
                    .map_err(|e| AppError::Database(format!("LRANGE failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = vals.iter().enumerate().map(|(i, v)| {
                    serde_json::json!({"index": i, "value": Self::redis_value_to_json(v)})
                }).collect();
                Ok(QueryResult {
                    columns: vec!["index".into(), "value".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "LLEN" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("LLEN requires a key".into()));
                }
                let count: i64 = self.client.llen(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("LLEN failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["llen".into()],
                    rows: vec![serde_json::json!({"llen": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SADD" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("SADD requires key and members".into()));
                }
                let members: Vec<&str> = tokens[2..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.sadd(&tokens[1], members).await
                    .map_err(|e| AppError::Database(format!("SADD failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["added".into()],
                    rows: vec![serde_json::json!({"added": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: count as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SMEMBERS" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("SMEMBERS requires a key".into()));
                }
                let vals: Vec<RedisValue> = self.client.smembers(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("SMEMBERS failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = vals.iter().map(|v| {
                    serde_json::json!({"member": Self::redis_value_to_json(v)})
                }).collect();
                Ok(QueryResult {
                    columns: vec!["member".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SISMEMBER" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("SISMEMBER requires key and member".into()));
                }
                let result: bool = self.client.sismember(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("SISMEMBER failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["member_exists".into()],
                    rows: vec![serde_json::json!({"member_exists": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SREM" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("SREM requires key and members".into()));
                }
                let members: Vec<&str> = tokens[2..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.srem(&tokens[1], members).await
                    .map_err(|e| AppError::Database(format!("SREM failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["removed".into()],
                    rows: vec![serde_json::json!({"removed": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: count as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SCARD" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("SCARD requires a key".into()));
                }
                let count: i64 = self.client.scard(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("SCARD failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["scard".into()],
                    rows: vec![serde_json::json!({"scard": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "ZADD" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("ZADD requires key, score, and member".into()));
                }
                let key = &tokens[1];
                let mut affected = 0i64;
                let mut i = 2;
                while i + 1 < tokens.len() {
                    let score: f64 = tokens[i].parse()
                        .map_err(|_| AppError::Validation(format!("ZADD score '{}' must be a number", tokens[i])))?;
                    let result: i64 = self.client.zadd(key, None, None, false, false, (score, &tokens[i + 1])).await
                        .map_err(|e| AppError::Database(format!("ZADD failed: {}", e)))?;
                    affected += result;
                    i += 2;
                }
                Ok(QueryResult {
                    columns: vec!["added".into()],
                    rows: vec![serde_json::json!({"added": affected})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: affected as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "ZRANGE" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("ZRANGE requires key, start, and stop".into()));
                }
                let start_idx: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("ZRANGE start must be a number".into()))?;
                let stop_idx: i64 = tokens[3].parse()
                    .map_err(|_| AppError::Validation("ZRANGE stop must be a number".into()))?;
                let with_scores = tokens.len() > 4 && tokens[4].to_uppercase() == "WITHSCORES";
                if with_scores {
                    let vals: Vec<RedisValue> = self.client.zrange(&tokens[1], start_idx, stop_idx, None, false, None, true).await
                        .map_err(|e| AppError::Database(format!("ZRANGE failed: {}", e)))?;
                    let mut rows = Vec::new();
                    let mut i = 0;
                    while i + 1 < vals.len() {
                        let member = &vals[i];
                        if let Some(score) = vals[i + 1].as_f64() {
                            rows.push(serde_json::json!({"member": Self::redis_value_to_json(member), "score": score}));
                        }
                        i += 2;
                    }
                    Ok(QueryResult {
                        columns: vec!["member".into(), "score".into()],
                        rows,
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                    })
                } else {
                    let vals: Vec<RedisValue> = self.client.zrange(&tokens[1], start_idx, stop_idx, None, false, None, false).await
                        .map_err(|e| AppError::Database(format!("ZRANGE failed: {}", e)))?;
                    let rows: Vec<serde_json::Value> = vals.iter().map(|v| {
                        serde_json::json!({"member": Self::redis_value_to_json(v)})
                    }).collect();
                    Ok(QueryResult {
                        columns: vec!["member".into()],
                        rows,
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                    })
                }
            }
            "ZREVRANGE" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("ZREVRANGE requires key, start, and stop".into()));
                }
                let start_idx: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("ZREVRANGE start must be a number".into()))?;
                let stop_idx: i64 = tokens[3].parse()
                    .map_err(|_| AppError::Validation("ZREVRANGE stop must be a number".into()))?;
                let with_scores = tokens.len() > 4 && tokens[4].to_uppercase() == "WITHSCORES";
                if with_scores {
                    let vals: Vec<RedisValue> = self.client.zrange(&tokens[1], start_idx, stop_idx, None, true, None, true).await
                        .map_err(|e| AppError::Database(format!("ZREVRANGE failed: {}", e)))?;
                    let mut rows = Vec::new();
                    let mut i = 0;
                    while i + 1 < vals.len() {
                        let member = &vals[i];
                        if let Some(score) = vals[i + 1].as_f64() {
                            rows.push(serde_json::json!({"member": Self::redis_value_to_json(member), "score": score}));
                        }
                        i += 2;
                    }
                    Ok(QueryResult {
                        columns: vec!["member".into(), "score".into()],
                        rows,
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                    })
                } else {
                    let vals: Vec<RedisValue> = self.client.zrange(&tokens[1], start_idx, stop_idx, None, true, None, false).await
                        .map_err(|e| AppError::Database(format!("ZREVRANGE failed: {}", e)))?;
                    let rows: Vec<serde_json::Value> = vals.iter().map(|v| {
                        serde_json::json!({"member": Self::redis_value_to_json(v)})
                    }).collect();
                    Ok(QueryResult {
                        columns: vec!["member".into()],
                        rows,
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                    })
                }
            }
            "ZREM" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("ZREM requires key and members".into()));
                }
                let members: Vec<&str> = tokens[2..].iter().map(|s| s.as_str()).collect();
                let count: i64 = self.client.zrem(&tokens[1], members).await
                    .map_err(|e| AppError::Database(format!("ZREM failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["removed".into()],
                    rows: vec![serde_json::json!({"removed": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: count as u64,
                    next_cursor: None,
                    graph: None,
                })
            }
            "ZCARD" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("ZCARD requires a key".into()));
                }
                let count: i64 = self.client.zcard(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("ZCARD failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["zcard".into()],
                    rows: vec![serde_json::json!({"zcard": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "ZSCORE" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("ZSCORE requires key and member".into()));
                }
                let score: RedisValue = self.client.zscore(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("ZSCORE failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["score".into()],
                    rows: vec![serde_json::json!({"score": Self::redis_value_to_json(&score)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "INCR" | "DECR" | "INCRBY" | "DECRBY" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation(format!("{} requires a key", cmd)));
                }
                let value: i64 = match cmd.as_str() {
                    "INCRBY" | "DECRBY" => {
                        if tokens.len() < 3 {
                            return Err(AppError::Validation(format!("{} requires a numeric amount", cmd)));
                        }
                        tokens[2].parse()
                            .map_err(|_| AppError::Validation(format!("{} amount must be a number", cmd)))?
                    }
                    _ => 1,
                };
                let result: i64 = match cmd.as_str() {
                    "INCR" => self.client.incr(&tokens[1]).await,
                    "DECR" => self.client.decr(&tokens[1]).await,
                    "INCRBY" => self.client.incr_by(&tokens[1], value).await,
                    "DECRBY" => self.client.decr_by(&tokens[1], value).await,
                    _ => unreachable!(),
                }
                .map_err(|e| AppError::Database(format!("{} failed: {}", cmd, e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SETNX" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("SETNX requires key and value".into()));
                }
                let result: bool = self.client.setnx(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("SETNX failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: if result { 1 } else { 0 },
                    next_cursor: None,
                    graph: None,
                })
            }
            "SETEX" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("SETEX requires key, seconds, and value".into()));
                }
                let seconds: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("SETEX seconds must be a number".into()))?;
                let _: RedisValue = self
                    .client
                    .set(&tokens[1], &tokens[3], Some(fred::types::Expiration::EX(seconds)), None, false)
                    .await
                    .map_err(|e| AppError::Database(format!("SETEX failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": "OK"})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "GETDEL" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("GETDEL requires a key".into()));
                }
                let val: RedisValue = self.client.getdel(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("GETDEL failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": Self::redis_value_to_json(&val)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "GETSET" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("GETSET requires key and value".into()));
                }
                let val: RedisValue = self.client.getset(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("GETSET failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": Self::redis_value_to_json(&val)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "APPEND" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("APPEND requires key and value".into()));
                }
                let result: i64 = self.client.append(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("APPEND failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["length".into()],
                    rows: vec![serde_json::json!({"length": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "STRLEN" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("STRLEN requires a key".into()));
                }
                let result: i64 = self.client.strlen(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("STRLEN failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["length".into()],
                    rows: vec![serde_json::json!({"length": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "PERSIST" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("PERSIST requires a key".into()));
                }
                let result: bool = self.client.persist(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("PERSIST failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: if result { 1 } else { 0 },
                    next_cursor: None,
                    graph: None,
                })
            }
            "EXPIREAT" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("EXPIREAT requires key and unix timestamp".into()));
                }
                let timestamp: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("EXPIREAT timestamp must be a number".into()))?;
                let result: bool = self.client.expire_at(&tokens[1], timestamp).await
                    .map_err(|e| AppError::Database(format!("EXPIREAT failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: if result { 1 } else { 0 },
                    next_cursor: None,
                    graph: None,
                })
            }
            "HMGET" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("HMGET requires key and fields".into()));
                }
                let fields: Vec<&str> = tokens[2..].iter().map(|s| s.as_str()).collect();
                let vals: Vec<RedisValue> = self.client.hmget(&tokens[1], fields).await
                    .map_err(|e| AppError::Database(format!("HMGET failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = tokens[2..].iter().zip(vals.iter()).map(|(field, val)| {
                    serde_json::json!({"field": field, "value": Self::redis_value_to_json(val)})
                }).collect();
                Ok(QueryResult {
                    columns: vec!["field".into(), "value".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HMSET" => {
                if tokens.len() < 4 || tokens.len() % 2 != 0 {
                    return Err(AppError::Validation("HMSET requires key and field-value pairs".into()));
                }
                let key = &tokens[1];
                let mut i = 2;
                while i + 1 < tokens.len() {
                    let _: RedisValue = self.client.hset(key, (&tokens[i], &tokens[i + 1])).await
                        .map_err(|e| AppError::Database(format!("HMSET failed: {}", e)))?;
                    i += 2;
                }
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": "OK"})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: (i - 2) as u64 / 2,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HSETNX" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("HSETNX requires key, field, and value".into()));
                }
                let result: bool = self.client.hsetnx(&tokens[1], &tokens[2], &tokens[3]).await
                    .map_err(|e| AppError::Database(format!("HSETNX failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: if result { 1 } else { 0 },
                    next_cursor: None,
                    graph: None,
                })
            }
            "HSTRLEN" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("HSTRLEN requires key and field".into()));
                }
                let result: i64 = self.client.hstrlen(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("HSTRLEN failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["length".into()],
                    rows: vec![serde_json::json!({"length": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "HINCRBY" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("HINCRBY requires key, field, and increment".into()));
                }
                let increment: i64 = tokens[3].parse()
                    .map_err(|_| AppError::Validation("HINCRBY increment must be a number".into()))?;
                let result: i64 = self.client.hincrby(&tokens[1], &tokens[2], increment).await
                    .map_err(|e| AppError::Database(format!("HINCRBY failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["value".into()],
                    rows: vec![serde_json::json!({"value": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "LSET" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("LSET requires key, index, and value".into()));
                }
                let index: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("LSET index must be a number".into()))?;
                let _: RedisValue = self.client.lset(&tokens[1], index, &tokens[3]).await
                    .map_err(|e| AppError::Database(format!("LSET failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": "OK"})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "LTRIM" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("LTRIM requires key, start, and stop".into()));
                }
                let start_idx: i64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("LTRIM start must be a number".into()))?;
                let stop_idx: i64 = tokens[3].parse()
                    .map_err(|_| AppError::Validation("LTRIM stop must be a number".into()))?;
                let _: RedisValue = self.client.ltrim(&tokens[1], start_idx, stop_idx).await
                    .map_err(|e| AppError::Database(format!("LTRIM failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": "OK"})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "LINSERT" => {
                if tokens.len() < 5 {
                    return Err(AppError::Validation("LINSERT requires key, BEFORE|AFTER, pivot, and value".into()));
                }
                let before = tokens[2].to_uppercase() == "BEFORE";
                let location = if before {
                    fred::types::ListLocation::Before
                } else {
                    fred::types::ListLocation::After
                };
                let result: i64 = self.client.linsert(&tokens[1], location, &tokens[3], &tokens[4]).await
                    .map_err(|e| AppError::Database(format!("LINSERT failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["length".into()],
                    rows: vec![serde_json::json!({"length": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SRANDMEMBER" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("SRANDMEMBER requires a key".into()));
                }
                let count: Option<usize> = if tokens.len() > 2 {
                    Some(tokens[2].parse()
                        .map_err(|_| AppError::Validation("SRANDMEMBER count must be a number".into()))?)
                } else {
                    None
                };
                let val: RedisValue = self.client.srandmember(&tokens[1], count).await
                    .map_err(|e| AppError::Database(format!("SRANDMEMBER failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = match val {
                    RedisValue::Array(items) => items.iter().map(|v| serde_json::json!({"member": Self::redis_value_to_json(v)})).collect(),
                    other => vec![serde_json::json!({"member": Self::redis_value_to_json(&other)})],
                };
                Ok(QueryResult {
                    columns: vec!["member".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SPOP" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("SPOP requires a key".into()));
                }
                let count: Option<usize> = if tokens.len() > 2 {
                    Some(tokens[2].parse()
                        .map_err(|_| AppError::Validation("SPOP count must be a number".into()))?)
                } else {
                    None
                };
                let val: RedisValue = self.client.spop(&tokens[1], count).await
                    .map_err(|e| AppError::Database(format!("SPOP failed: {}", e)))?;
                let rows: Vec<serde_json::Value> = match val {
                    RedisValue::Array(items) => items.iter().map(|v| serde_json::json!({"member": Self::redis_value_to_json(v)})).collect(),
                    other => vec![serde_json::json!({"member": Self::redis_value_to_json(&other)})],
                };
                Ok(QueryResult {
                    columns: vec!["member".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "ZRANGEBYSCORE" | "ZREVRANGEBYSCORE" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation(format!("{} requires key, min, and max", cmd)));
                }
                let min: f64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation(format!("{} min must be a number", cmd)))?;
                let max: f64 = tokens[3].parse()
                    .map_err(|_| AppError::Validation(format!("{} max must be a number", cmd)))?;
                let reverse = cmd == "ZREVRANGEBYSCORE";
                let with_scores = tokens.len() > 4 && tokens[4].to_uppercase() == "WITHSCORES";
                let vals: Vec<RedisValue> = if reverse {
                    Box::pin(self.client.zrevrangebyscore(&tokens[1], max, min, with_scores, None)).await
                } else {
                    Box::pin(self.client.zrangebyscore(&tokens[1], min, max, with_scores, None)).await
                }
                    .map_err(|e| AppError::Database(format!("{} failed: {}", cmd, e)))?;
                let mut rows = Vec::new();
                if with_scores {
                    let mut i = 0;
                    while i + 1 < vals.len() {
                        rows.push(serde_json::json!({
                            "member": Self::redis_value_to_json(&vals[i]),
                            "score": Self::redis_value_to_json(&vals[i + 1])
                        }));
                        i += 2;
                    }
                } else {
                    for v in &vals {
                        rows.push(serde_json::json!({"member": Self::redis_value_to_json(v)}));
                    }
                }
                Ok(QueryResult {
                    columns: if with_scores { vec!["member".into(), "score".into()] } else { vec!["member".into()] },
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "ZRANK" | "ZREVRANK" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation(format!("{} requires key and member", cmd)));
                }
                let result: Option<i64> = match cmd.as_str() {
                    "ZRANK" => self.client.zrank(&tokens[1], &tokens[2]).await,
                    "ZREVRANK" => self.client.zrevrank(&tokens[1], &tokens[2]).await,
                    _ => unreachable!(),
                }
                .map_err(|e| AppError::Database(format!("{} failed: {}", cmd, e)))?;
                Ok(QueryResult {
                    columns: vec!["rank".into()],
                    rows: vec![serde_json::json!({"rank": result})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "ZINCRBY" => {
                if tokens.len() < 4 {
                    return Err(AppError::Validation("ZINCRBY requires key, increment, and member".into()));
                }
                let increment: f64 = tokens[2].parse()
                    .map_err(|_| AppError::Validation("ZINCRBY increment must be a number".into()))?;
                let score: f64 = self.client.zincrby(&tokens[1], increment, &tokens[3]).await
                    .map_err(|e| AppError::Database(format!("ZINCRBY failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["score".into()],
                    rows: vec![serde_json::json!({"score": score})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 1,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SCAN" => {
                // SCAN [cursor] [MATCH pattern] [COUNT n]
                let mut cursor = "0";
                let mut pattern = "*";
                let mut count = 100;

                let mut i = 1;
                while i < tokens.len() {
                    if tokens[i].to_uppercase() == "MATCH" && i + 1 < tokens.len() {
                        pattern = &tokens[i + 1];
                        i += 2;
                    } else if tokens[i].to_uppercase() == "COUNT" && i + 1 < tokens.len() {
                        count = tokens[i + 1].parse().unwrap_or(100);
                        i += 2;
                    } else {
                        // First bare token is the cursor
                        if i == 1 {
                            cursor = &tokens[i];
                        }
                        i += 1;
                    }
                }

                let (keys, next_cursor) = self.scan_page(pattern, count, cursor).await?;

                let rows: Vec<serde_json::Value> = keys.iter().map(|key| {
                    let namespace = Self::extract_namespace(key);
                    Self::build_key_row(key, &namespace)
                }).collect();

                Ok(QueryResult {
                    columns: vec!["key".into(), "namespace".into(), "cursor".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: Some(next_cursor),
                    graph: None,
                })
            }
            "KEYS" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("KEYS requires a pattern".into()));
                }
                let keys: Vec<String> = self.scan_keys(&tokens[1], 1000).await?;
                let rows: Vec<serde_json::Value> = keys.iter().map(|key| {
                    let namespace = Self::extract_namespace(key);
                    Self::build_key_row(key, &namespace)
                }).collect();
                Ok(QueryResult {
                    columns: vec!["key".into(), "namespace".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "DBSIZE" => {
                let count: i64 = self.client.dbsize().await
                    .map_err(|e| AppError::Database(format!("DBSIZE failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["dbsize".into()],
                    rows: vec![serde_json::json!({"dbsize": count})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "PING" => {
                let result: RedisValue = self.client.ping().await
                    .map_err(|e| AppError::Database(format!("PING failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": Self::redis_value_to_json(&result)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "SELECT" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("SELECT requires a database number".into()));
                }
                let db_num: u8 = tokens[1].parse()
                    .map_err(|_| AppError::Validation("SELECT database must be a number (0-15)".into()))?;
                self.client.select(db_num).await
                    .map_err(|e| AppError::Database(format!("SELECT {} failed: {}", db_num, e)))?;
                self.db.store(db_num, Ordering::Relaxed);
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": "OK"})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "INFO" => {
                let info_kind = if tokens.len() > 1 {
                    match tokens[1].to_lowercase().as_str() {
                        "keyspace" => InfoKind::Keyspace,
                        "all" => InfoKind::All,
                        "server" => InfoKind::Server,
                        "clients" => InfoKind::Clients,
                        "memory" => InfoKind::Memory,
                        "persistence" => InfoKind::Persistence,
                        "stats" => InfoKind::Stats,
                        "replication" => InfoKind::Replication,
                        "cpu" => InfoKind::Cpu,
                        "commandstats" => InfoKind::CommandStats,
                        "cluster" => InfoKind::Cluster,
                        _ => InfoKind::Default,
                    }
                } else {
                    InfoKind::Default
                };

                let info_value: RedisValue = self.client.info(Some(info_kind)).await
                    .map_err(|e| AppError::Database(format!("INFO failed: {}", e)))?;

                let info_str = Self::redis_value_to_string(&info_value);
                let rows: Vec<serde_json::Value> = info_str.lines()
                    .filter(|line| !line.is_empty() && !line.starts_with('#'))
                    .filter_map(|line| {
                        let mut parts = line.splitn(2, ':');
                        let key = parts.next()?.to_string();
                        let value = parts.next()?.trim().to_string();
                        Some(serde_json::json!({"key": key, "value": value}))
                    })
                    .collect();

                Ok(QueryResult {
                    columns: vec!["key".into(), "value".into()],
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "RENAME" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("RENAME requires source and destination keys".into()));
                }
                self.client.rename::<(), _, _>(&tokens[1], &tokens[2]).await
                    .map_err(|e| AppError::Database(format!("RENAME failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({"result": "OK"})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "OBJECT" => {
                if tokens.len() < 3 {
                    return Err(AppError::Validation("OBJECT requires subcommand and key".into()));
                }
                let sub = tokens[1].to_uppercase();
                match sub.as_str() {
                    "ENCODING" | "IDLETIME" | "REFCOUNT" => {
                        Err(AppError::Validation(format!("OBJECT {} is not supported via this driver. Use Redis CLI directly.", sub)))
                    }
                    _ => Err(AppError::Validation(format!("Unknown OBJECT subcommand: {}", sub))),
                }
            }
            "DUMP" => {
                if tokens.len() < 2 {
                    return Err(AppError::Validation("DUMP requires a key".into()));
                }
                let val: RedisValue = self.client.dump(&tokens[1]).await
                    .map_err(|e| AppError::Database(format!("DUMP failed: {}", e)))?;
                Ok(QueryResult {
                    columns: vec!["dump".into()],
                    rows: vec![serde_json::json!({"dump": Self::redis_value_to_json(&val)})],
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,
                    next_cursor: None,
                    graph: None,
                })
            }
            "MULTI" | "EXEC" | "DISCARD" | "WATCH" => {
                Err(AppError::Validation(
                    "Transaction commands (MULTI/EXEC/DISCARD/WATCH) are not supported via execute. Use the transaction controls instead.".into()
                ))
            }
            "FLUSHDB" | "FLUSHALL" => {
                Err(AppError::Validation(
                    format!("Destructive command '{}' is blocked for safety. Use Redis CLI directly if needed.", cmd)
                ))
            }
            _ => {
                Err(AppError::Validation(
                    format!("Unsupported Redis command: '{}'. Supported: GET, SET, MGET, DEL, EXISTS, TYPE, TTL, PTTL, EXPIRE, PEXPIRE, SETNX, SETEX, GETDEL, GETSET, APPEND, STRLEN, PERSIST, EXPIREAT, INCR, DECR, INCRBY, DECRBY, HGET, HSET, HMSET, HSETNX, HGETALL, HDEL, HEXISTS, HLEN, HKEYS, HVALS, HMGET, HSTRLEN, HINCRBY, LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN, LSET, LTRIM, LINSERT, SADD, SMEMBERS, SISMEMBER, SREM, SCARD, SRANDMEMBER, SPOP, ZADD, ZRANGE, ZREVRANGE, ZRANGEBYSCORE, ZREVRANGEBYSCORE, ZRANK, ZREVRANK, ZREM, ZCARD, ZSCORE, ZINCRBY, SCAN, KEYS, DBSIZE, PING, SELECT, INFO, RENAME, OBJECT, DUMP", cmd)
                ))
            }
        }
    }
}

#[async_trait]
impl DbDriver for RedisDriver {
    fn db_type(&self) -> crate::db::DbType {
        crate::db::DbType::Redis
    }

    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        let tokens = Self::parse_redis_command(query)?;
        tracing::info!("[Redis Execute] cmd={}, tokens={:?}", tokens[0], tokens);
        self.execute_redis_command(&tokens).await
    }

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        let info_value: RedisValue = self
            .client
            .info(Some(InfoKind::Keyspace))
            .await
            .map_err(|e| AppError::Database(format!("INFO keyspace failed: {}", e)))?;

        let info_str = Self::redis_value_to_string(&info_value);
        let mut databases = Vec::new();

        for line in info_str.lines() {
            let line = line.trim();
            if let Some(db_part) = line.strip_prefix("db") {
                if let Some(colon_pos) = db_part.find(':') {
                    let db_num = &db_part[..colon_pos];
                    databases.push(format!("db{}", db_num));
                }
            }
        }

        if databases.is_empty() {
            databases.push(format!("db{}", self.db.load(Ordering::Relaxed)));
        }

        Ok(databases)
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_tables(
        &self,
        _schema: Option<String>,
        filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let pattern = filter.unwrap_or_else(|| "*".to_string());
        tracing::debug!(
            "Redis fetch_tables: pattern='{}', schema={:?}",
            pattern,
            _schema
        );
        let keys = self.scan_keys(&pattern, 500).await?;

        let mut namespaces: Vec<String> = keys
            .iter()
            .map(|k| Self::extract_namespace(k))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        namespaces.sort();

        tracing::debug!(
            "Redis fetch_tables: found {} keys, {} namespaces: {:?}",
            keys.len(),
            namespaces.len(),
            namespaces
        );
        Ok(namespaces)
    }

    async fn fetch_views(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_procedures(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_triggers(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_functions(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![])
    }

    async fn fetch_columns(
        &self,
        table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        // 'table' here is the namespace prefix. Sample a single bounded SCAN
        // page (keys starting with "table:*") so structure inference stays fast
        // even when the namespace holds a huge number of keys. Scanning every
        // key with scan_keys would block the response for large namespaces.
        let pattern = format!("{}:*", table);
        let (keys, _next_cursor) = self.scan_page(&pattern, 100, "0").await?;

        let mut columns = Vec::new();

        // Add the key column
        columns.push(serde_json::json!({
            "name": "key",
            "type": "string",
            "isNullable": false,
            "isPrimaryKey": true,
            "defaultValue": null,
            "comment": null
        }));

        // Sample a few keys to determine the structure
        let sample_size = std::cmp::min(keys.len(), 5);
        let mut type_counts: HashMap<String, usize> = HashMap::new();

        for key in &keys[..sample_size] {
            let key_type = self.get_key_type(key).await.unwrap_or_default();
            *type_counts.entry(key_type).or_insert(0) += 1;
        }

        // Determine dominant type
        let dominant_type = type_counts
            .iter()
            .max_by_key(|(_, count)| *count)
            .map(|(t, _)| t.as_str())
            .unwrap_or("string");

        match dominant_type {
            "hash" => {
                columns.push(serde_json::json!({
                    "name": "field",
                    "type": "hash_field",
                    "isNullable": true,
                    "isPrimaryKey": false,
                    "defaultValue": null,
                    "comment": "Hash field name"
                }));
                columns.push(serde_json::json!({
                    "name": "value",
                    "type": "hash_value",
                    "isNullable": true,
                    "isPrimaryKey": false,
                    "defaultValue": null,
                    "comment": "Hash field value"
                }));
            }
            "list" => {
                columns.push(serde_json::json!({
                    "name": "index",
                    "type": "integer",
                    "isNullable": false,
                    "isPrimaryKey": false,
                    "defaultValue": null,
                    "comment": "List index"
                }));
                columns.push(serde_json::json!({
                    "name": "value",
                    "type": "list_element",
                    "isNullable": true,
                    "isPrimaryKey": false,
                    "defaultValue": null,
                    "comment": "List element value"
                }));
            }
            "set" => {
                columns.push(serde_json::json!({
                    "name": "member",
                    "type": "set_member",
                    "isNullable": false,
                    "isPrimaryKey": true,
                    "defaultValue": null,
                    "comment": "Set member"
                }));
            }
            "zset" => {
                columns.push(serde_json::json!({
                    "name": "member",
                    "type": "string",
                    "isNullable": false,
                    "isPrimaryKey": true,
                    "defaultValue": null,
                    "comment": "Sorted set member"
                }));
                columns.push(serde_json::json!({
                    "name": "score",
                    "type": "double",
                    "isNullable": false,
                    "isPrimaryKey": false,
                    "defaultValue": null,
                    "comment": "Sorted set score"
                }));
            }
            _ => {
                columns.push(serde_json::json!({
                    "name": "value",
                    "type": "string",
                    "isNullable": true,
                    "isPrimaryKey": false,
                    "defaultValue": null,
                    "comment": "Key value"
                }));
            }
        }

        Ok(columns)
    }

    async fn fetch_indexes(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn fetch_foreign_keys(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn fetch_constraints(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn fetch_ddl(
        &self,
        name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<String> {
        // For Redis, 'name' is a key. Show TYPE, TTL, and value.
        let key_type = self.get_key_type(name).await?;
        let ttl: i64 = self.client.ttl(name).await.unwrap_or(-1);
        let val = self.read_key_value(name, &key_type).await?;

        let mut ddl = format!(
            "Key: {}\nType: {}\nTTL: {}\n\n",
            name,
            key_type,
            if ttl >= 0 {
                format!("{}s", ttl)
            } else {
                "none".to_string()
            }
        );

        match key_type.as_str() {
            "string" => {
                ddl.push_str(&format!("Value: {}\n", val));
            }
            "hash" => {
                ddl.push_str("Hash fields:\n");
                if let Some(obj) = val.as_object() {
                    for (field, value) in obj {
                        ddl.push_str(&format!("  {}: {}\n", field, value));
                    }
                }
            }
            "list" => {
                ddl.push_str("List elements:\n");
                if let Some(arr) = val.as_array() {
                    for (i, item) in arr.iter().enumerate() {
                        ddl.push_str(&format!("  [{}]: {}\n", i, item));
                    }
                }
            }
            "set" => {
                ddl.push_str("Set members:\n");
                if let Some(arr) = val.as_array() {
                    for item in arr {
                        ddl.push_str(&format!("  - {}\n", item));
                    }
                }
            }
            "zset" => {
                ddl.push_str("Sorted set members:\n");
                if let Some(arr) = val.as_array() {
                    for item in arr {
                        if let Some(obj) = item.as_object() {
                            let member =
                                obj.get("member").map(|v| v.to_string()).unwrap_or_default();
                            let score = obj.get("score").map(|v| v.to_string()).unwrap_or_default();
                            ddl.push_str(&format!("  {} (score: {})\n", member, score));
                        }
                    }
                }
            }
            _ => {
                ddl.push_str(&format!("Raw value: {}\n", val));
            }
        }

        Ok(ddl)
    }

    async fn fetch_parameters(
        &self,
        _name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn close(&self) -> AppResult<()> {
        let _ = self.client.quit().await;
        Ok(())
    }
}

#[async_trait]
impl DataReader for RedisDriver {
    async fn fetch_rows(
        &self,
        table: &str,
        _schema: Option<&str>,
        _columns: &[String],
        _pk_column: &str,
        _last_key: Option<serde_json::Value>,
        batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>> {
        use futures::StreamExt;

        let pattern = format!("{}:*", table);
        // Respect the requested batch size instead of scanning the whole namespace
        let keys = self
            .scan_page(&pattern, batch_size.max(1) as i64, "0")
            .await?
            .0;

        // Read each key concurrently to avoid sequential N+1 round trips.
        let concurrency = batch_size.clamp(1, 50).max(1);
        let rows: Vec<serde_json::Value> = futures::stream::iter(keys)
            .map(|key| {
                let client = self.client.clone();
                let key_c = key.clone();
                async move { Self::read_key_row(&client, &key_c).await }
            })
            .buffer_unordered(concurrency)
            .collect()
            .await;

        Ok(rows)
    }

    async fn count_rows(&self, table: &str, _schema: Option<&str>) -> AppResult<u64> {
        let pattern = format!("{}:*", table);
        let keys = self.scan_keys(&pattern, 10000).await?;
        Ok(keys.len() as u64)
    }
}

impl RedisDriver {
    async fn read_key_row(client: &RedisClient, key: &str) -> serde_json::Value {
        let key_type = match client.r#type::<String, _>(key).await {
            Ok(t) => t.to_lowercase(),
            Err(_) => String::new(),
        };

        let val = match &key_type[..] {
            "string" => client
                .get(key)
                .await
                .ok()
                .map(|v| Self::redis_value_to_json(&v))
                .unwrap_or(serde_json::Value::Null),
            "list" => {
                let len: i64 = client.llen(key).await.unwrap_or(0);
                if len <= 0 {
                    serde_json::Value::Array(vec![])
                } else {
                    client
                        .lrange::<Vec<RedisValue>, _>(key, 0, len - 1)
                        .await
                        .map(|vals| {
                            serde_json::Value::Array(
                                vals.iter().map(Self::redis_value_to_json).collect(),
                            )
                        })
                        .unwrap_or(serde_json::Value::Null)
                }
            }
            "set" => client
                .smembers::<Vec<RedisValue>, _>(key)
                .await
                .map(|vals| {
                    serde_json::Value::Array(vals.iter().map(Self::redis_value_to_json).collect())
                })
                .unwrap_or(serde_json::Value::Null),
            "zset" => {
                let vals: Vec<RedisValue> = client
                    .zrange(key, 0, -1, None, false, None, true)
                    .await
                    .unwrap_or_default();
                let mut arr = Vec::new();
                let mut i = 0;
                while i + 1 < vals.len() {
                    if let Some(score) = vals[i + 1].as_f64() {
                        arr.push(serde_json::json!({
                            "member": Self::redis_value_to_json(&vals[i]),
                            "score": score
                        }));
                    }
                    i += 2;
                }
                serde_json::Value::Array(arr)
            }
            "hash" => client
                .hgetall::<Vec<(RedisValue, RedisValue)>, _>(key)
                .await
                .map(|entries| {
                    let mut map = serde_json::Map::new();
                    for (field, val) in entries {
                        map.insert(
                            Self::redis_value_to_string(&field),
                            Self::redis_value_to_json(&val),
                        );
                    }
                    serde_json::Value::Object(map)
                })
                .unwrap_or(serde_json::Value::Null),
            _ => serde_json::Value::Null,
        };

        let mut row = serde_json::Map::new();
        row.insert("key".into(), serde_json::Value::String(key.to_string()));
        row.insert("type".into(), serde_json::Value::String(key_type));
        row.insert("value".into(), val);
        serde_json::Value::Object(row)
    }
}

#[async_trait]
impl DataWriter for RedisDriver {
    async fn upsert_rows(
        &self,
        table: &str,
        _schema: Option<&str>,
        columns: &[String],
        _primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<UpsertResult> {
        if rows.is_empty() || columns.is_empty() {
            return Ok(UpsertResult::default());
        }

        let mut affected = 0u64;

        for row in rows {
            // For Redis upsert, 'key' column is required, and 'value' is the value to set
            let key = row.get("key").and_then(|v| v.as_str()).unwrap_or("");

            if key.is_empty() {
                continue;
            }

            let full_key = format!("{}:{}", table, key);

            // If 'value' field exists, SET it as a string
            if let Some(value) = row.get("value") {
                let val_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                let _: RedisValue = self
                    .client
                    .set(&full_key, &val_str, None, None, false)
                    .await
                    .map_err(|e| AppError::Database(format!("SET {} failed: {}", full_key, e)))?;
                affected += 1;
            }
            // If 'field' and 'value' exist, HSET
            else if let (Some(field), Some(val)) = (row.get("field"), row.get("value")) {
                let field_str = field.as_str().unwrap_or("");
                let val_str = match val {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                let _: RedisValue = self
                    .client
                    .hset(&full_key, (field_str, &val_str))
                    .await
                    .map_err(|e| AppError::Database(format!("HSET {} failed: {}", full_key, e)))?;
                affected += 1;
            }
        }

        Ok(UpsertResult {
            affected,
            skipped: 0,
        })
    }
}

impl CapabilityProvider for RedisDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_transactions: false,
            supports_savepoints: false,
            supports_upsert: true,
            upsert_strategy: Some(UpsertStrategy::Hset),
            supports_keyset_pagination: false,
            supports_streaming: true,
            supports_json: true,
            supports_arrays: true,
            supports_returning: false,
            max_batch_size: 1000,
        }
    }
}
