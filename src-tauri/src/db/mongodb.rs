use crate::db::DbDriver;
use crate::db::PoolConfig;
use crate::db::UpsertResult;
use crate::db::{CapabilityProvider, DataReader, DataWriter};
use crate::error::{AppError, AppResult};
use crate::models::sync::{DriverCapabilities, UpsertStrategy};
use crate::models::QueryResult;
use async_trait::async_trait;
use futures::StreamExt;
use mongodb::{
    bson::{doc, Bson, Document},
    options::ClientOptions,
    Client,
};
use std::time::Instant;

/// Stable type name for schema inference (used by cross-DB table creation).
fn bson_element_type_name(value: &Bson) -> String {
    match value {
        Bson::Double(_) => "Double".into(),
        Bson::String(_) => "String".into(),
        Bson::Array(_) => "Array".into(),
        Bson::Document(_) => "Object".into(),
        Bson::Boolean(_) => "Boolean".into(),
        Bson::Null => "Null".into(),
        Bson::RegularExpression(_) => "RegularExpression".into(),
        Bson::JavaScriptCode(_) | Bson::JavaScriptCodeWithScope(_) => "JavaScript".into(),
        Bson::Int32(_) => "Int32".into(),
        Bson::Int64(_) => "Int64".into(),
        Bson::Timestamp(_) => "Timestamp".into(),
        Bson::Binary(_) => "Binary".into(),
        Bson::ObjectId(_) => "ObjectId".into(),
        Bson::DateTime(_) => "DateTime".into(),
        Bson::Symbol(_) => "Symbol".into(),
        Bson::Decimal128(_) => "Decimal128".into(),
        Bson::Undefined => "Undefined".into(),
        Bson::MaxKey => "MaxKey".into(),
        Bson::MinKey => "MinKey".into(),
        Bson::DbPointer(_) => "DbPointer".into(),
    }
}

/// Length (in chars) of the textual content a value would occupy when stored as
/// a string in the target RDBMS. Used to size VARCHAR columns when creating
/// tables from MongoDB schema inference.
fn bson_string_content_len(value: &Bson) -> usize {
    match value {
        Bson::String(s) => s.chars().count(),
        Bson::ObjectId(oid) => oid.to_hex().len(),
        Bson::Boolean(_) => 1,
        Bson::Int32(_) | Bson::Int64(_) => 20, // max i64 length
        Bson::Double(f) => format!("{}", f).len(),
        Bson::DateTime(_) => 23, // ISO-8601 with millis
        Bson::Decimal128(d) => format!("{}", d).len(),
        Bson::RegularExpression(re) => re.pattern.len() + re.options.len() + 4,
        Bson::Binary(b) => b.bytes.len() * 2,
        // For nested objects/arrays, approximate with serialized JSON length.
        // Cap at a reasonable size to avoid pathological growth.
        other => {
            let len = bson_to_json(other).to_string().len();
            if len > 65535 {
                65535
            } else {
                len
            }
        }
    }
}

fn bson_to_json(value: &Bson) -> serde_json::Value {
    match value {
        Bson::Int32(i) => serde_json::Value::Number(serde_json::Number::from(*i)),
        Bson::Int64(i) => serde_json::Value::Number(serde_json::Number::from(*i)),
        Bson::Double(f) => serde_json::Number::from_f64(*f)
            .map_or(serde_json::Value::Null, serde_json::Value::Number),
        Bson::Boolean(b) => serde_json::Value::Bool(*b),
        Bson::String(s) => serde_json::Value::String(s.clone()),
        Bson::Array(arr) => serde_json::Value::Array(arr.iter().map(bson_to_json).collect()),
        Bson::Document(doc) => {
            let map = doc
                .iter()
                .map(|(k, v)| (k.clone(), bson_to_json(v)))
                .collect();
            serde_json::Value::Object(map)
        }
        Bson::Null => serde_json::Value::Null,
        Bson::DateTime(dt) => {
            let millis = dt.timestamp_millis();
            let date_obj = doc! { "$date": doc! { "$numberLong": millis.to_string() } };
            serde_json::to_value(&date_obj).unwrap_or(serde_json::Value::Null)
        }
        Bson::ObjectId(oid) => {
            let obj = doc! { "$oid": oid.to_hex() };
            serde_json::to_value(&obj).unwrap_or(serde_json::Value::Null)
        }
        Bson::Binary(bin) => {
            serde_json::Value::String(format!("<binary: {} bytes>", bin.bytes.len()))
        }
        Bson::RegularExpression(re) => {
            serde_json::Value::String(format!("/{}/{}", re.pattern, re.options))
        }
        _ => serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
    }
}

