use crate::db::DbDriver;
use crate::error::{AppError, AppResult};
use crate::models::QueryResult;
use async_trait::async_trait;
use futures::StreamExt;
use mongodb::{
    Client,
    bson::{Document, doc},
    options::ClientOptions,
};
use std::time::Instant;

pub struct MongoDbDriver {
    client: Client,
    _default_db: Option<String>,
}

impl MongoDbDriver {
    pub async fn new(url: &str) -> AppResult<Self> {
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

        // Set longer timeouts for SSH tunnel latency
        client_options.server_selection_timeout = Some(std::time::Duration::from_secs(10));
        client_options.connect_timeout = Some(std::time::Duration::from_secs(10));
        client_options.retry_writes = Some(false);
        client_options.retry_reads = Some(false);

        tracing::debug!(
            "Setting MongoDB timeouts: Connect=10s, ServerSelection=10s, Retries=Disabled"
        );

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
                    AppError::Auth(format!("MongoDB Authentication Failed: please check your credentials"))
                } else {
                    AppError::Connection(format!("MongoDB Error (after {:?}): {}", elapsed, msg))
                }
            })?;

        tracing::info!(
            "MongoDB connection to {} verified successfully in {:?}",
            sanitized_url,
            ping_start.elapsed()
        );

        // Extract default db from URL if possible
        let default_db = url
            .split('/')
            .last()
            .and_then(|s| s.split('?').next())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        Ok(Self {
            client,
            _default_db: default_db,
        })
    }

    fn get_db(&self, schema: Option<String>) -> AppResult<mongodb::Database> {
        let db_name = schema
            .or_else(|| self._default_db.clone())
            .ok_or_else(|| AppError::Validation("No database specified".into()))?;
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

        // Simple 'find' support: { "collection": "name", "find": { ... }, "limit": 100 }
        if let Some(coll_name) = obj.get("collection").and_then(|v| v.as_str()) {
            let db_name = obj.get("database").and_then(|v| v.as_str()).map(String::from);
            let db = self.get_db(db_name)?;
            let coll = db.collection::<Document>(coll_name);

            let filter = obj
                .get("find")
                .and_then(|v| v.as_object())
                .map(|o| {
                    serde_json::from_value::<Document>(serde_json::Value::Object(o.clone()))
                        .unwrap_or_default()
                })
                .unwrap_or_default();

            let limit = obj.get("limit").and_then(|v| v.as_i64()).unwrap_or(100);
            let skip = obj.get("skip").and_then(|v| v.as_i64()).unwrap_or(0);

            let mut cursor = coll
                .find(filter)
                .limit(limit)
                .skip(skip as u64)
                .await
                .map_err(|e| AppError::Database(format!("MongoDB find failed: {}", e)))?;

            let mut rows = Vec::new();
            let mut columns_set = std::collections::HashSet::new();

            while let Some(result) = cursor.next().await {
                let doc = result
                    .map_err(|e| AppError::Database(format!("Error fetching document: {}", e)))?;
                let json_val = serde_json::to_value(&doc).unwrap_or(serde_json::Value::Null);

                if let Some(obj) = json_val.as_object() {
                    for key in obj.keys() {
                        columns_set.insert(key.clone());
                    }
                }
                rows.push(json_val);
            }

            let mut columns: Vec<String> = columns_set.into_iter().collect();
            columns.sort();

            return Ok(QueryResult {
                columns,
                rows,
                execution_time_ms: start.elapsed().as_millis() as u64,
                primary_keys: Some(vec!["_id".to_string()]),
            });
        }

        // Generic command support: { "listCollections": 1 }
        let db_name = obj.get("database").and_then(|v| v.as_str()).map(String::from);
        let db = self.get_db(db_name)?;
        let command = serde_json::from_value::<Document>(json_query)
            .map_err(|e| AppError::Validation(format!("Invalid BSON document: {}", e)))?;

        let result = db
            .run_command(command)
            .await
            .map_err(|e| AppError::Database(format!("MongoDB command failed: {}", e)))?;

        let json_result = serde_json::to_value(&result).unwrap_or(serde_json::Value::Null);

        Ok(QueryResult {
            columns: vec!["result".to_string()],
            rows: vec![json_result],
            execution_time_ms: start.elapsed().as_millis() as u64,
            primary_keys: None,
        })
    }

    async fn fetch_schemas(&self) -> AppResult<Vec<String>> {
        // Mongo doesn't have "schemas" per se, maybe return collections in current db?
        // Let's keep it as is for now, or change to something meaningful.
        Ok(vec![])
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
        let mut collections = db.list_collection_names()
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
        let db = self.get_db(schema)?;
        let coll = db.collection::<Document>(table);

        // Sample 5 documents to guess "schema"
        let mut cursor = coll
            .find(doc! {})
            .limit(5)
            .await
            .map_err(|e| AppError::Database(format!("Failed to sample collection: {}", e)))?;

        let mut field_info = std::collections::HashMap::new();

        while let Some(result) = cursor.next().await {
            let doc = result.unwrap_or_default();
            for (key, value) in doc {
                field_info
                    .entry(key.clone())
                    .or_insert_with(|| format!("{:?}", value.element_type()));
            }
        }

        let mut cols = Vec::new();
        for (name, type_name) in field_info {
            let mut map = serde_json::Map::new();
            map.insert("name".into(), name.clone().into());
            map.insert("type".into(), type_name.into());
            map.insert("isNullable".into(), (name != "_id").into());
            map.insert("isPrimaryKey".into(), (name == "_id").into());
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

    async fn close(&self) -> AppResult<()> {
        Ok(()) // Client is dropped automatically
    }
}
