use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditEntry {
    pub id: Option<i64>,
    pub connection_id: String,
    pub query: String,
    pub timestamp: DateTime<Utc>,
    pub execution_time_ms: u64,
    pub status: String,
    pub error: Option<String>,
}

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
        let entry = AuditEntry {
            id: None,
            connection_id,
            query,
            timestamp: Utc::now(),
            execution_time_ms,
            status,
            error,
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
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("SELECT 1"));
    }
}