pub struct MongoDbDriver {
    client: Client,
    _default_db: Option<String>,
}

impl MongoDbDriver {
    pub async fn new(url: &str, pool_config: Option<PoolConfig>) -> AppResult<Self> {
        let sanitized_url = if let Some(idx) = url.find('@') {
            format!("{}@{}", "mongodb://***", &url[idx + 1..])
        } else {
            url.to_string()
        };

        tracing::debug!("Initializing MongoDB driver with URL: {}", sanitized_url);

        let mut client_options = ClientOptions::parse(url).await.map_err(|e| {
            tracing::error!(
                "Failed to parse MongoDB URL: {}. Error: {}",
                sanitized_url,
                e
            );
            AppError::Connection(format!("Failed to parse MongoDB URL: {}", e))
        })?;

        // If directConnection is explicitly set in the URL, let it be.
        // Otherwise, apply our local/replicaSet logic.
        if client_options.direct_connection.is_none() {
            let is_local = url.contains("localhost") || url.contains("127.0.0.1");

            // Special case: If it's a local address but also contains replicaSet,
            // it might be an SSH tunnel to a replica set.
            // In that case, we should allow discovery (direct_connection = false).
            if is_local && !url.contains("replicaSet=") {
                tracing::debug!(
                    "Localhost detected and no replicaSet, forcing direct_connection = true"
                );
                client_options.direct_connection = Some(true);
            } else if url.contains("replicaSet=") {
                client_options.direct_connection = Some(false);
                tracing::debug!("ReplicaSet detected, disabling direct_connection for discovery");
            } else {
                client_options.direct_connection = Some(true);
                tracing::debug!("Defaulting to direct_connection = true");
            }
        }

        tracing::debug!(
            "MongoDB client options final Direct Connection: {:?}",
            client_options.direct_connection
        );

        // Apply pool config if provided
        if let Some(ref cfg) = pool_config {
            client_options.max_pool_size = Some(cfg.max_connections);
            if let Some(idle) = cfg.idle_timeout {
                client_options.max_idle_time = Some(idle);
            }
            if let Some(ka) = cfg.keep_alive {
                client_options.heartbeat_freq = Some(ka);
            }
        }

        // Set longer timeouts for SSH tunnel latency
        client_options.server_selection_timeout = Some(std::time::Duration::from_secs(10));
        client_options.connect_timeout = Some(std::time::Duration::from_secs(10));
        client_options.retry_writes = Some(false);
        client_options.retry_reads = Some(false);

        tracing::debug!(
            "Setting MongoDB timeouts: Connect=10s, ServerSelection=10s, Retries=Disabled"
        );

        let default_db = client_options.default_database.clone();

        let client = Client::with_options(client_options).map_err(|e| {
            tracing::error!(
                "Failed to create MongoDB client for {}: {}",
                sanitized_url,
                e
            );
            AppError::Connection(format!("Failed to create MongoDB client: {}", e))
        })?;

        // Verify connection with a ping
        tracing::debug!(
            "Pinging MongoDB server at {} to verify connection...",
            sanitized_url
        );
        let ping_start = Instant::now();

        client.database("admin").run_command(doc! {"ping": 1}).await
            .map_err(|e| {
                let msg = e.to_string().to_uppercase();
                let elapsed = ping_start.elapsed();
                tracing::error!("MongoDB ping failed after {:?} for {}: {}", elapsed, sanitized_url, msg);

                if msg.contains("CONNECTION REFUSED") || msg.contains("OS ERROR 111") {
                    AppError::Connection("MongoDB connection refused: the server might not be running or the port is blocked".into())
                } else if msg.contains("TIMEOUT") || msg.contains("SERVER SELECTION TIMEOUT") {
                    AppError::Connection("MongoDB connection timeout: check if the host is reachable and the port is open".into())
                } else if msg.contains("AUTHENTICATION FAILED") || msg.contains("AUTH FAILED") {
                    AppError::Auth("MongoDB Authentication Failed: please check your credentials".to_string())
                } else {
                    AppError::Connection(format!("MongoDB Error (after {:?}): {}", elapsed, msg))
                }
            })?;

        tracing::info!(
            "MongoDB connection to {} verified successfully in {:?}",
            sanitized_url,
            ping_start.elapsed()
        );

        Ok(Self {
            client,
            _default_db: default_db,
        })
    }

