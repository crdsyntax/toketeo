pub mod claude;
pub mod deepseek;
pub mod gemini;
pub mod ollama;
pub mod openai;
pub mod openai_format;
pub mod opencode;

use async_trait::async_trait;

use crate::error::AppResult;
use crate::models::assistant::{AiRequest, AiResponse, ModelInfo};

#[async_trait]
pub trait AiAdapter: Send + Sync {
    fn id(&self) -> &str;
    async fn complete(&self, req: AiRequest) -> AppResult<AiResponse>;
    async fn list_models(&self) -> AppResult<Vec<ModelInfo>>;
    fn supports_tools(&self) -> bool;
}
