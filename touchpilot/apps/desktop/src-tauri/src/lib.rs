use touchpilot_capture::{
    ActiveWindowContext, CaptureMetadata, CaptureSource, CursorContext, DisplayContext,
    ScreenshotCapture, ScreenshotFormat,
};

#[tauri::command]
fn capture_metadata() -> CaptureMetadata {
    CaptureMetadata {
        source: CaptureSource::ActiveDisplay,
        display: DisplayContext {
            id: "primary".to_string(),
            width: 1180,
            height: 760,
            scale_factor: 1.0,
        },
        cursor: Some(CursorContext { x: 640.0, y: 360.0 }),
        active_window: Some(ActiveWindowContext {
            title: Some("TouchPilot".to_string()),
            app_name: Some("TouchPilot".to_string()),
        }),
        captured_at: "placeholder".to_string(),
    }
}

#[tauri::command]
fn capture_screenshot() -> ScreenshotCapture {
    ScreenshotCapture {
        source: CaptureSource::ActiveDisplay,
        display: DisplayContext {
            id: "primary".to_string(),
            width: 1180,
            height: 760,
            scale_factor: 1.0,
        },
        cursor: Some(CursorContext { x: 640.0, y: 360.0 }),
        active_window: Some(ActiveWindowContext {
            title: Some("TouchPilot".to_string()),
            app_name: Some("TouchPilot".to_string()),
        }),
        captured_at: "placeholder".to_string(),
        format: ScreenshotFormat::Png,
        byte_length: 0,
        image_width: 1180,
        image_height: 760,
        image_base64: String::new(),
    }
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
