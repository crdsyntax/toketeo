use std::sync::Arc;
use crate::error::AppResult;
use crate::db::{DbDriver, DbType};
use crate::db::postgres::PostgresDriver;
use crate::db::mysql::MySqlDriver;
use crate::db::mongodb::MongoDbDriver;

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
            DbType::Mongodb => {
                Ok(Arc::new(MongoDbDriver::new(url).await?))
            }
            _ => Err(crate::error::AppError::Validation(format!("Database engine '{:?}' is not yet implemented", db_type))),
        }
    }
}
