use crate::error::{AppError, AppResult};
use crate::models::QueryResult;
use crate::state::AppState;
use crate::application::audit_service::AuditService;

pub struct ExplorerService;

impl ExplorerService {
    pub async fn execute_query(
        state: &AppState,
        id: &str,
        query: &str,
    ) -> AppResult<QueryResult> {
        let driver = state.get_connection(id).await?;
        let start = std::time::Instant::now();
        
        match driver.execute(query).await {
            Ok(result) => {
                let _ = AuditService::log_query(
                    state, 
                    id.to_string(), 
                    query.to_string(), 
                    start.elapsed().as_millis() as u64, 
                    "success".to_string(), 
                    None
                ).await;
                Ok(result)
            },
            Err(e) => {
                let _ = AuditService::log_query(
                    state, 
                    id.to_string(), 
                    query.to_string(), 
                    start.elapsed().as_millis() as u64, 
                    "error".to_string(), 
                    Some(e.to_string())
                ).await;
                Err(e)
            }
        }
    }

    pub async fn get_schemas(state: &AppState, id: &str) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_schemas().await
    }

    pub async fn get_databases(state: &AppState, id: &str) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_databases().await
    }

    pub async fn get_tables(state: &AppState, id: &str, schema: Option<String>) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_tables(schema).await
    }

    pub async fn get_views(state: &AppState, id: &str, schema: Option<String>) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_views(schema).await
    }

    pub async fn get_procedures(state: &AppState, id: &str, schema: Option<String>) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_procedures(schema).await
    }

    pub async fn get_triggers(state: &AppState, id: &str, schema: Option<String>) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_triggers(schema).await
    }

    pub async fn get_functions(state: &AppState, id: &str, schema: Option<String>) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_functions(schema).await
    }

    pub async fn get_columns(state: &AppState, id: &str, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_columns(table, schema).await
    }

    pub async fn get_indexes(state: &AppState, id: &str, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_indexes(table, schema).await
    }

    pub async fn get_foreign_keys(state: &AppState, id: &str, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_foreign_keys(table, schema).await
    }

    pub async fn get_constraints(state: &AppState, id: &str, table: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_constraints(table, schema).await
    }

    pub async fn get_ddl(state: &AppState, id: &str, name: &str, object_type: &str, schema: Option<String>) -> AppResult<String> {
        let driver = state.get_connection(id).await?;
        driver.fetch_ddl(name, object_type, schema).await
    }

    pub async fn get_parameters(state: &AppState, id: &str, name: &str, object_type: &str, schema: Option<String>) -> AppResult<Vec<serde_json::Value>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_parameters(name, object_type, schema).await
    }

    pub async fn execute_explorer(
        state: &AppState,
        id: &str,
        database: Option<String>,
        name: &str,
        object_type: String,
        page: u32,
        page_size: u32,
    ) -> AppResult<QueryResult> {
        let driver = state.get_connection(id).await?;
        let db_type = driver.db_type();
        
        let page_size = page_size.min(500); 
        let page = page.max(1);
        let offset = (page - 1) * page_size;

        let start = std::time::Instant::now();

        // Identifier quoting based on DB type
        let (q_open, q_close, q_esc) = match db_type {
            crate::db::DbType::Postgres => ("\"", "\"", "\"\""),
            crate::db::DbType::Mysql | crate::db::DbType::Mariadb => ("`", "`", "``"),
            _ => ("\"", "\"", "\"\""), // Default
        };

        // Handle MongoDB separately
        if matches!(db_type, crate::db::DbType::Mongodb) {
            let mongo_query = serde_json::json!({
                "collection": name,
                "find": {},
                "limit": page_size as i64,
                "skip": offset as i64
            });
            return driver.execute(&mongo_query.to_string()).await;
        }

        let full_name = if let Some(schema) = database.as_ref() {
            format!("{}{}{}.{}{}{}", 
                q_open, schema.replace(q_close, q_esc), q_close,
                q_open, name.replace(q_close, q_esc), q_close)
        } else {
            format!("{}{}{}", q_open, name.replace(q_close, q_esc), q_close)
        };

        let result = match object_type.to_lowercase().as_str() {
            "table" | "view" => {
                // FASE 9: Explicit column selection
                let columns = driver.fetch_columns(name, database).await?;
                let col_names: Vec<String> = columns.iter()
                    .filter_map(|c| c.get("name").and_then(|v| v.as_str()).map(|s| format!("{}{}{}", q_open, s.replace(q_close, q_esc), q_close)))
                    .collect();
                
                let select_clause = if col_names.is_empty() {
                    "*".to_string()
                } else {
                    col_names.join(", ")
                };

                let query = format!("SELECT {} FROM {} LIMIT {} OFFSET {}", select_clause, full_name, page_size, offset);
                driver.execute(&query).await
            },
            "procedure" => {
                let query = format!("CALL {}()", full_name);
                driver.execute(&query).await
            },
            _ => Err(AppError::Internal("Unsupported object type for data execution".into())),
        };

        match result {
            Ok(res) => {
                let _ = AuditService::log_query(
                    state, 
                    id.to_string(), 
                    format!("Explorer: {}", full_name), 
                    start.elapsed().as_millis() as u64, 
                    "success".to_string(), 
                    None
                ).await;
                Ok(res)
            },
            Err(e) => {
                let _ = AuditService::log_query(
                    state, 
                    id.to_string(), 
                    format!("Explorer: {}", full_name), 
                    start.elapsed().as_millis() as u64, 
                    "error".to_string(), 
                    Some(e.to_string())
                ).await;
                Err(e)
            }
        }
    }

    pub async fn restore_database(
        state: &AppState,
        id: &str,
        file_path: String,
    ) -> AppResult<()> {
        use tokio::io::{AsyncBufReadExt, BufReader};
        use tokio::fs::File;

        let driver = state.get_connection(id).await?;
        let file = File::open(file_path).await
            .map_err(|e| AppError::Internal(format!("Failed to open dump file: {}", e)))?;
        
        let mut reader = BufReader::new(file);
        let mut line = String::new();
        let mut current_query = String::new();

        // FASE 10: Incremental processing
        while reader.read_line(&mut line).await? > 0 {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("--") || trimmed.starts_with("/*") {
                line.clear();
                continue;
            }

            current_query.push_str(&line);
            if trimmed.ends_with(';') {
                // Execute chunk
                if let Err(e) = driver.execute(&current_query).await {
                    eprintln!("Error executing restore chunk: {:?}", e);
                    // Depending on policy, we might want to continue or stop
                }
                current_query.clear();
            }
            line.clear();
        }

        // Execute last bit if any
        if !current_query.trim().is_empty() {
            let _ = driver.execute(&current_query).await;
        }
        
        Ok(())
    }

    pub async fn switch_schema(
        state: &AppState,
        id: &str,
        schema: String,
    ) -> AppResult<()> {
        let driver = state.get_connection(id).await?;
        let schemas = driver.fetch_schemas().await?;
        
        if schemas.contains(&schema) {
            Ok(())
        } else {
            Err(AppError::Validation(format!("Database '{}' not found", schema)))
        }
    }
}
