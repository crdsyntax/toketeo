use crate::models::assistant::KnowledgeCase;
use crate::models::{AssistantMessage, QueryHistoryEntry};

pub struct RecommendationEngine;

impl RecommendationEngine {
    /// Analyze query history and generate improvement suggestions.
    pub fn analyze(
        messages: &[AssistantMessage],
        history: &[QueryHistoryEntry],
        cases: &[KnowledgeCase],
    ) -> Vec<String> {
        let mut suggestions: Vec<String> = Vec::new();

        // Check for missing FK indexes
        let negative_rate = if messages.is_empty() {
            0.0
        } else {
            let neg = messages.iter().filter(|m| m.feedback.as_deref() == Some("negative")).count();
            neg as f64 / messages.len() as f64
        };
        if negative_rate > 0.3 {
            suggestions.push(
                "High negative feedback rate (>30%). Consider reviewing response quality or trying a different model/provider."
                    .to_string(),
            );
        }

        // Repeated errors in query history
        let error_queries: Vec<&QueryHistoryEntry> =
            history.iter().filter(|q| q.status == "error").collect();
        if error_queries.len() > 5 {
            suggestions.push(format!(
                "{} queries failed recently. Review error patterns to identify schema issues.",
                error_queries.len()
            ));
        }

        // Slow queries
        let slow_queries: Vec<&QueryHistoryEntry> = history
            .iter()
            .filter(|q| q.duration_ms.map_or(false, |d| d > 5000))
            .collect();
        if slow_queries.len() > 3 {
            suggestions.push(format!(
                "{} queries took >5s. Consider adding indexes or optimizing those queries.",
                slow_queries.len()
            ));
        }

        // Low knowledge library usage
        if cases.is_empty() && messages.len() > 20 {
            suggestions.push(
                "You've had several conversations but no saved knowledge cases. Rate responses with thumbs up/down to build your library."
                    .to_string(),
            );
        }

        suggestions
    }

    /// Suggest tables that might need indexes based on FK columns.
    pub fn suggest_missing_fk_indexes(
        unused_cases: &[KnowledgeCase],
    ) -> Option<String> {
        let unused: Vec<&KnowledgeCase> =
            unused_cases.iter().filter(|c| c.used_count == 0).collect();
        if unused.len() > 3 {
            Some(format!(
                "{} knowledge cases have never been used. Review and clean up, or mark favorites for quick access.",
                unused.len()
            ))
        } else {
            None
        }
    }
}
