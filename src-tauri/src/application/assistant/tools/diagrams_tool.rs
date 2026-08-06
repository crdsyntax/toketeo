use async_trait::async_trait;

use crate::application::explorer_service::ExplorerService;
use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::models::diagram::Diagram;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Save, load, list, generate from schema and delete schema diagrams.
pub struct DiagramsTool;

#[async_trait]
impl AssistantTool for DiagramsTool {
    fn name(&self) -> &str {
        "diagrams"
    }

    fn description(&self) -> &str {
        "Manage schema diagrams: 'list', 'get' (by id), 'save' (a diagram object {name, nodes, edges, ...}), 'createFromTables' (build a real diagram from the schema of a connection: columns and FK relationships included), 'addRelation' (add a manual logical relation between two nodes of a saved diagram, e.g. when the database has no real FK), 'delete' (by id, destructive — requires confirmation)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "get", "save", "createFromTables", "delete"],
                    "description": "Operation"
                },
                "id": {
                    "type": "string",
                    "description": "Diagram ID (get/delete)"
                },
                "diagram": {
                    "type": "object",
                    "description": "Diagram object for 'save': { name, sourceConnectionId?, sourceSchema?, nodes, edges, viewport? }"
                },
                "connection_id": {
                    "type": "string",
                    "description": "Connection ID (createFromTables)"
                },
                "schema": {
                    "type": "string",
                    "description": "Schema/database name (createFromTables; defaults to the connection's database)"
                },
                "tables": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Table names to include (createFromTables; all tables if omitted)"
                },
                "name": {
                    "type": "string",
                    "description": "Diagram name (createFromTables)"
                }
            },
            "required": ["action"]
        })
    }

    fn is_destructive(&self) -> bool {
        true
    }

    async fn execute(
        &self,
        args: serde_json::Value,
        _driver: Option<&dyn DbDriver>,
        state: &AppState,
    ) -> AppResult<ToolResult> {
        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("list");
        let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");

        match action {
            "list" => match state.storage.list_diagrams().await {
                Ok(diagrams) => Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "diagrams": diagrams })),
                    requires_confirmation: false,
                    message: None,
                }),
                Err(e) => Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(e.to_string()),
                }),
            },
            "get" => {
                if id.is_empty() {
                    return missing("id is required for get");
                }
                match state.storage.get_diagram(id).await {
                    Ok(d) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "diagram": d })),
                        requires_confirmation: false,
                        message: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "createFromTables" => self.create_from_tables(args, state).await,
            "save" => {
                let diagram = match serde_json::from_value::<Diagram>(
                    args.get("diagram")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null),
                ) {
                    Ok(d) => d,
                    Err(e) => {
                        return Ok(ToolResult {
                            ok: false,
                            data: None,
                            requires_confirmation: false,
                            message: Some(format!("Invalid diagram: {e}")),
                        })
                    }
                };
                match state.storage.save_diagram(&diagram).await {
                    Ok(d) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "diagram": d })),
                        requires_confirmation: false,
                        message: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            "delete" => {
                if id.is_empty() {
                    return missing("id is required for delete");
                }
                match state.storage.delete_diagram(id).await {
                    Ok(()) => Ok(ToolResult {
                        ok: true,
                        data: Some(serde_json::json!({ "deleted": id })),
                        requires_confirmation: false,
                        message: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(e.to_string()),
                    }),
                }
            }
            other => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(format!("Unknown action: {other}")),
            }),
        }
    }
}

const COL_WIDTH: i64 = 300;
const ROW_HEIGHT: i64 = 250;
const COLS: i64 = 4;

