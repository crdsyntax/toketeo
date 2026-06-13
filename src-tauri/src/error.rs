use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),
    #[error("SSH error: {0}")]
    Ssh(String),
    #[error("Authentication error: {0}")]
    Auth(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(err: mongodb::error::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<ssh2::Error> for AppError {
    fn from(err: ssh2::Error) -> Self {
        AppError::Ssh(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_error_serialization() {
        let err = AppError::Database("Connection failed".into());
        let json = serde_json::to_value(&err).unwrap();
        // Since we are using #[derive(Serialize)] on the enum, 
        // by default it serializes as { "Variant": "Content" }
        assert_eq!(json, json!({"Database": "Connection failed"}));
    }

    #[test]
    fn test_internal_error_serialization() {
        let err = AppError::Internal("Unexpected error".into());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json, json!({"Internal": "Unexpected error"}));
    }
}
