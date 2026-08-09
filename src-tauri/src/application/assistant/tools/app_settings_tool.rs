use async_trait::async_trait;
use tauri::Emitter;

use crate::db::DbDriver;
use crate::error::AppResult;
use crate::models::assistant::ToolResult;
use crate::state::AppState;

use super::tool_engine::AssistantTool;

/// Accent palettes available in the app's Settings (mirrors the frontend's
/// themePalettes). The frontend validates the id before applying.
const ACCENTS: &[(&str, &str)] = &[
    ("emerald", "Emerald"),
    ("cyan", "Cyan"),
    ("violet", "Violet"),
    ("amber", "Amber"),
    ("rose", "Rose"),
];

/// Change the app's visual settings (theme, accent palette, custom colors)
/// through the same paths as the Settings page. Emits an event the frontend
/// applies live; the applied values are also persisted as preferences so the
/// assistant can report what is configured.
pub struct AppSettingsTool;

#[async_trait]
impl AssistantTool for AppSettingsTool {
    fn name(&self) -> &str {
        "app_settings"
    }

    fn description(&self) -> &str {
        "Change application appearance (same as Settings): 'listAccents' (available color palettes), 'setTheme' (light|dark), 'setAccent' (palette id), 'setColors' (custom primary/secondary/accent/background for a mode), 'get' (previously applied settings)."
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["listAccents", "setTheme", "setAccent", "setColors", "get"],
                    "description": "Operation"
                },
                "theme": {
                    "type": "string",
                    "enum": ["light", "dark"],
                    "description": "Theme mode (setTheme)"
                },
                "palette": {
                    "type": "string",
                    "description": "Accent palette id (setAccent) — see listAccents"
                },
                "mode": {
                    "type": "string",
                    "enum": ["light", "dark"],
                    "description": "Which mode the custom colors apply to (setColors)"
                },
                "primary": { "type": "string", "description": "Hex color, e.g. #0f172a (setColors)" },
                "secondary": { "type": "string", "description": "Hex color (setColors)" },
                "accent": { "type": "string", "description": "Hex color (setColors)" },
                "background": { "type": "string", "description": "Hex color (setColors)" }
            },
            "required": ["action"]
        })
    }

    fn is_destructive(&self) -> bool {
        false
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
            .unwrap_or("listAccents");

        match action {
            "listAccents" => {
                let accents: Vec<serde_json::Value> = ACCENTS
                    .iter()
                    .map(|(id, name)| serde_json::json!({ "id": id, "name": name }))
                    .collect();
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "accents": accents })),
                    requires_confirmation: false,
                    message: None,
                })
            }
            "setTheme" => {
                let theme = args.get("theme").and_then(|v| v.as_str()).unwrap_or("");
                if theme != "light" && theme != "dark" {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'theme' must be 'light' or 'dark'.".to_string()),
                    });
                }
                emit(&serde_json::json!({ "kind": "theme", "value": theme }));
                let _ = state.storage.set_preference("app.theme", theme).await;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "theme": theme })),
                    requires_confirmation: false,
                    message: Some(format!("Tema cambiado a {theme}.")),
                })
            }
            "setAccent" => {
                let palette = args.get("palette").and_then(|v| v.as_str()).unwrap_or("");
                if palette.is_empty() || !ACCENTS.iter().any(|(id, _)| *id == palette) {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some(format!(
                            "Palette '{}' desconocida. Usa listAccents para ver las disponibles.",
                            palette
                        )),
                    });
                }
                emit(&serde_json::json!({ "kind": "accent", "value": palette }));
                let _ = state
                    .storage
                    .set_preference("app.accentPalette", palette)
                    .await;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "palette": palette })),
                    requires_confirmation: false,
                    message: Some(format!("Paleta de acento cambiada a {palette}.")),
                })
            }
            "setColors" => {
                let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("");
                if mode != "light" && mode != "dark" {
                    return Ok(ToolResult {
                        ok: false,
                        data: None,
                        requires_confirmation: false,
                        message: Some("'mode' must be 'light' or 'dark'.".to_string()),
                    });
                }
                let colors = serde_json::json!({
                    "primary": args.get("primary").and_then(|v| v.as_str()),
                    "secondary": args.get("secondary").and_then(|v| v.as_str()),
                    "accent": args.get("accent").and_then(|v| v.as_str()),
                    "background": args.get("background").and_then(|v| v.as_str()),
                });
                emit(&serde_json::json!({ "kind": "colors", "mode": mode, "value": colors }));
                let key = if mode == "light" {
                    "app.lightColors"
                } else {
                    "app.darkColors"
                };
                let _ = state
                    .storage
                    .set_preference(key, &serde_json::to_string(&colors).unwrap_or_default())
                    .await;
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "mode": mode, "colors": colors })),
                    requires_confirmation: false,
                    message: Some(format!("Colores personalizados aplicados al modo {mode}.")),
                })
            }
            "get" => {
                let prefs = state.storage.get_preferences().await?;
                let known = prefs
                    .iter()
                    .filter(|p| p.key.starts_with("app."))
                    .map(|p| serde_json::json!({ "key": p.key, "value": p.value }))
                    .collect::<Vec<_>>();
                Ok(ToolResult {
                    ok: true,
                    data: Some(serde_json::json!({ "settings": known })),
                    requires_confirmation: false,
                    message: None,
                })
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

/// Broadcast a settings change to the frontend, which applies it live (same
/// path as the Settings page).
fn emit(payload: &serde_json::Value) {
    if let Some(handle) = crate::ssh::APP_HANDLE.get() {
        let _ = handle.emit("app:settings-change", payload);
    }
}
