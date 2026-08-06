pub mod claude;
pub mod deepseek;
pub mod gemini;
pub mod ollama;
pub mod openai;
pub mod openai_format;
pub mod opencode;

use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use crate::models::assistant::{AiRequest, AiResponse, ModelInfo, ProviderConfig};

#[async_trait]
pub trait AiAdapter: Send + Sync {
    fn id(&self) -> &str;
    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse>;
    async fn list_models(&self) -> AppResult<Vec<ModelInfo>>;
    fn supports_tools(&self) -> bool;
}

/// Build the adapter for a provider config.
pub fn create_adapter(config: &ProviderConfig) -> AppResult<Box<dyn AiAdapter>> {
    match config.provider_id.as_str() {
        "openai" => Ok(Box::new(openai::OpenAiAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "claude" => Ok(Box::new(claude::ClaudeAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "gemini" => Ok(Box::new(gemini::GeminiAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "deepseek" => Ok(Box::new(deepseek::DeepSeekAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "ollama" => Ok(Box::new(ollama::OllamaAdapter::new(
            config.model.clone(),
            config.base_url.clone(),
        ))),
        "opencode" => Ok(Box::new(opencode::OpenCodeAdapter::new(
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
            config.base_url.clone(),
        ))),
        other => Err(AppError::Internal(format!("Unknown provider: {other}"))),
    }
}