impl DiagramsTool {
    /// Build a real diagram from the connection's schema: nodes carry the
    /// actual columns and FK relationships are rendered as cardinality edges
    /// (same format the frontend editor consumes).
    async fn create_from_tables(
        &self,
        args: serde_json::Value,
        state: &AppState,
    ) -> AppResult<ToolResult> {
        let connection_id = args
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if connection_id.is_empty() {
            return missing("connection_id is required for createFromTables");
        }

        // Schema defaults to the connection's configured database.
        let schema = match args.get("schema").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => match state.storage.get_connection(connection_id).await {
                Ok(cfg) => cfg.database.clone().unwrap_or_default(),
                Err(e) => {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(format!("Connection not found: {e}")),
                    })
                }
            },
        };
        if schema.is_empty() {
            return missing(
                "'schema' is required for createFromTables (no default database on this connection)",
            );
        }

        // Tables: from args, or all tables of the schema when omitted. The
        // requested names are validated against the real schema — the diagram
        // is never created from tables that do not exist.
        let driver = match state.get_connection(connection_id).await {
            Ok(d) => d,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Connection not active: {e}")),
                })
            }
        };
        let existing = match driver.fetch_tables(Some(schema.clone()), None).await {
            Ok(t) => t,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Failed to list tables: {e}")),
                })
            }
        };

        let mut tables: Vec<String> = args
            .get("tables")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        if tables.is_empty() {
            tables = existing.clone();
        } else {
            // Strip quoting/backticks the model may have added, then compare.
            let existing_set: std::collections::HashSet<String> = existing
                .iter()
                .map(|t| strip_quotes(t).to_string())
                .collect();
            let missing: Vec<String> = tables
                .iter()
                .filter(|t| !existing_set.contains(strip_quotes(t)))
                .cloned()
                .collect();
            if !missing.is_empty() {
                let available = existing
                    .iter()
                    .take(30)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ");
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!(
                        "Las tablas no existen en el esquema '{schema}': {}. Tablas disponibles: {}",
                        missing.join(", "),
                        if available.is_empty() {
                            "(ninguna)".to_string()
                        } else {
                            available
                        }
                    )),
                });
            }
            // Keep original requested order.
            tables = tables.iter().map(|t| strip_quotes(t).to_string()).collect();
        }

        if tables.is_empty() {
            return missing("No tables found for the given schema");
        }

        let data = match ExplorerService::get_schema_diagram_data(
            state,
            connection_id,
            &schema,
            tables.clone(),
        )
        .await
        {
            Ok(d) => d,
            Err(e) => {
                return Ok(ToolResult {
                    ok: false,
                    data: None,
                    requires_confirmation: false,
                    message: Some(format!("Failed to load schema data: {e}")),
                })
            }
        };

        let table_values = data["tables"].as_array().cloned().unwrap_or_default();
        let visible: std::collections::HashSet<&str> = table_values
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();

        let mut nodes: Vec<serde_json::Value> = Vec::new();
        let mut edges: Vec<serde_json::Value> = Vec::new();
        let mut added: std::collections::HashSet<String> = std::collections::HashSet::new();

        for (idx, table) in table_values.iter().enumerate() {
            let name = table["name"].as_str().unwrap_or_default().to_string();
            let col = (idx as i64) % COLS;
            let row = (idx as i64) / COLS;
            nodes.push(serde_json::json!({
                "id": format!("table:{name}"),
                "type": "table",
                "position": { "x": col * COL_WIDTH, "y": row * ROW_HEIGHT },
                "data": {
                    "label": name,
                    "columns": table["columns"],
                    "foreignKeys": table["foreign_keys"],
                },
            }));

            if let Some(fks) = table["foreign_keys"].as_array() {
                for fk in fks {
                    let Some(ref_table) = fk["referencedTable"].as_str() else {
                        continue;
                    };
                    let Some(col_name) = fk["columnName"].as_str() else {
                        continue;
                    };
                    let Some(ref_col) = fk["referencedColumn"].as_str() else {
                        continue;
                    };
                    if !visible.contains(ref_table) {
                        continue;
                    }
                    let constraint = fk["constraintName"].as_str().unwrap_or("fk");
                    let edge_id = format!("fk:{name}:{constraint}");
                    if !added.insert(edge_id.clone()) {
                        continue;
                    }
                    edges.push(serde_json::json!({
                        "id": edge_id,
                        "source": format!("table:{ref_table}"),
                        "target": format!("table:{name}"),
                        "type": "cardinality",
                        "data": { "cardinality": "1:N", "isManual": false },
                        "label": format!("{col_name} → {ref_col}"),
                    }));
                }
            }
        }

        let name = args
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from)
            .unwrap_or_else(|| format!("Diagram: {}", tables.join(", ")));

        let diagram = Diagram {
            id: None,
            name,
            source_connection_id: Some(connection_id.to_string()),
            source_schema: Some(schema),
            nodes: serde_json::json!(nodes),
            edges: serde_json::json!(edges),
            viewport: None,
            created_at: None,
            updated_at: None,
        };

        match state.storage.save_diagram(&diagram).await {
            Ok(saved) => Ok(ToolResult {
                ok: true,
                data: Some(serde_json::json!({
                    "diagramId": saved.id,
                    "name": saved.name,
                    "nodeCount": nodes.len(),
                    "edgeCount": edges.len(),
                })),
                requires_confirmation: false,
                message: Some(format!(
                    "Diagram '{}' creado con {} tablas y {} relaciones.",
                    saved.name,
                    nodes.len(),
                    edges.len()
                )),
            }),
            Err(e) => Ok(ToolResult {
                ok: false,
                data: None,
                requires_confirmation: false,
                message: Some(e.to_string()),
            }),
        }
    }
}

/// Strip backticks/quotes a model may add around table names.
fn strip_quotes(t: &str) -> &str {
    t.trim_matches(|c| c == '`' || c == '"' || c == '\'')
}

fn missing(msg: &str) -> AppResult<ToolResult> {
    Ok(ToolResult {
        ok: false,
        data: None,
        requires_confirmation: false,
        message: Some(msg.to_string()),
    })
}
