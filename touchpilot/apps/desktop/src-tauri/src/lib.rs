use touchpilot_capture::{
    capture_primary_display, capture_primary_display_metadata, CaptureMetadata, ScreenshotCapture,
};
use tauri::{
    menu::MenuBuilder,
    tray::TrayIconBuilder,
    Manager,
};

#[cfg(windows)]
fn remove_windows_overlay_chrome<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use std::ffi::c_void;

    const GWL_STYLE: i32 = -16;
    const GWL_EXSTYLE: i32 = -20;
    const WS_CAPTION: isize = 0x00C00000;
    const WS_THICKFRAME: isize = 0x00040000;
    const WS_MINIMIZEBOX: isize = 0x00020000;
    const WS_MAXIMIZEBOX: isize = 0x00010000;
    const WS_SYSMENU: isize = 0x00080000;
    const WS_EX_APPWINDOW: isize = 0x00040000;
    const WS_EX_TOOLWINDOW: isize = 0x00000080;
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
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !border_styles);

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(
            hwnd,
            GWL_EXSTYLE,
            (ex_style & !WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW,
        );

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
        .setup(|app| {
            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_title(" ");
                let _ = overlay.set_decorations(false);
                let _ = overlay.set_fullscreen(true);
                let _ = overlay.set_ignore_cursor_events(true);
                let _ = overlay.set_focusable(false);
                let _ = overlay.set_skip_taskbar(true);
                #[cfg(windows)]
                remove_windows_overlay_chrome(&overlay);
            }

            if let Some(settings) = app.get_webview_window("settings") {
                let _ = settings.set_title(" ");
                let _ = settings.hide();
                let _ = settings.set_decorations(false);
                let _ = settings.set_focusable(true);
                let _ = settings.set_skip_taskbar(true);
                #[cfg(windows)]
                remove_windows_overlay_chrome(&settings);
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
            capture_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
