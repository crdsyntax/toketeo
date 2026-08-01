use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::{ToolDescriptor, ToolResult};
use crate::state::AppState;

#[async_trait]
pub trait AssistantTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> serde_json::Value;
    fn is_destructive(&self) -> bool;

    async fn execute(
        &self,
        args: serde_json::Value,
        driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<ToolResult>;
}

pub struct ToolEngine {
    tools: HashMap<String, Box<dyn AssistantTool>>,
}

impl ToolEngine {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Box<dyn AssistantTool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    pub fn get(&self, name: &str) -> Option<&dyn AssistantTool> {
        self.tools.get(name).map(|t| t.as_ref())
    }

    pub fn list_tools(&self) -> Vec<ToolDescriptor> {
        self.tools
            .values()
            .map(|t| ToolDescriptor {
                name: t.name().to_string(),
                description: t.description().to_string(),
                parameters: t.parameters(),
            })
            .collect()
    }

    /// Resolve the effective driver for a tool call: if the arguments carry a
    /// `connection_id`, use that connection's driver (connecting if needed) so
    /// tools can operate on any connection, not just the chat's active one.
    /// Otherwise fall back to the chat's driver.
    async fn resolve_driver(
        &self,
        args: &serde_json::Value,
        _driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<Option<Arc<dyn DbDriver>>> {
        match args.get("connection_id").and_then(|v| v.as_str()) {
            Some(cid) if !cid.is_empty() => {
                let d = state.get_or_connect_driver(cid).await?;
                Ok(Some(d))
            }
            _ => Ok(None),
        }
    }

    pub async fn execute(
        &self,
        name: &str,
        args: serde_json::Value,
        driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<ToolResult> {
        match self.tools.get(name) {
            Some(tool) => {
                if tool.is_destructive() {
                    Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: true,
                        message: Some(format!(
                            "This operation is destructive. Call again with confirm_destructive=true to proceed."
                        )),
                    })
                } else {
                    let own = self.resolve_driver(&args, driver, state).await?;
                    let effective = own.as_deref().or(driver);
                    tool.execute(args, effective, state).await
                }
            }
            None => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown tool: {name}")),
            }),
        }
    }

    pub async fn execute_with_confirmation(
        &self,
        name: &str,
        args: serde_json::Value,
        driver: Option<&dyn DbDriver>,
        state: &AppState,
        confirm_destructive: bool,
    ) -> AppResult<ToolResult> {
        match self.tools.get(name) {
            Some(tool) => {
                if tool.is_destructive() && !confirm_destructive {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: true,
                        message: Some(format!(
                            "Tool '{name}' is destructive. Set confirm_destructive=true to proceed."
                        )),
                    });
                }
                let own = self.resolve_driver(&args, driver, state).await?;
                let effective = own.as_deref().or(driver);
                tool.execute(args, effective, state).await
            }
            None => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown tool: {name}")),
            }),
        }
    }
}

/// Classify whether a SQL statement is destructive (modifies data/schema).
pub struct SafetyClassifier;

impl SafetyClassifier {
    pub fn is_destructive_query(query: &str) -> bool {
        let trimmed = query.trim().to_uppercase();
        trimmed.starts_with("INSERT")
            || trimmed.starts_with("UPDATE")
            || trimmed.starts_with("DELETE")
            || trimmed.starts_with("DROP")
            || trimmed.starts_with("ALTER")
            || trimmed.starts_with("TRUNCATE")
            || trimmed.starts_with("CREATE")
            || trimmed.starts_with("RENAME")
            || trimmed.starts_with("REPLACE")
            || trimmed.starts_with("CALL")
    }
}
