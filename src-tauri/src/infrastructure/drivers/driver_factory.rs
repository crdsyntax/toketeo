use std::sync::Arc;
use crate::error::AppResult;
use crate::db::{DbDriver, DbType};
use crate::db::postgres::PostgresDriver;
use crate::db::mysql::MySqlDriver;

pub struct DriverFactory;

impl DriverFactory {
    pub async fn create(db_type: DbType, url: &str) -> AppResult<Arc<dyn DbDriver>> {
        match db_type {
            DbType::Postgres => {
                Ok(Arc::new(PostgresDriver::new(url).await?))
            }
            DbType::Mysql | DbType::Mariadb => {
                Ok(Arc::new(MySqlDriver::new(url).await?))
            }
            _ => Err(crate::error::AppError::Internal("Driver not yet implemented".into())),
        }
    }
}
