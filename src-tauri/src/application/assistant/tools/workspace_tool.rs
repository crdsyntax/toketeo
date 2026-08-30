use async_trait::async_trait;
use serde_json::{json, Value};

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::{ToolResult, UiContext};
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Gives the model access to the user's current UI workspace: open SQL editor
/// tabs, their results/errors and navigation. The actual tab data lives in the
/// frontend, so this tool reads the per-turn `ui_context` (injected into the
/// tool args by the orchestrator) and, for side-effectful operations (export,
/// focus), returns an `action` payload that the frontend executes.
pub struct WorkspaceTool;

const UI_CONTEXT_KEY: &str = "ui_context";

fn extract_ui_context(args: &Value) -> Option<UiContext> {
    serde_json::from_value(args.get(UI_CONTEXT_KEY)?.clone()).ok()
}

fn tabs_summary(ui: &UiContext) -> Vec<Value> {
    ui.open_tabs
        .iter()
        .map(|t| {
            json!({
                "tabId": t.id,
                "name": t.name,
                "isActive": t.is_active,
                "hasResults": t.has_results,
                "error": t.error,
            })
        })
        .collect()
}

impl WorkspaceTool {
    /// List the user's currently open SQL editor tabs.
    fn list_tabs(ui: &UiContext) -> ToolResult {
        ToolResult {
            ok: true,
            data: Some(json!({
                "module": ui.module,
                "route": ui.route,
                "activeConnectionId": ui.active_connection_id,
                "tabs": tabs_summary(ui),
            })),
            requires_confirmation: false,
            message: None,
        }
    }

    /// Request an export of a tab's results. Resolves the target tab:
    /// explicit `tab_id` → active tab with results → disambiguation list.
    fn export_tab_results(ui: &UiContext, args: &Value) -> ToolResult {
        let format = args
            .get("format")
            .and_then(|f| f.as_str())
            .unwrap_or("json")
            .to_lowercase();

        if let Some(tab_id) = args.get("tab_id").and_then(|v| v.as_str()) {
            if let Some(tab) = ui.open_tabs.iter().find(|t| t.id == tab_id) {
                return Self::export_action(tab, &format);
            }
            return ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("No open tab with id '{tab_id}'.")),
            };
        }

        // No explicit tab: prefer the active tab when it has results.
        if let Some(active) = ui.open_tabs.iter().find(|t| t.is_active) {
            if active.has_results {
                return Self::export_action(active, &format);
            }
            let others: Vec<_> = ui.open_tabs.iter().filter(|t| t.has_results).collect();
            return ToolResult {
                ok: true,
                data: None,
                requires_confirmation: false,
                message: Some(if others.is_empty() {
                    "The active tab has no results to export. Run a query first.".to_string()
                } else {
                    "The active tab has no results, but other tabs do. Ask the user which one to export.".to_string()
                }),
            };
        }

        // Ambiguous: hand the tab list back so the agent asks the user.
        ToolResult {
            ok: true,
            data: Some(json!({
                "needsDisambiguation": true,
                "reason": "There is no active SQL editor tab. Ask the user which of these tabs to export.",
                "tabs": tabs_summary(ui),
            })),
            requires_confirmation: false,
            message: None,
        }
    }

    fn export_action(tab: &crate::models::assistant::UiOpenTab, format: &str) -> ToolResult {
        ToolResult {
            ok: true,
            data: Some(json!({
                "action": {
                    "type": "export_tab_results",
                    "tabId": tab.id,
                    "tabName": tab.name,
                    "format": format,
                }
            })),
            requires_confirmation: false,
            message: Some(format!(
                "Exporting results of tab '{}' as {format}.",
                tab.name
            )),
        }
    }

    /// Bring a tab into focus in the SQL editor.
    fn focus_tab(ui: &UiContext, args: &Value) -> ToolResult {
        let Some(tab_id) = args.get("tab_id").and_then(|v| v.as_str()) else {
            return ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some("Missing required argument 'tab_id'.".to_string()),
            };
        };
        match ui.open_tabs.iter().find(|t| t.id == tab_id) {
            Some(tab) => ToolResult {
                ok: true,
                data: Some(json!({
                    "action": { "type": "focus_tab", "tabId": tab.id, "tabName": tab.name }
                })),
                requires_confirmation: false,
                message: Some(format!("Focusing tab '{}'.", tab.name)),
            },
            None => ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("No open tab with id '{tab_id}'.")),
            },
        }
    }
}

#[async_trait]
impl AssistantTool for WorkspaceTool {
    fn name(&self) -> &str {
        "workspace"
    }

    fn description(&self) -> &str {
        "Access the user's current workspace: list the open SQL editor tabs, \
         export the results of the active tab (or ask which tab when ambiguous), \
         or bring a specific tab into focus. Use 'list_tabs' first whenever the \
         user refers to 'the current query', 'the results' or similar without an \
         explicit tab."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list_tabs", "export_tab_results", "focus_tab"],
                    "description": "Workspace operation to perform."
                },
                "tab_id": {
                    "type": "string",
                    "description": "Target tab id. Optional for export_tab_results (defaults to the active tab)."
                },
                "format": {
                    "type": "string",
                    "enum": ["json", "csv"],
                    "description": "Export format for export_tab_results. Defaults to json."
                }
            },
            "required": ["action"]
        })
    }

    fn is_destructive(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        args: Value,
        _driver: Option<&dyn DbDriver>,
        _state: &AppState,
    ) -> AppResult<ToolResult> {
        Ok(Self::dispatch(&args))
    }
}

