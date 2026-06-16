use touchpilot_capture::{
    capture_primary_display, capture_primary_display_metadata, CaptureMetadata, ScreenshotCapture,
};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::MenuBuilder,
    tray::TrayIconBuilder,
    Manager, PhysicalPosition, PhysicalSize, Position, Size, State,
};

#[derive(Default)]
struct VoiceCaptureStore {
    active_session: Option<VoiceCaptureSession>,
}

struct VoiceCaptureSession {
    id: String,
    started_at_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCaptureStatus {
    status: &'static str,
    session_id: Option<String>,
    started_at_ms: Option<u128>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCaptureStartResult {
    session_id: String,
    started_at_ms: u128,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCaptureStopResult {
    session_id: String,
    started_at_ms: u128,
    stopped_at_ms: u128,
    duration_ms: u128,
    byte_length: usize,
    format: &'static str,
    status: &'static str,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_millis(0))
        .as_millis()
}

#[cfg(windows)]
fn prepare_windows_utility_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    passive_overlay: bool,
) {
    use std::ffi::c_void;

    const GWL_STYLE: i32 = -16;
    const GWL_EXSTYLE: i32 = -20;
    const WS_POPUP: isize = 0x80000000u32 as isize;
    const WS_CAPTION: isize = 0x00C00000;
    const WS_THICKFRAME: isize = 0x00040000;
    const WS_MINIMIZEBOX: isize = 0x00020000;
    const WS_MAXIMIZEBOX: isize = 0x00010000;
    const WS_SYSMENU: isize = 0x00080000;
    const WS_EX_TRANSPARENT: isize = 0x00000020;
    const WS_EX_APPWINDOW: isize = 0x00040000;
    const WS_EX_TOOLWINDOW: isize = 0x00000080;
    const WS_EX_LAYERED: isize = 0x00080000;
    const WS_EX_NOACTIVATE: isize = 0x08000000;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;

    type Hwnd = *mut c_void;

    extern "system" {
        fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, value: isize) -> isize;
        fn SetWindowTextW(hwnd: Hwnd, title: *const u16) -> i32;
        fn SetWindowPos(
            hwnd: Hwnd,
            hwnd_insert_after: Hwnd,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = hwnd.0 as Hwnd;

    unsafe {
        let empty_title = [0u16];
        SetWindowTextW(hwnd, empty_title.as_ptr());

        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let border_styles =
            WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU;
        SetWindowLongPtrW(hwnd, GWL_STYLE, (style & !border_styles) | WS_POPUP);

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let mut utility_ex_style = (ex_style & !WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;
        if passive_overlay {
            utility_ex_style |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE;
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, utility_ex_style);

        SetWindowPos(
            hwnd,
            std::ptr::null_mut::<c_void>(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

fn fit_overlay_to_monitor<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return;
    };

    let position = monitor.position();
    let size = monitor.size();
    let _ = window.set_fullscreen(false);
    let _ = window.set_position(Position::Physical(PhysicalPosition {
        x: position.x,
        y: position.y,
    }));
    let _ = window.set_size(Size::Physical(PhysicalSize {
        width: size.width,
        height: size.height,
    }));
}

#[tauri::command]
fn capture_metadata() -> Result<CaptureMetadata, String> {
    capture_primary_display_metadata().map_err(|error| error.to_string())
}

#[tauri::command]
fn capture_screenshot() -> Result<ScreenshotCapture, String> {
    capture_primary_display().map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("settings") else {
        return Err("settings window not found".to_string());
    };

    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn move_settings_window(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    let Some(window) = app.get_webview_window("settings") else {
        return Err("settings window not found".to_string());
    };

    window
        .set_position(Position::Physical(PhysicalPosition { x, y }))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn native_voice_capture_status(
    store: State<'_, Mutex<VoiceCaptureStore>>,
) -> Result<VoiceCaptureStatus, String> {
    let store = store.lock().map_err(|_| "voice capture state is poisoned".to_string())?;

    if let Some(session) = &store.active_session {
        return Ok(VoiceCaptureStatus {
            status: "capturing",
            session_id: Some(session.id.clone()),
            started_at_ms: Some(session.started_at_ms),
            message: "Native microphone capture session is active.".to_string(),
        });
    }

    Ok(VoiceCaptureStatus {
        status: "idle",
        session_id: None,
        started_at_ms: None,
        message: "Native microphone capture is idle.".to_string(),
    })
}

#[tauri::command]
fn native_voice_capture_start(
    store: State<'_, Mutex<VoiceCaptureStore>>,
) -> Result<VoiceCaptureStartResult, String> {
    let mut store = store.lock().map_err(|_| "voice capture state is poisoned".to_string())?;
    let started_at_ms = now_ms();
    let session_id = format!("voice-{started_at_ms}");

    store.active_session = Some(VoiceCaptureSession {
        id: session_id.clone(),
        started_at_ms,
    });

    Ok(VoiceCaptureStartResult {
        session_id,
        started_at_ms,
        status: "capturing",
    })
}

#[tauri::command]
fn native_voice_capture_stop(
    store: State<'_, Mutex<VoiceCaptureStore>>,
) -> Result<VoiceCaptureStopResult, String> {
    let mut store = store.lock().map_err(|_| "voice capture state is poisoned".to_string())?;
    let Some(session) = store.active_session.take() else {
        return Err("no active native voice capture session".to_string());
    };
    let stopped_at_ms = now_ms();

    Ok(VoiceCaptureStopResult {
        session_id: session.id,
        started_at_ms: session.started_at_ms,
        stopped_at_ms,
        duration_ms: stopped_at_ms.saturating_sub(session.started_at_ms),
        byte_length: 0,
        format: "native-audio-placeholder",
        status: "stopped",
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(VoiceCaptureStore::default()))
        .setup(|app| {
            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_title(" ");
                let _ = overlay.set_decorations(false);
                fit_overlay_to_monitor(&overlay);
                let _ = overlay.set_ignore_cursor_events(true);
                let _ = overlay.set_focusable(false);
                let _ = overlay.set_skip_taskbar(true);
                #[cfg(windows)]
                prepare_windows_utility_window(&overlay, true);
            }

            if let Some(settings) = app.get_webview_window("settings") {
                let _ = settings.set_title(" ");
                let _ = settings.hide();
                let _ = settings.set_decorations(false);
                let _ = settings.set_focusable(true);
                let _ = settings.set_skip_taskbar(true);
                #[cfg(windows)]
                prepare_windows_utility_window(&settings, false);
            }

            if let Some(debug) = app.get_webview_window("debug") {
                let _ = debug.hide();
            }

            let tray_menu = MenuBuilder::new(app)
                .text("open_settings", "Open Settings")
                .text("open_debug", "Open Debug")
                .separator()
                .text("quit", "Quit")
                .build()?;

            let default_icon = app.default_window_icon().cloned();
            let mut tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("TouchPilot")
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open_settings" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "open_debug" => {
                        if let Some(window) = app.get_webview_window("debug") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                });

            if let Some(icon) = default_icon {
                tray = tray.icon(icon);
            }

            let _tray = tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_metadata,
            capture_screenshot,
            hide_settings_window,
            move_settings_window,
            native_voice_capture_status,
            native_voice_capture_start,
            native_voice_capture_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
