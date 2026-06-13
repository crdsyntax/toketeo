pub mod error;
pub mod models;
pub mod db;
pub mod ssh;
pub mod commands;
pub mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_log::Builder::default().build())
    .manage(AppState::new())
    .invoke_handler(tauri::generate_handler![
        commands::connect,
        commands::disconnect,
        commands::execute_query,
        commands::get_tables,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
