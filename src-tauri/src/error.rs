use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("Database connection failed: {0}")]
    Connection(String),
    #[error("Database error: {0}")]
    Database(String),
    #[error("SSH error: {0}")]
    Ssh(String),
    #[error("Authentication error: {0}")]
    Auth(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::Database(db_err) => {
                let msg = db_err.message();

                if msg.contains("Access denied") || msg.contains("password authentication failed") {
                    AppError::Auth(msg.to_string())
                } else {
                    AppError::Database(msg.to_string())
                }
            }
            sqlx::Error::Io(io_err) => {
                AppError::Connection(format!("Network/IO error: {}", io_err))
            }
            sqlx::Error::PoolTimedOut => AppError::Connection("Connection pool timed out".into()),
            sqlx::Error::Tls(tls_err) => AppError::Connection(format!("TLS error: {}", tls_err)),
            _ => AppError::Database(err.to_string()),
        }
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(err: mongodb::error::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Validation(err.to_string())
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

        assert_eq!(json, json!({"Database": "Connection failed"}));
    }

    #[test]
    fn test_internal_error_serialization() {
        let err = AppError::Internal("Unexpected error".into());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json, json!({"Internal": "Unexpected error"}));
    }
}