    fn get_db(&self, schema: Option<String>) -> AppResult<mongodb::Database> {
        let db_name = schema
            .or_else(|| self._default_db.clone())
            .unwrap_or_else(|| "test".to_string());
        Ok(self.client.database(&db_name))
    }
}

#[async_trait]
impl DbDriver for MongoDbDriver {
    fn db_type(&self) -> crate::db::DbType {
        crate::db::DbType::Mongodb
    }

    async fn execute(&self, query: &str) -> AppResult<QueryResult> {
        let start = Instant::now();

        // Try to parse query as JSON command
        let json_query: serde_json::Value = serde_json::from_str(query).map_err(|e| {
            AppError::Validation(format!("MongoDB query must be valid JSON: {}", e))
        })?;

        let obj = json_query
            .as_object()
            .ok_or_else(|| AppError::Validation("MongoDB query must be a JSON object".into()))?;

        tracing::info!("[MongoDB Execute] query: {}", query);

        // Cell update support:
        // { "database": "db", "collection": "name", "update": { "filter": {...}, "set": { "col": value } } }
        // Must run BEFORE the 'collection' find branch below, which also
        // matches any query that carries a "collection" field.
        if let Some(update_spec) = obj
            .get("update")
            .and_then(|v| v.as_object())
            .filter(|o| o.contains_key("filter") && o.contains_key("set"))
        {
            let coll_name = obj
                .get("collection")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::Validation("MongoDB cell update requires a 'collection' field".into())
                })?;

            let filter_doc = match update_spec.get("filter") {
                Some(serde_json::Value::Object(map)) => {
                    let mut doc = Document::new();
                    for (k, v) in map {
                        doc.insert(k, json_value_to_bson(v));
                    }
                    doc
                }
                _ => {
                    return Err(AppError::Validation(
                        "MongoDB cell update 'filter' must be an object".into(),
                    ))
                }
            };

            let set_value = update_spec
                .get("set")
                .and_then(|v| v.as_object())
                .ok_or_else(|| {
                    AppError::Validation("MongoDB cell update 'set' must be an object".into())
                })?;
            if set_value.contains_key("_id") {
                return Err(AppError::Validation(
                    "Updating the '_id' field is not supported".into(),
                ));
            }
            let mut set_doc = Document::new();
            for (k, v) in set_value {
                set_doc.insert(k, json_value_to_bson(v));
            }

            let db_name = obj
                .get("database")
                .and_then(|v| v.as_str())
                .map(String::from);
            let db = self.get_db(db_name.clone())?;
            let coll = db.collection::<Document>(coll_name);

            let result = coll
                .update_one(filter_doc, doc! { "$set": set_doc })
                .await
                .map_err(|e| AppError::Database(format!("MongoDB cell update failed: {}", e)))?;

            tracing::info!(
                "[MongoDB Execute] path=cell_update, collection={}, modified={}, matched={}",
                coll_name,
                result.modified_count,
                result.matched_count,
            );

