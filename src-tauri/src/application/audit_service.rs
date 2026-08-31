use crate::error::AppResult;
use crate::state::AppState;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditEntry {
    pub id: Option<i64>,
    pub connection_id: String,
    pub query: String,
    pub timestamp: DateTime<Utc>,
    pub execution_time_ms: u64,
    pub status: String,
    pub error: Option<String>,

    #[serde(default = "default_origin")]
    pub origin: String,
}

fn default_origin() -> String {
    "user".to_string()
}

pub const ORIGIN_USER: &str = "user";
pub const ORIGIN_ASSISTANT: &str = "assistant";

pub struct AuditService;

impl AuditService {
    pub async fn log_query(
        state: &AppState,
        connection_id: String,
        query: String,
        execution_time_ms: u64,
        status: String,
        error: Option<String>,
    ) -> AppResult<()> {
        Self::log_query_with_origin(
            state,
            connection_id,
            query,
            execution_time_ms,
            status,
            error,
            ORIGIN_USER,
        )
        .await
    }

    pub async fn log_query_with_origin(
        state: &AppState,
        connection_id: String,
        query: String,
        execution_time_ms: u64,
        status: String,
        error: Option<String>,
        origin: &str,
    ) -> AppResult<()> {
        let entry = AuditEntry {
            id: None,
            connection_id,
            query,
            timestamp: Utc::now(),
            execution_time_ms,
            status,
            error,
            origin: origin.to_string(),
        };

        state.storage.save_audit_log(entry).await
    }

    pub async fn get_logs(state: &AppState, limit: u32, offset: u32) -> AppResult<Vec<AuditEntry>> {
        state.storage.get_audit_logs(limit, offset).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audit_entry_serialization() {
        let entry = AuditEntry {
            id: Some(1),
            connection_id: "test-id".into(),
            query: "SELECT 1".into(),
            timestamp: Utc::now(),
            execution_time_ms: 10,
            status: "success".into(),
            error: None,
            origin: ORIGIN_ASSISTANT.into(),
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("SELECT 1"));
        assert!(json.contains("assistant"));
    }
}
