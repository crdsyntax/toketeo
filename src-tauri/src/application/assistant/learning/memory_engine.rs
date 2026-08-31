use crate::models::assistant::ChatMessage;
use crate::models::AssistantMessage;

pub struct MemoryEngine;

impl MemoryEngine {
    pub fn build_history(stored: &[AssistantMessage], max_turns: usize) -> Vec<ChatMessage> {
        let mut history: Vec<ChatMessage> = stored
            .iter()
            .map(|m| ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                ..Default::default()
            })
            .collect();

        if history.len() > max_turns * 2 {
            let start = history.len() - max_turns * 2;
            history = history.split_off(start);
        }

        history
    }

    pub fn estimate_history_tokens(history: &[ChatMessage]) -> usize {
        let mut total = 0;
        for msg in history {
            total += msg.content.len() / 4;
        }
        total
    }
}