            return Ok(QueryResult {
                columns: vec!["modified".to_string(), "matched".to_string()],
                rows: vec![serde_json::json!({
                    "modified": result.modified_count,
                    "matched": result.matched_count,
                })],
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: Some(vec!["_id".to_string()]),
                rows_affected: result.modified_count,

                next_cursor: None,
            });
        }

        // Simple 'find' support: { "collection": "name", "find": { ... }, "limit": 100 }
        if let Some(coll_name) = obj.get("collection").and_then(|v| v.as_str()) {
            let db_name = obj
                .get("database")
                .and_then(|v| v.as_str())
                .map(String::from);
            let db = self.get_db(db_name)?;
            let coll = db.collection::<Document>(coll_name);

            let filter = obj
                .get("find")
                .and_then(|v| mongodb::bson::to_document(v).ok())
                .unwrap_or_default();

            let limit = obj.get("limit").and_then(|v| v.as_i64()).unwrap_or(100);
            let skip = obj.get("skip").and_then(|v| v.as_i64()).unwrap_or(0);

            let sort = obj
                .get("sort")
                .and_then(|v| mongodb::bson::to_document(v).ok());

            let project = obj
                .get("project")
                .and_then(|v| mongodb::bson::to_document(v).ok());

            let collation = obj.get("collation").and_then(|v| v.as_object()).map(|o| {
                mongodb::options::Collation::builder()
                    .locale(
                        o.get("locale")
                            .and_then(|v| v.as_str())
                            .unwrap_or("simple")
                            .to_string(),
                    )
                    .build()
            });

            let hint = obj.get("hint").and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(mongodb::options::Hint::Name(s.to_string()))
                } else if let Some(_o) = v.as_object() {
                    let doc = mongodb::bson::to_document(v).unwrap_or_default();
                    Some(mongodb::options::Hint::Keys(doc))
                } else {
                    None
                }
            });

            let mut query = coll.find(filter).limit(limit).skip(skip as u64);

            if let Some(s) = sort {
                query = query.sort(s);
            }
            if let Some(p) = project {
                query = query.projection(p);
            }
            if let Some(c) = collation {
                query = query.collation(c);
            }
            if let Some(h) = hint {
                query = query.hint(h);
            }

            let mut cursor = query
                .await
                .map_err(|e| AppError::Database(format!("MongoDB find failed: {}", e)))?;

            let mut rows = Vec::new();
            let mut columns_set = std::collections::HashSet::new();

            while let Some(result) = cursor.next().await {
                let doc = result
                    .map_err(|e| AppError::Database(format!("Error fetching document: {}", e)))?;
                let json_val = bson_to_json(&Bson::Document(doc));

                if let Some(obj) = json_val.as_object() {
                    for key in obj.keys() {
                        columns_set.insert(key.clone());
                    }
                }
                rows.push(json_val);
            }

            let mut columns: Vec<String> = columns_set.into_iter().collect();
            columns.sort();

            tracing::info!(
                "[MongoDB Execute] path=collection, collection={}, rows={}, cols={:?}",
                coll_name,
                rows.len(),
                columns
            );

            return Ok(QueryResult {
                columns,
                rows,
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: Some(vec!["_id".to_string()]),
                rows_affected: 0,

                next_cursor: None,
            });
        }

        // Generic command support: { "listCollections": 1 }
        let db_name = obj
            .get("database")
            .and_then(|v| v.as_str())
            .map(String::from);
        let db = self.get_db(db_name.clone())?;
        tracing::info!(
            "[MongoDB Execute] generic command: db={:?}, raw_query={}",
            db_name,
            json_query
        );

        // Strip non-command fields before sending to run_command
        let mut cmd_obj = json_query.clone();
        if let Some(map) = cmd_obj.as_object_mut() {
            map.remove("database");
            map.remove("collection");
        }
        tracing::info!("[MongoDB Execute] stripped command: {}", cmd_obj);

        let command = serde_json::from_value::<Document>(cmd_obj)
            .map_err(|e| AppError::Validation(format!("Invalid BSON document: {}", e)))?;

        tracing::info!(
            "[MongoDB Execute] run_command on db {:?}: {:?}",
            db_name,
            command
        );

        let result = db
            .run_command(command)
            .await
            .map_err(|e| AppError::Database(format!("MongoDB command failed: {}", e)))?;

        tracing::info!("[MongoDB Execute] command result: {:?}", result);

        let json_result = bson_to_json(&Bson::Document(result));

        tracing::info!("[MongoDB Execute] path=command, raw_result={}", json_result);

        // Flatten cursor-based results (listCollections, listIndexes, etc.)
        if let Some(cursor) = json_result.get("cursor").and_then(|v| v.as_object()) {
            if let Some(batch) = cursor
                .get("firstBatch")
                .or_else(|| cursor.get("nextBatch"))
                .and_then(|v| v.as_array())
            {
                if !batch.is_empty() {
                    let rows: Vec<serde_json::Value> = batch.to_vec();
                    let mut columns_set = std::collections::HashSet::new();
                    for row in &rows {
                        if let Some(obj) = row.as_object() {
                            for key in obj.keys() {
                                columns_set.insert(key.clone());
                            }
                        }
                    }
                    let mut columns: Vec<String> = columns_set.into_iter().collect();
                    columns.sort();
                    tracing::info!(
                        "[MongoDB Execute] flattened cursor with {} rows, cols={:?}",
                        rows.len(),
                        columns
                    );
                    return Ok(QueryResult {
                        columns,
                        rows,
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        primary_keys: None,
                        rows_affected: 0,

                        next_cursor: None,
                    });
                }
            }
        }

        // Flatten databases array (listDatabases command)
        if let Some(dbs) = json_result.get("databases").and_then(|v| v.as_array()) {
            if !dbs.is_empty() {
                let rows: Vec<serde_json::Value> = dbs.to_vec();
                let mut columns_set = std::collections::HashSet::new();
                for row in &rows {
                    if let Some(obj) = row.as_object() {
                        for key in obj.keys() {
                            columns_set.insert(key.clone());
                        }
                    }
                }
                let mut columns: Vec<String> = columns_set.into_iter().collect();
                columns.sort();
                tracing::info!(
                    "[MongoDB Execute] flattened databases with {} rows, cols={:?}",
                    rows.len(),
                    columns
                );
                return Ok(QueryResult {
                    columns,
                    rows,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    primary_keys: None,
                    rows_affected: 0,

                    next_cursor: None,
                });
            }
        }

        tracing::info!("[MongoDB Execute] path=command, returning raw result as single row");
        Ok(QueryResult {
            columns: vec!["result".to_string()],
            rows: vec![json_result],
            execution_time_ms: start.elapsed().as_millis() as u64,
            primary_keys: None,
            rows_affected: 0,

            next_cursor: None,
        })
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        // For MongoDB, we treat databases as schemas to allow UI switching.
        self.fetch_databases().await
    }

    async fn fetch_databases(&self) -> AppResult<Vec<String>> {
        self.client
            .list_database_names()
            .await
            .map_err(|e| AppError::Database(format!("Failed to list databases: {}", e)))
    }

    async fn fetch_tables(
        &self,
        schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        let db = self.get_db(schema)?;
        let mut collections = db
            .list_collection_names()
            .await
            .map_err(|e| AppError::Database(format!("Failed to list collections: {}", e)))?;

        collections.retain(|name| !name.starts_with("system."));
        Ok(collections)
    }

    async fn fetch_views(
        &self,
        _schema: Option<String>,
        _filter: Option<String>,
    ) -> AppResult<Vec<String>> {
        Ok(vec![]) // MongoDB views are listed in collections usually, or needs special filtering
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
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let (db_name, collection_name) =
            resolve_table_names(table, schema.as_deref(), &self._default_db)?;
        let db = self.client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);

        // Sample up to 200 documents to guess "schema" and infer sizes.
        const SAMPLE_SIZE: i64 = 200;
        let mut cursor = coll
            .find(doc! {})
            .limit(SAMPLE_SIZE)
            .await
            .map_err(|e| AppError::Database(format!("Failed to sample collection: {}", e)))?;

        // Per-field info: BSON type name and longest observed string length.
        let mut field_info: std::collections::HashMap<String, (String, usize)> =
            std::collections::HashMap::new();

        while let Some(result) = cursor.next().await {
            let doc = result.unwrap_or_default();
            for (key, value) in doc {
                let type_name = bson_element_type_name(&value);
                let str_len = bson_string_content_len(&value);
                field_info
                    .entry(key.clone())
                    .and_modify(|(t, max)| {
                        if str_len > *max {
                            *max = str_len;
                        }
                        // Prefer a concrete type over a Null placeholder
                        if *t == "Null" || *t == "Undefined" {
                            *t = type_name.clone();
                        }
                    })
                    .or_insert((type_name, str_len));
            }
        }

        // Always include an `_id` field, as it is standard in MongoDB,
        // even if the collection is empty.
        if !field_info.contains_key("_id") {
            field_info.insert("_id".to_string(), ("ObjectId".to_string(), 24));
        }

        let mut cols = Vec::new();
        for (name, (type_name, max_len)) in field_info {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), name.clone().into());
            map.insert("type".into(), type_name.into());
            map.insert("isNullable".into(), (name != "_id").into());
            map.insert("isPrimaryKey".into(), (name == "_id").into());
            map.insert(
                "maxLength".into(),
                serde_json::Value::Number(serde_json::Number::from(max_len as u64)),
            );
            map.insert("defaultValue".into(), serde_json::Value::Null);
            map.insert("comment".into(), serde_json::Value::Null);
            cols.push(serde_json::Value::Object(map));
        }

        Ok(cols)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        let db = self.get_db(schema)?;
        let coll = db.collection::<Document>(table);

        let mut cursor = coll
            .list_indexes()
            .await
            .map_err(|e| AppError::Database(format!("Failed to list indexes: {}", e)))?;

        let mut idxs = Vec::new();
        while let Some(result) = cursor.next().await {
            let index =
                result.map_err(|e| AppError::Database(format!("Error fetching index: {}", e)))?;
            let mut map = serde_json::Map::new();

            let name = index
                .options
                .as_ref()
                .and_then(|o| o.name.clone())
                .unwrap_or_else(|| "unknown".to_string());
            let keys = &index.keys;
            let unique = index
                .options
                .as_ref()
                .and_then(|o| o.unique)
                .unwrap_or(false);

            map.insert("name".into(), name.into());
            map.insert("column".into(), format!("{:?}", keys).into());
            map.insert("isUnique".into(), unique.into());
            map.insert("type".into(), "mongo-index".into());

            idxs.push(serde_json::Value::Object(map));
        }

        Ok(idxs)
    }

    async fn fetch_foreign_keys(
        &self,
        _table: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![]) // MongoDB doesn't have enforced FKs
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
        schema: Option<String>,
    ) -> AppResult<String> {
        let db = self.get_db(schema)?;
        // For Mongo, "DDL" could be collection options or validation rules
        let mut cursor = db
            .list_collections()
            .filter(doc! { "name": name })
            .await
            .map_err(|e| AppError::Database(format!("Failed to get collection info: {}", e)))?;

        if let Some(result) = cursor.next().await {
            let info = result.map_err(|e| {
                AppError::Database(format!("Error fetching collection info: {}", e))
            })?;
            return Ok(serde_json::to_string_pretty(&info).unwrap_or_default());
        }

        Ok(format!("-- Collection '{}' info not found", name))
    }

    async fn fetch_parameters(
        &self,
        _name: &str,
        _object_type: &str,
        _schema: Option<String>,
    ) -> AppResult<Vec<serde_json::Value>> {
        Ok(vec![])
    }

    async fn fetch_mongo_structure(&self) -> AppResult<serde_json::Value> {
        let databases = self.fetch_databases().await?;
        let mut result = Vec::new();

        for db_name in databases {
            let db = self.get_db(Some(db_name.clone()))?;
            let mut collections_info = Vec::new();

            if let Ok(mut collections) = db.list_collection_names().await {
                collections.retain(|name| !name.starts_with("system."));
                for coll_name in collections {
                    let cols = self
                        .fetch_columns(&coll_name, Some(db_name.clone()))
                        .await
                        .unwrap_or_default();
                    let mut coll_map = serde_json::Map::new();
                    coll_map.insert("name".to_string(), serde_json::Value::String(coll_name));
                    coll_map.insert("columns".to_string(), serde_json::Value::Array(cols));
                    collections_info.push(serde_json::Value::Object(coll_map));
                }
            }

            let mut db_map = serde_json::Map::new();
            db_map.insert("database".to_string(), serde_json::Value::String(db_name));
            db_map.insert(
                "collections".to_string(),
                serde_json::Value::Array(collections_info),
            );
            result.push(serde_json::Value::Object(db_map));
        }

        Ok(serde_json::Value::Array(result))
    }

    async fn close(&self) -> AppResult<()> {
        Ok(()) // Client is dropped automatically
    }
}

