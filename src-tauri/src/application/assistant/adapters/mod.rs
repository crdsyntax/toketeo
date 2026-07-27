pub mod ollama;
pub mod openai;

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
