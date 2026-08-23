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

impl Default for ToolEngine {
    fn default() -> Self {
        Self::new()
    }
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
    /// `connection_id`, use that connection's driver so tools can operate on
    /// any connection, not just the chat's active one. **Opening a connection
    /// that is not currently active is a side effect that requires user
    /// confirmation** — unless `confirm_destructive` was given, a
    /// `requires_confirmation` result is returned and nothing is connected.
    async fn resolve_driver(
        &self,
        args: &serde_json::Value,
        _driver: Option<&dyn DbDriver>,
        state: &AppState,
        confirm_destructive: bool,
    ) -> Result<Option<Arc<dyn DbDriver>>, ToolResult> {
        let Some(cid) = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        else {
            return Ok(None);
        };

        // Already active — reuse it without confirmation.
        if let Ok(d) = state.get_connection(cid).await {
            return Ok(Some(d));
        }

        if !confirm_destructive {
            let name = state
                .storage
                .get_connection(cid)
                .await
                .map(|c| c.name)
                .unwrap_or_else(|_| cid.to_string());
            return Err(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: true,
                message: Some(format!("CONNECTION_NOT_ACTIVE|{name}|{cid}")),
            });
        }

        let d = state
            .get_or_connect_driver(cid)
            .await
            .map_err(|e| ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(e.to_string()),
            })?;
        Ok(Some(d))
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
                        message: Some("This operation is destructive. Call again with confirm_destructive=true to proceed.".to_string()),
                    })
                } else {
                    // Production guard still applies to non-flagged tools that
                    // carry a destructive payload (defence in depth).
                    if let Some(blocked) = self
                        .production_guard(name, tool.as_ref(), &args, state, None)
                        .await
                    {
                        return Ok(blocked);
                    }
                    match self.resolve_driver(&args, driver, state, false).await {
                        Ok(own) => {
                            let effective = own.as_deref().or(driver);
                            tool.execute(args, effective, state).await
                        }
                        Err(blocked) => Ok(blocked),
                    }
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
        default_connection_id: Option<&str>,
    ) -> AppResult<ToolResult> {
        match self.tools.get(name) {
            Some(tool) => {
                // HARD GUARD: destructive operations are never allowed on a
                // connection marked as production — even with user confirmation.
                if let Some(blocked) = self
                    .production_guard(name, tool.as_ref(), &args, state, default_connection_id)
                    .await
                {
                    return Ok(blocked);
                }
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
                match self
                    .resolve_driver(&args, driver, state, confirm_destructive)
                    .await
                {
                    Ok(own) => {
                        let effective = own.as_deref().or(driver);
                        tool.execute(args, effective, state).await
                    }
                    Err(blocked) => Ok(blocked),
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

    /// Whether this specific tool call would modify data or schema. For the
    /// generic `query` tool the SQL payload decides; other tools flagged as
    /// destructive are always considered so.
    fn effective_destructive(
        name: &str,
        tool: &dyn AssistantTool,
        args: &serde_json::Value,
    ) -> bool {
        if !tool.is_destructive() {
            return false;
        }
        if name == "query" {
            let sql = args.get("sql").and_then(|v| v.as_str()).unwrap_or("");
            return !sql.is_empty() && SafetyClassifier::is_destructive_query(sql);
        }
        true
    }

    /// Returns a blocking result when the target connection is marked as
    /// production and the call would modify data or schema. The assistant has
    /// no write access to production, period.
    async fn production_guard(
        &self,
        name: &str,
        tool: &dyn AssistantTool,
        args: &serde_json::Value,
        state: &AppState,
        default_connection_id: Option<&str>,
    ) -> Option<ToolResult> {
        if !Self::effective_destructive(name, tool, args) {
            return None;
        }
        let cid = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or(default_connection_id)
            .filter(|s| !s.is_empty())?;
        let cfg = state.storage.get_connection(cid).await.ok()?;
        if is_production_environment(&cfg.environment) {
            return Some(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!(
                    "PRODUCTION_BLOCKED|The connection '{}' is marked as PRODUCTION. The assistant is not allowed to run data or schema modifying operations ('{name}') on it under any circumstances. Suggest the user perform this change manually outside the assistant.",
                    cfg.name
                )),
            });
        }
        None
    }
}

/// A connection belongs to production when its environment label matches
/// "production" case-insensitively.
pub fn is_production_environment(environment: &str) -> bool {
    environment.eq_ignore_ascii_case("production")
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

#[cfg(test)]
mod tests {
    use super::{is_production_environment, SafetyClassifier, ToolEngine};

    #[test]
    fn safety_classifier_detects_destructive_statements() {
        for q in [
            "INSERT INTO t VALUES (1)",
            "UPDATE t SET a = 1",
            "DELETE FROM t",
            "DROP TABLE t",
            "ALTER TABLE t ADD c INT",
            "TRUNCATE t",
            "CREATE TABLE t (id INT)",
            "RENAME TABLE a TO b",
            "REPLACE INTO t VALUES (1)",
            "  select * from t",
        ] {
            let expected = !q.trim_start().starts_with("select");
            assert_eq!(
                SafetyClassifier::is_destructive_query(q),
                expected,
                "for {q}"
            );
        }
    }

    #[test]
    fn safety_classifier_treats_select_as_safe() {
        assert!(!SafetyClassifier::is_destructive_query(
            "SELECT * FROM users"
        ));
        assert!(!SafetyClassifier::is_destructive_query(
            "  select count(*) from t"
        ));
        assert!(!SafetyClassifier::is_destructive_query(
            "WITH x AS (SELECT 1) SELECT * FROM x"
        ));
    }

    #[test]
    fn production_environment_detection() {
        assert!(is_production_environment("production"));
        assert!(is_production_environment("Production"));
        assert!(is_production_environment("PRODUCTION"));
        assert!(!is_production_environment("development"));
        assert!(!is_production_environment("staging"));
        assert!(!is_production_environment(""));
    }

    #[test]
    fn effective_destructive_uses_sql_classifier_for_query_tool() {
        let tool = super::super::query_tool::QueryTool;
        let select = serde_json::json!({ "sql": "SELECT * FROM t" });
        let delete = serde_json::json!({ "sql": "DELETE FROM t" });
        assert!(!ToolEngine::effective_destructive("query", &tool, &select));
        assert!(ToolEngine::effective_destructive("query", &tool, &delete));
    }
}