/// Resuelve database + collection a partir de un nombre de tabla.
/// Si se provee `schema`, se usa como database y `table` como collection.
/// Si no hay `schema`, y `table` contiene un `.`, se interpreta como `database.collection`.
/// Si no hay schema ni punto, se usa `default_db` como database.
fn resolve_table_names<'a>(
    table: &'a str,
    schema: Option<&'a str>,
    default_db: &Option<String>,
) -> AppResult<(String, &'a str)> {
    match schema {
        Some(db) => Ok((db.to_string(), table)),
        None => {
            if let Some(dot) = table.find('.') {
                let db = table[..dot].to_string();
                let collection = &table[dot + 1..];
                Ok((db, collection))
            } else {
                let db = default_db.clone().ok_or_else(|| {
                    AppError::Validation("Database name is required for MongoDB operations".into())
                })?;
                Ok((db, table))
            }
        }
    }
}

#[async_trait]
impl DataReader for MongoDbDriver {
    async fn fetch_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        pk_column: &str,
        last_key: Option<serde_json::Value>,
        batch_size: usize,
    ) -> AppResult<Vec<serde_json::Value>> {
        let (db_name, collection_name) = resolve_table_names(table, schema, &self._default_db)?;
        tracing::info!(
            "[MongoDB fetch_rows] table={table} schema={schema:?} default_db={:?} -> db={db_name} collection={collection_name} columns={} batch_size={batch_size} pk={pk_column}",
            self._default_db,
            columns.len(),
        );
        let collection = self
            .client
            .database(&db_name)
            .collection::<Document>(collection_name);

        let filter = if let Some(ref key) = last_key {
            let bson_key = json_value_to_bson(key);
            doc! { pk_column: doc! { "$gt": bson_key } }
        } else {
            Document::new()
        };

        let projection = if !columns.is_empty() {
            let mut proj = Document::new();
            for col in columns {
                proj.insert(col, 1);
            }
            Some(proj)
        } else {
            None
        };

        let mut find = collection.find(filter).limit(batch_size as i64);
        if let Some(proj) = projection {
            find = find.projection(proj);
        }
        let mut cursor = find.await?;
        let mut result = Vec::new();

        while let Some(doc) = cursor.next().await {
            match doc {
                Ok(d) => {
                    let json = bson_to_json(&Bson::Document(d));
                    if let serde_json::Value::Object(map) = json {
                        result.push(serde_json::Value::Object(map));
                    }
                }
                Err(e) => return Err(AppError::Database(e.to_string())),
            }
        }

        tracing::info!(
            "[MongoDB fetch_rows] fetched {} rows from {}.{}",
            result.len(),
            db_name,
            collection_name,
        );
        Ok(result)
    }

    async fn count_rows(&self, table: &str, schema: Option<&str>) -> AppResult<u64> {
        let (db_name, collection_name) = resolve_table_names(table, schema, &self._default_db)?;
        let collection = self
            .client
            .database(&db_name)
            .collection::<Document>(collection_name);
        let count = collection.count_documents(doc! {}).await?;
        tracing::info!(
            "[MongoDB count_rows] table={table} schema={schema:?} default_db={:?} -> db={db_name} collection={collection_name} count={count}",
            self._default_db,
        );
        Ok(count)
    }
}