impl WorkspaceTool {
    /// Pure dispatcher so the tool logic is unit-testable without AppState.
    fn dispatch(args: &Value) -> ToolResult {
        let Some(ui) = extract_ui_context(args) else {
            return ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(
                    "No UI context available for this turn. The user interface state was not provided."
                        .to_string(),
                ),
            };
        };

        let action = args
            .get("action")
            .and_then(|a| a.as_str())
            .unwrap_or_default();

        match action {
            "list_tabs" => Self::list_tabs(&ui),
            "export_tab_results" => Self::export_tab_results(&ui, args),
            "focus_tab" => Self::focus_tab(&ui, args),
            other => ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown workspace action: '{other}'.")),
            },
        }
    }
}

/// Render the UI context as a system-prompt section so the model knows what
/// the user is looking at before choosing tools.
pub fn render_ui_context_prompt(ui: &UiContext) -> String {
    let mut s = String::from(
        "## Current user workspace\n\
         You are embedded in a desktop database client. This is what the user \
         is seeing right now:\n",
    );
    s.push_str(&format!("- Module: {} ({})\n", ui.module, ui.route));
    if let Some(db) = &ui.database {
        s.push_str(&format!("- Active database: {db}\n"));
    }

    if ui.open_tabs.is_empty() {
        s.push_str("- Open SQL editor tabs: none\n");
    } else {
        s.push_str("- Open SQL editor tabs:\n");
        for t in &ui.open_tabs {
            let state = if t.is_active { "ACTIVE" } else { "background" };
            let status = if let Some(err) = &t.error {
                format!("last run FAILED: {err}")
            } else if t.has_results {
                "has results".to_string()
            } else {
                "no results yet".to_string()
            };
            s.push_str(&format!(
                "  - [{}] \"{}\" (id: {}) — {status}\n",
                state, t.name, t.id
            ));
            if !t.sql_preview.trim().is_empty() {
                s.push_str(&format!("    SQL: {}\n", t.sql_preview.replace('\n', " ")));
            }
        }
    }

    if let Some(err) = &ui.last_tab_error {
        s.push_str(&format!(
            "- Most recent tab error: \"{err}\". If the user asks about it, explain and offer a fix.\n"
        ));
    }

    s.push_str(
        "When the user refers to \"the current query\", \"the results\" or the \
         active view, use the ACTIVE tab. When there is no active tab or the \
         request is ambiguous, call the `workspace` tool with action \
         `list_tabs` and ask the user which tab they mean instead of guessing.\n",
    );
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ui() -> UiContext {
        UiContext {
            route: "/query".into(),
            module: "SQL Editor".into(),
            active_connection_id: Some("c1".into()),
            database: Some("shop".into()),
            open_tabs: vec![
                crate::models::assistant::UiOpenTab {
                    id: "t1".into(),
                    name: "Query #1".into(),
                    connection_id: Some("c1".into()),
                    sql_preview: "SELECT 1".into(),
                    has_results: true,
                    error: None,
                    is_active: true,
                },
                crate::models::assistant::UiOpenTab {
                    id: "t2".into(),
                    name: "Query #2".into(),
                    connection_id: Some("c1".into()),
                    sql_preview: String::new(),
                    has_results: false,
                    error: None,
                    is_active: false,
                },
            ],
            explorer_tabs: vec![],
            last_tab_error: None,
        }
    }

    #[test]
    fn export_prefers_active_tab_with_results() {
        let ui = ui();
        let args = json!({ "action": "export_tab_results" });
        let result = WorkspaceTool::export_tab_results(&ui, &args);
        assert!(result.ok);
        let data = result.data.unwrap();
        assert_eq!(data["action"]["tabId"], "t1");
        assert_eq!(data["action"]["type"], "export_tab_results");
    }

    #[test]
    fn export_without_active_tab_asks_for_disambiguation() {
        let mut ui = ui();
        ui.open_tabs.retain(|t| !t.is_active);
        let args = json!({ "action": "export_tab_results" });
        let result = WorkspaceTool::export_tab_results(&ui, &args);
        assert!(result.ok);
        assert_eq!(result.data.unwrap()["needsDisambiguation"], true);
    }

    #[test]
    fn missing_ui_context_reports_gracefully() {
        let result = WorkspaceTool::dispatch(&json!({ "action": "list_tabs" }));
        assert!(!result.ok);
        assert!(result.message.unwrap().contains("No UI context"));
    }

    #[test]
    fn prompt_mentions_active_tab() {
        let prompt = render_ui_context_prompt(&ui());
        assert!(prompt.contains("[ACTIVE]"));
        assert!(prompt.contains("Query #1"));
    }
}
