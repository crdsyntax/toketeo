pub mod application;
pub mod commands;
pub mod db;
pub mod error;
pub mod infrastructure;
pub mod models;
pub mod presentation;
pub mod ssh;
pub mod state;
pub mod storage;

use state::AppState;
use std::fs;
use storage::Storage;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing::info!("Starting Toketeo Backend...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().skip_logger().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle();
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            if !app_dir.exists() {
                fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            }

            let db_path = app_dir.join("toketeo.db");

            let storage = tauri::async_runtime::block_on(async {
                if !db_path.exists() {
                    fs::File::create(&db_path).expect("Failed to create db file");
                }
                Storage::new(db_path)
                    .await
                    .expect("Failed to initialize storage")
            });

            let state = tauri::async_runtime::block_on(AppState::new(storage));
            app.manage(state);

            crate::application::session_service::SessionService::spawn_cleanup_task(
                app.handle().clone(),
                std::time::Duration::from_secs(60),
                std::time::Duration::from_secs(1800),
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect,
            commands::disconnect,
            commands::execute_query,
            commands::update_cell,
            commands::get_schemas,
            commands::get_tables,
            commands::get_views,
            commands::get_procedures,
            commands::get_triggers,
            commands::get_functions,
            commands::get_columns,
            commands::get_indexes,
            commands::get_foreign_keys,
            commands::get_constraints,
            commands::get_ddl,
            commands::update_ddl,
            commands::commit_transaction,
            commands::rollback_transaction,
            commands::get_parameters,
            commands::execute_explorer,
            commands::edit_column,
            commands::drop_column,
            commands::drop_index,
            commands::rename_index,
            commands::drop_foreign_key,
            commands::drop_constraint,
            commands::switch_schema,
            commands::export_connection,
            commands::export_all_connections,
            commands::import_connections,
            commands::export_connection_dialog,
            commands::export_all_connections_dialog,
            commands::import_connections_dialog,
            commands::save_file_dialog,
            commands::save_connection,
            commands::get_connections,
            commands::get_connection,
            commands::delete_connection,
            commands::get_databases,
            commands::diagnose_connection,
            commands::switch_database,
            commands::get_audit_logs,
            commands::generate_sql,
            commands::generate_model,
            commands::get_db_type,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
