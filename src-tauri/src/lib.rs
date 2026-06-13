pub mod error;
pub mod models;
pub mod db;
pub mod ssh;
pub mod commands;
pub mod state;
pub mod storage;

use state::AppState;
use storage::Storage;
use tauri::Manager;
use std::fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_log::Builder::default().build())
    .setup(|app| {
      let app_handle = app.handle();
      let app_dir = app_handle.path().app_data_dir().expect("Failed to get app data dir");
      
      if !app_dir.exists() {
        fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
      }

      let db_path = app_dir.join("toketeo.db");
      
      // We need to run the async setup in a tokio runtime
      let storage = tauri::async_runtime::block_on(async {
        // Ensure sqlite file exists or create it
        if !db_path.exists() {
            fs::File::create(&db_path).expect("Failed to create db file");
        }
        Storage::new(db_path).await.expect("Failed to initialize storage")
      });

      app.manage(tauri::async_runtime::block_on(AppState::new(storage)));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        commands::connect,
        commands::disconnect,
        commands::execute_query,
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
        commands::get_parameters,
        commands::execute_explorer,
        commands::edit_column,
        commands::drop_column,
        commands::drop_index,
        commands::rename_index,
        commands::drop_foreign_key,
        commands::drop_constraint,
        commands::switch_schema,
        commands::save_connection,
        commands::get_connections,
        commands::delete_connection,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
