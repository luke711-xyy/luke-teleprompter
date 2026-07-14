mod files;
mod model;
mod permissions;
mod recognition;

use model::{ModelManager, ModelStatus};
use recognition::RecognitionController;
use std::sync::Arc;
use tauri::{Manager, State};

struct AppState {
    model: ModelManager,
    recognition: RecognitionController,
    microphone_test: RecognitionController,
}

#[tauri::command]
fn get_model_status(state: State<'_, Arc<AppState>>) -> ModelStatus {
    state.model.status()
}

#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.model.download(app).await
}

#[tauri::command]
fn cancel_model_download(state: State<'_, Arc<AppState>>) {
    state.model.cancel();
}

#[tauri::command]
fn start_recognition(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    prompt: String,
) -> Result<(), String> {
    state
        .recognition
        .start(app, state.model.model_path(), prompt)
}

#[tauri::command]
fn stop_recognition(state: State<'_, Arc<AppState>>) {
    state.recognition.stop();
}

#[tauri::command]
fn start_microphone_test(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state
        .microphone_test
        .start_microphone_test(app, state.model.model_path())
}

#[tauri::command]
fn stop_microphone_test(state: State<'_, Arc<AppState>>) {
    state.microphone_test.stop();
}

#[tauri::command]
fn request_microphone_permission() -> Result<(), String> {
    permissions::request_microphone_permission()
}

#[tauri::command]
async fn open_text_file() -> Result<Option<files::OpenedTextFile>, String> {
    files::open_text_file().await
}

#[tauri::command]
async fn save_text_file(
    content: String,
    suggested_name: Option<String>,
) -> Result<Option<String>, String> {
    files::save_text_file(content, suggested_name).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let model_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("无法确定应用数据目录：{error}"))?
                .join("models");
            app.manage(Arc::new(AppState {
                model: ModelManager::new(model_dir),
                recognition: RecognitionController::default(),
                microphone_test: RecognitionController::default(),
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_model_status,
            download_model,
            cancel_model_download,
            start_recognition,
            stop_recognition,
            start_microphone_test,
            stop_microphone_test,
            request_microphone_permission,
            open_text_file,
            save_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Luke Teleprompter");
}
