use crate::models::assistant::ChatMessage;
use crate::models::AssistantMessage;

pub struct MemoryEngine;

impl MemoryEngine {
    /// Convert stored AssistantMessages to ChatMessages for the AI prompt.
    pub fn build_history(stored: &[AssistantMessage], max_turns: usize) -> Vec<ChatMessage> {
        let mut history: Vec<ChatMessage> = stored
            .iter()
            .map(|m| ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                ..Default::default()
            })
            .collect();

        // Keep only the last N turns (each turn = user + assistant = 2 messages)
        if history.len() > max_turns * 2 {
            let start = history.len() - max_turns * 2;
            history = history.split_off(start);
        }

        history
    }

    /// Estimate total token count for history.
    pub fn estimate_history_tokens(history: &[ChatMessage]) -> usize {
        let mut total = 0;
        for msg in history {
            total += msg.content.len() / 4;
        }
        total
    }
}
