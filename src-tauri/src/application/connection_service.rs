use uuid::Uuid;
use crate::error::AppResult;
use crate::models::DbConnectionConfig;
use crate::state::AppState;

use crate::infrastructure::drivers::driver_factory::DriverFactory;
use crate::infrastructure::database::connection_string_builder::ConnectionStringBuilder;

pub struct ConnectionService;

impl ConnectionService {
    pub async fn save_connection(
        state: &AppState,
        config: DbConnectionConfig,
    ) -> AppResult<String> {
        state.storage.save_connection(config).await
    }

    pub async fn get_connections(state: &AppState) -> AppResult<Vec<DbConnectionConfig>> {
        state.storage.get_all_connections().await
    }

    pub async fn delete_connection(state: &AppState, id: &str) -> AppResult<()> {
        state.storage.delete_connection(id).await
    }

    pub async fn connect(
        state: &AppState,
        mut config: DbConnectionConfig,
    ) -> AppResult<String> {
        let id_uuid = config.id.unwrap_or_else(Uuid::new_v4);
        let id = id_uuid.to_string();
        config.id = Some(id_uuid);

        // SSH Tunnel Setup
        let ssh_tunnel = if let Some(ref ssh_config) = config.ssh_tunnel {
            Some(crate::ssh::SshTunnel::open(ssh_config).await?)
        } else {
            None
        };

        // Build URL (will use localhost if SSH is active)
        let url = ConnectionStringBuilder::build(&config);
        
        // Create Driver
        let driver = match DriverFactory::create(config.db_type, &url).await {
            Ok(d) => d,
            Err(e) => {
                // ssh_tunnel will be dropped here automatically if it exists
                return Err(e);
            }
        };

        state.add_connection(id.clone(), driver, ssh_tunnel).await;
        Ok(id)
    }

    pub async fn disconnect(state: &AppState, id: &str) -> AppResult<()> {
        state.remove_connection(id).await
    }
}
