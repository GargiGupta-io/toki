use touchpilot_capture::{
    capture_primary_display, capture_primary_display_metadata, CaptureMetadata, ScreenshotCapture,
};

#[tauri::command]
fn capture_metadata() -> Result<CaptureMetadata, String> {
    capture_primary_display_metadata().map_err(|error| error.to_string())
}

#[tauri::command]
fn capture_screenshot() -> Result<ScreenshotCapture, String> {
    capture_primary_display().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            capture_metadata,
            capture_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
