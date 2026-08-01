use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ModelInfo};

use super::openai_format;
use super::AiAdapter;

/// Raw model IDs that are only served by the Zen free endpoint (populated by
/// `list_models`, which queries both the configured and the free endpoint).
static FREE_MODEL_IDS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn free_model_ids() -> &'static Mutex<HashSet<String>> {
    FREE_MODEL_IDS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub struct OpenCodeAdapter {
    api_key: String,
    base_url: String,
    /// Free tier endpoint, derived from `base_url` (e.g. `.../zen/go/v1` →
    /// `https://opencode.ai/zen/v1`).
    free_base_url: String,
    model: String,        // display format – may include `opencode/` prefix
    model_raw: String,    // raw ID sent to the API (prefix stripped)
    client: reqwest::Client,
}

impl OpenCodeAdapter {
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        let model = model.unwrap_or_else(|| "opencode/gpt-5.5".to_string());
        let model_raw = Self::strip_prefix(&model);
        let base_url = base_url.unwrap_or_else(|| "https://opencode.ai/zen/v1".to_string());
        // Free tier endpoint: Zen exposes the free models under the non-`go` path.
        let free_base_url = if base_url.contains("/go/") {
            base_url.replacen("/go/", "/", 1)
        } else {
            base_url.clone()
        };
        Self {
            api_key,
            free_base_url,
            base_url,
            model_raw,
            model,
            client: reqwest::Client::new(),
        }
    }

    /// Strip the `opencode/` prefix if present. The Zen API expects the raw
    /// model ID (e.g. `deepseek-v4-flash` not `opencode/deepseek-v4-flash`).
    fn strip_prefix(m: &str) -> String {
        let cleaned: String = m
            .chars()
            .map(|c| if c.is_whitespace() { '-' } else { c })
            .flat_map(|c| c.to_lowercase())
            .collect();
        cleaned.strip_prefix("opencode/").unwrap_or(&cleaned).to_string()
    }

    fn is_free_model(&self) -> bool {
        if self.model_raw.ends_with("-free") {
            return true;
        }
        if let Ok(ids) = free_model_ids().try_lock() {
            return ids.contains(&self.model_raw);
        }
        false
    }

    /// GET the model list from one Zen endpoint, returning raw IDs.
    async fn fetch_model_ids(&self, url: &str, api_key: &str) -> Vec<String> {
        let mut req = self.client.get(url);
        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {api_key}"));
        }
        let resp = match req.send().await {
            Ok(r) if r.status().is_success() => r,
            _ => return Vec::new(),
        };
        let data: serde_json::Value = match resp.json().await {
            Ok(d) => d,
            Err(_) => return Vec::new(),
        };
        data["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }
}

#[async_trait]
impl AiAdapter for OpenCodeAdapter {
    fn id(&self) -> &str {
        "opencode"
    }

    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse> {
        let messages = openai_format::build_messages(&req.system, &req.messages);
        let tools = openai_format::build_tools(&req.tools);

        let body = serde_json::json!({
            "model": self.model_raw,
            "messages": messages,
            "tools": tools,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        });

        // Free models are served by the free tier endpoint (no API key needed).
        let is_free = self.is_free_model();
        let url = if is_free {
            format!("{}/chat/completions", self.free_base_url)
        } else {
            format!("{}/chat/completions", self.base_url)
        };
        let api_key = if is_free { "" } else { &self.api_key };

        let mut request = self.client.post(url).json(&body);
        if !api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {api_key}"));
        }
        let resp = request
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenCode request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "OpenCode returned {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenCode parse failed: {e}")))?;

        openai_format::parse_response(&data, &self.model)
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        // Two endpoints: the configured one (Zen Go plan, paid models) and the
        // free tier one, which also exposes the `-free` models and the rest of
        // the general Zen catalog.
        let go_ids = self
            .fetch_model_ids(&format!("{}/models", self.base_url), &self.api_key)
            .await;
        let zen_ids = self
            .fetch_model_ids(&format!("{}/models", self.free_base_url), "")
            .await;

        if go_ids.is_empty() && zen_ids.is_empty() {
            return Err(AppError::Internal(
                "Failed to list OpenCode models".to_string(),
            ));
        }

        let go_set: HashSet<String> = go_ids.iter().cloned().collect();
        let free_set: HashSet<String> = zen_ids
            .iter()
            .filter(|id| id.ends_with("-free"))
            .cloned()
            .collect();

        if let Ok(mut ids) = free_model_ids().try_lock() {
            *ids = free_set.clone();
        }

        let mut models: Vec<ModelInfo> = Vec::new();

        // Zen Go plan models (paid).
        for id in &go_ids {
            models.push(ModelInfo {
                id: format!("opencode/{id}"),
                name: id.clone(),
                provider: "opencode".to_string(),
                supports_tools: true,
                is_free: false,
                tier: "go".to_string(),
            });
        }

        // Free tier models.
        for id in &free_set {
            models.push(ModelInfo {
                id: format!("opencode/{id}"),
                name: id.clone(),
                provider: "opencode".to_string(),
                supports_tools: true,
                is_free: true,
                tier: "free".to_string(),
            });
        }

        // Rest of the general Zen catalog (available but not part of the Go plan).
        for id in &zen_ids {
            if !go_set.contains(id) && !free_set.contains(id) {
                models.push(ModelInfo {
                    id: format!("opencode/{id}"),
                    name: id.clone(),
                    provider: "opencode".to_string(),
                    supports_tools: true,
                    is_free: false,
                    tier: "zen".to_string(),
                });
            }
        }

        Ok(models)
    }

    fn supports_tools(&self) -> bool {
        true
    }
}
