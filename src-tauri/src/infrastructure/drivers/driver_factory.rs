use crate::db::mongodb::MongoDbDriver;
use crate::db::mysql::MySqlDriver;
use crate::db::neo4j::driver::Neo4jDriver;
use crate::db::postgres::PostgresDriver;
use crate::db::redis::RedisDriver;
use crate::db::sqlite::SqliteDriver;
use crate::db::sqlserver::SqlServerDriver;
use crate::db::{DbDriver, DbType, PoolConfig};
use crate::error::AppResult;
use std::sync::Arc;

pub struct DriverFactory;

impl DriverFactory {
    pub async fn create(
        db_type: DbType,
        url: &str,
        transactional: bool,
        pool_config: Option<PoolConfig>,
        user: &str,
        password: Option<&str>,
        database: Option<&str>,
    ) -> AppResult<Arc<dyn DbDriver>> {
        match db_type {
            DbType::Postgres => Ok(Arc::new(
                PostgresDriver::new(url, transactional, pool_config).await?,
            )),
            DbType::Mysql | DbType::Mariadb => Ok(Arc::new(
                MySqlDriver::new(url, transactional, pool_config).await?,
            )),
            DbType::Mongodb => Ok(Arc::new(MongoDbDriver::new(url, pool_config).await?)),
            DbType::Sqlserver => Ok(Arc::new(SqlServerDriver::new(url).await?)),
            DbType::Redis => Ok(Arc::new(
                RedisDriver::new(url, transactional, pool_config).await?,
            )),
            DbType::Sqlite => Ok(Arc::new(SqliteDriver::new(url).await?)),
            DbType::Neo4j => Ok(Arc::new(
                Neo4jDriver::new(url, user, password, database, pool_config.as_ref()).await?,
            )),
        }
    }
}