fn json_value_to_bson(value: &serde_json::Value) -> Bson {
    match value {
        serde_json::Value::Null => Bson::Null,
        serde_json::Value::Bool(b) => Bson::Boolean(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Bson::Int64(i)
            } else if let Some(f) = n.as_f64() {
                Bson::Double(f)
            } else {
                Bson::String(n.to_string())
            }
        }
        serde_json::Value::String(s) => Bson::String(s.clone()),
        serde_json::Value::Array(arr) => Bson::Array(arr.iter().map(json_value_to_bson).collect()),
        serde_json::Value::Object(map) => {
            // Handle MongoDB Extended JSON v2 format
            if map.len() == 1 {
                if let Some(serde_json::Value::String(hex)) = map.get("$oid") {
                    if let Ok(oid) = mongodb::bson::oid::ObjectId::parse_str(hex) {
                        return Bson::ObjectId(oid);
                    }
                }
                if let Some(val) = map.get("$numberInt") {
                    if let Some(n) = val.as_str().and_then(|s| s.parse::<i32>().ok()) {
                        return Bson::Int32(n);
                    }
                }
                if let Some(val) = map.get("$numberLong") {
                    if let Some(n) = val.as_str().and_then(|s| s.parse::<i64>().ok()) {
                        return Bson::Int64(n);
                    }
                }
                if let Some(val) = map.get("$numberDouble") {
                    if let Some(f) = val.as_str().and_then(|s| s.parse::<f64>().ok()) {
                        return Bson::Double(f);
                    }
                }
                if let Some(val) = map.get("$date") {
                    match val {
                        serde_json::Value::String(iso) => {
                            if let Ok(dt) = mongodb::bson::DateTime::parse_rfc3339_str(iso) {
                                return Bson::DateTime(dt);
                            }
                        }
                        serde_json::Value::Object(inner) => {
                            if let Some(serde_json::Value::String(ms)) = inner.get("$numberLong") {
                                if let Ok(ms) = ms.parse::<i64>() {
                                    return Bson::DateTime(mongodb::bson::DateTime::from_millis(
                                        ms,
                                    ));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                if let Some(val) = map.get("$undefined") {
                    if val.as_bool() == Some(true) {
                        return Bson::Undefined;
                    }
                }
                if map.contains_key("$minKey") {
                    return Bson::MinKey;
                }
                if map.contains_key("$maxKey") {
                    return Bson::MaxKey;
                }
            }
            let mut doc = Document::new();
            for (k, v) in map {
                doc.insert(k, json_value_to_bson(v));
            }
            Bson::Document(doc)
        }
    }
}

#[async_trait]
impl DataWriter for MongoDbDriver {
    async fn upsert_rows(
        &self,
        table: &str,
        schema: Option<&str>,
        columns: &[String],
        primary_keys: &[String],
        rows: &[serde_json::Value],
    ) -> AppResult<UpsertResult> {
        if rows.is_empty() || columns.is_empty() {
            return Ok(UpsertResult::default());
        }

        let (db_name, collection_name) = resolve_table_names(table, schema, &self._default_db)?;
        let collection = self
            .client
            .database(&db_name)
            .collection::<Document>(collection_name);
        let pk_field = primary_keys.first().map(|s| s.as_str()).unwrap_or("_id");

        let mut affected = 0u64;
        let mut skipped = 0u64;

        for row in rows {
            let mut filter_doc = Document::new();
            let pk_value =
                json_value_to_bson(row.get(pk_field).unwrap_or(&serde_json::Value::Null));
            filter_doc.insert(pk_field, pk_value);

            let mut update_doc = Document::new();
            for col in columns {
                if col == pk_field {
                    continue;
                }
                let value = row.get(col).unwrap_or(&serde_json::Value::Null);
                update_doc.insert(col, json_value_to_bson(value));
            }

            let update = doc! { "$set": update_doc };

            match collection.update_one(filter_doc, update).upsert(true).await {
                Ok(result) => {
                    if result.upserted_id.is_some() || result.modified_count > 0 {
                        affected += 1;
                    } else {
                        skipped += 1;
                    }
                }
                Err(e) => {
                    tracing::warn!("[MongoDB upsert_rows] row upsert failed: {e}");
                    skipped += 1;
                }
            }
        }

        if skipped > 0 {
            tracing::warn!(
                "[MongoDB upsert_rows] {affected} rows affected, {skipped} skipped in batch of {}",
                rows.len(),
            );
        }

        Ok(UpsertResult { affected, skipped })
    }
}

impl CapabilityProvider for MongoDbDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_transactions: false,
            supports_savepoints: false,
            supports_upsert: true,
            upsert_strategy: Some(UpsertStrategy::UpsertDoc),
            supports_keyset_pagination: true,
            supports_streaming: true,
            supports_json: false,
            supports_arrays: true,
            supports_returning: false,
            max_batch_size: 1000,
        }
    }
}
