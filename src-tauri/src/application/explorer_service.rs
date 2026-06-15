use crate::error::{AppError, AppResult};
use crate::models::QueryResult;
use crate::state::AppState;

pub struct ExplorerService;

impl ExplorerService {
    pub async fn execute_query(
        state: &AppState,
        id: &str,
        query: &str,
    ) -> AppResult<QueryResult> {
        let driver = state.get_connection(id).await?;
        driver.execute(query).await
    }

    pub async fn get_schemas(state: &AppState, id: &str) -> AppResult<Vec<String>> {
        let driver = state.get_connection(id).await?;
        driver.fetch_schemas().await
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
        
        let page_size = page_size.min(500); // More conservative limit
        let page = page.max(1);
        let offset = (page - 1) * page_size;

        let full_name = if let Some(schema) = database.as_ref() {
            format!("`{}`.`{}`", schema.replace('`', "``"), name.replace('`', "``"))
        } else {
            format!("`{}`", name.replace('`', "``"))
        };

        let query = match object_type.to_lowercase().as_str() {
            "table" | "view" => {
                // FASE 9: Instead of SELECT *, we could fetch columns first
                // For now, we enforce a strict LIMIT and inform about the columns
                format!("SELECT * FROM {} LIMIT {} OFFSET {}", full_name, page_size, offset)
            },
            "procedure" => {
                format!("CALL {}()", full_name)
            },
            _ => return Err(AppError::Internal("Unsupported object type for data execution".into())),
        };

        let result = driver.execute(&query).await?;
        
        // Add metadata about pagination to the result if possible
        // For now, we just ensure the execution was safe.
        Ok(result)
    }

    pub async fn restore_database(
        state: &AppState,
        id: &str,
        _file_path: String,
    ) -> AppResult<()> {
        let _driver = state.get_connection(id).await?;
        
        // FASE 10: Streaming Strategy
        // 1. Open file with tokio::fs::File
        // 2. Wrap in BufReader
        // 3. Read line by line or by chunks of SQL statements
        // 4. Execute in batches
        
        // This is a placeholder for the streaming implementation
        // let file = tokio::fs::File::open(file_path).await?;
        // let reader = tokio::io::BufReader::new(file);
        
        Ok(())
    }
}
