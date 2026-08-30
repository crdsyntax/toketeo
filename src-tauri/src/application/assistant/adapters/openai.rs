use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ModelInfo};

use super::openai_format;
use super::AiAdapter;

pub struct OpenAiAdapter {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl OpenAiAdapter {
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
            model: model.unwrap_or_else(|| "gpt-4o".to_string()),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiAdapter for OpenAiAdapter {
    fn id(&self) -> &str {
        "openai"
    }

    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse> {
        let messages = openai_format::build_messages(&req.system, &req.messages);
        let tools = openai_format::build_tools(&req.tools);

        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        });

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "OpenAI returned {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI parse failed: {e}")))?;

        openai_format::parse_response(&data, &self.model)
    }

    async fn complete_streaming(
        &self,
        req: AiRequest,
        on_delta: openai_format::OnDelta<'_>,
    ) -> AppResult<AiResponse> {
        let messages = openai_format::build_messages(&req.system, &req.messages);
        let tools = openai_format::build_tools(&req.tools);

        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        });

        openai_format::complete_streaming(
            &self.client,
            &self.base_url,
            Some(&self.api_key),
            "OpenAI",
            &body,
            &self.model,
            on_delta,
        )
        .await
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let resp = self
            .client
            .get(format!("{}/models", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI models request failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Internal(
                "Failed to list OpenAI models".to_string(),
            ));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI parse failed: {e}")))?;

        let models = data["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m["id"].as_str()?.to_string();
                        let supports_tools = !id.starts_with("o1") && !id.starts_with("gpt-3.5");
                        Some(ModelInfo {
                            id: id.clone(),
                            name: id,
                            provider: "openai".to_string(),
                            supports_tools,
                            is_free: false,
                            tier: String::new(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(models)
    }

    fn supports_tools(&self) -> bool {
        true
    }
}
