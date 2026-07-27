use crate::models::assistant::KnowledgeCase;
use crate::models::{AssistantMessage, QueryHistoryEntry};

/// Unified timeline entry combining assistant messages and query history.
#[derive(Debug, Clone)]
pub enum TimelineEntry {
    AssistantMessage(AssistantMessage),
    QueryHistory(QueryHistoryEntry),
    KnowledgeCase(KnowledgeCase),
}

impl TimelineEntry {
    pub fn timestamp(&self) -> i64 {
        match self {
            TimelineEntry::AssistantMessage(m) => m.timestamp,
            TimelineEntry::QueryHistory(q) => q.executed_at,
            TimelineEntry::KnowledgeCase(_) => 0,
        }
    }
}

pub struct HistoryEngine;

impl HistoryEngine {
    /// Merge assistant messages and query history into a unified, sorted timeline.
    pub fn build_timeline(
        messages: Vec<AssistantMessage>,
        history: Vec<QueryHistoryEntry>,
    ) -> Vec<TimelineEntry> {
        let mut entries: Vec<TimelineEntry> = Vec::with_capacity(messages.len() + history.len());

        for msg in messages {
            entries.push(TimelineEntry::AssistantMessage(msg));
        }
        for q in history {
            entries.push(TimelineEntry::QueryHistory(q));
        }

        entries.sort_by_key(|e| e.timestamp());
        entries
    }

    /// Find assistant messages that are related to a specific executed query.
    pub fn find_related_messages<'a>(
        query: &str,
        messages: &'a [AssistantMessage],
        max_distance: i64,
    ) -> Vec<&'a AssistantMessage> {
        let query_lower = query.to_lowercase();
        let mut related: Vec<&AssistantMessage> = Vec::new();

        for msg in messages {
            if msg.role == "assistant" {
                let content_lower = msg.content.to_lowercase();
                if content_lower.contains(&query_lower) {
                    related.push(msg);
                    continue;
                }
                if let Some(ref sql) = msg.sql {
                    if sql.to_lowercase().contains(&query_lower) {
                        related.push(msg);
                    }
                }
            }
        }

        // Filter by time proximity (within max_distance seconds)
        related.retain(|msg| {
            let other_time: Option<i64> = messages
                .iter()
                .find(|m| m.id == msg.id)
                .map(|m| m.timestamp);
            match other_time {
                Some(t) => (t - max_distance..=t + max_distance).contains(&0i64),
                None => true,
            }
        });

        related
    }

    /// Calculate usage statistics for the assistant.
    pub fn calculate_stats(
        messages: &[AssistantMessage],
        cases: &[KnowledgeCase],
    ) -> serde_json::Value {
        let total_assistant = messages.iter().filter(|m| m.role == "assistant").count();
        let total_user = messages.iter().filter(|m| m.role == "user").count();
        let positive = messages
            .iter()
            .filter(|m| m.feedback.as_deref() == Some("positive"))
            .count();
        let negative = messages
            .iter()
            .filter(|m| m.feedback.as_deref() == Some("negative"))
            .count();
        let with_sql = messages.iter().filter(|m| m.sql.is_some()).count();
        let total_cases = cases.len();
        let favorited = cases.iter().filter(|c| c.favorite).count();

        serde_json::json!({
            "totalMessages": messages.len(),
            "assistantReplies": total_assistant,
            "userQueries": total_user,
            "positiveFeedback": positive,
            "negativeFeedback": negative,
            "withSql": with_sql,
            "knowledgeCases": total_cases,
            "favoritedCases": favorited,
        })
    }
}
