use touchpilot_capture::{
    capture_primary_display, capture_primary_display_metadata, CaptureMetadata, ScreenshotCapture,
};
use base64::{engine::general_purpose, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
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
    sample_rate: u32,
    channels: u16,
    device_name: Option<String>,
    samples: Arc<Mutex<Vec<i16>>>,
    stop_sender: mpsc::Sender<()>,
    worker: Option<JoinHandle<()>>,
}

struct VoiceCaptureStreamInfo {
    sample_rate: u32,
    channels: u16,
    device_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCaptureStatus {
    status: &'static str,
    session_id: Option<String>,
    started_at_ms: Option<u128>,
    sample_rate: Option<u32>,
    channels: Option<u16>,
    device_name: Option<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCaptureStartResult {
    session_id: String,
    started_at_ms: u128,
    sample_rate: u32,
    channels: u16,
    device_name: Option<String>,
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
    sample_rate: u32,
    channels: u16,
    device_name: Option<String>,
    audio_base64: String,
    format: &'static str,
    status: &'static str,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_millis(0))
        .as_millis()
}

fn log_voice_capture_stream_error(error: cpal::StreamError) {
    eprintln!("native voice capture stream error: {error}");
}

fn encode_wav_i16(samples: &[i16], sample_rate: u32, channels: u16) -> Vec<u8> {
    let bytes_per_sample = 2u16;
    let data_size = (samples.len() * bytes_per_sample as usize) as u32;
    let byte_rate = sample_rate * channels as u32 * bytes_per_sample as u32;
    let block_align = channels * bytes_per_sample;

    let mut output = Vec::with_capacity(44 + data_size as usize);
    output.extend_from_slice(b"RIFF");
    output.extend_from_slice(&(36 + data_size).to_le_bytes());
    output.extend_from_slice(b"WAVE");
    output.extend_from_slice(b"fmt ");
    output.extend_from_slice(&16u32.to_le_bytes());
    output.extend_from_slice(&1u16.to_le_bytes());
    output.extend_from_slice(&channels.to_le_bytes());
    output.extend_from_slice(&sample_rate.to_le_bytes());
    output.extend_from_slice(&byte_rate.to_le_bytes());
    output.extend_from_slice(&block_align.to_le_bytes());
    output.extend_from_slice(&(bytes_per_sample * 8).to_le_bytes());
    output.extend_from_slice(b"data");
    output.extend_from_slice(&data_size.to_le_bytes());

    for sample in samples {
        output.extend_from_slice(&sample.to_le_bytes());
    }

    output
}

fn prepare_native_voice_stream(
    samples: Arc<Mutex<Vec<i16>>>,
) -> Result<(cpal::Stream, VoiceCaptureStreamInfo), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "no default input microphone found".to_string())?;
    let device_name = device.name().ok();
    let supported_config = device
        .default_input_config()
        .map_err(|error| format!("failed to read default microphone config: {error}"))?;
    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    let stream_config: cpal::StreamConfig = supported_config.clone().into();

    let stream = match supported_config.sample_format() {
        cpal::SampleFormat::F32 => {
            let sink = Arc::clone(&samples);
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    if let Ok(mut output) = sink.lock() {
                        output.extend(data.iter().map(|sample| {
                            let clamped = sample.clamp(-1.0, 1.0);
                            (clamped * i16::MAX as f32) as i16
                        }));
                    }
                },
                log_voice_capture_stream_error,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let sink = Arc::clone(&samples);
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    if let Ok(mut output) = sink.lock() {
                        output.extend_from_slice(data);
                    }
                },
                log_voice_capture_stream_error,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let sink = Arc::clone(&samples);
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    if let Ok(mut output) = sink.lock() {
                        output.extend(data.iter().map(|sample| {
                            (*sample as i32 - 32768)
                                .clamp(i16::MIN as i32, i16::MAX as i32)
                                as i16
                        }));
                    }
                },
                log_voice_capture_stream_error,
                None,
            )
        }
        sample_format => {
            return Err(format!(
                "unsupported microphone sample format: {sample_format:?}"
            ));
        }
    }
    .map_err(|error| format!("failed to start microphone stream: {error}"))?;

    stream
        .play()
        .map_err(|error| format!("failed to play microphone stream: {error}"))?;

    Ok((
        stream,
        VoiceCaptureStreamInfo {
            sample_rate,
            channels,
            device_name,
        },
    ))
}

fn start_native_voice_worker() -> Result<
    (
        VoiceCaptureStreamInfo,
        Arc<Mutex<Vec<i16>>>,
        mpsc::Sender<()>,
        JoinHandle<()>,
    ),
    String,
> {
    let samples = Arc::new(Mutex::new(Vec::<i16>::new()));
    let worker_samples = Arc::clone(&samples);
    let (ready_sender, ready_receiver) = mpsc::channel::<Result<VoiceCaptureStreamInfo, String>>();
    let (stop_sender, stop_receiver) = mpsc::channel::<()>();

    let worker = thread::spawn(move || {
        match prepare_native_voice_stream(worker_samples) {
            Ok((stream, info)) => {
                let _ = ready_sender.send(Ok(info));
                let _ = stop_receiver.recv();
                drop(stream);
            }
            Err(error) => {
                let _ = ready_sender.send(Err(error));
            }
        }
    });

    let info = ready_receiver
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "timed out while opening native microphone stream".to_string())??;

    Ok((info, samples, stop_sender, worker))
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
            sample_rate: Some(session.sample_rate),
            channels: Some(session.channels),
            device_name: session.device_name.clone(),
            message: "Native microphone capture is recording.".to_string(),
        });
    }

    Ok(VoiceCaptureStatus {
        status: "idle",
        session_id: None,
        started_at_ms: None,
        sample_rate: None,
        channels: None,
        device_name: None,
        message: "Native microphone capture is idle.".to_string(),
    })
}

#[tauri::command]
fn native_voice_capture_start(
    store: State<'_, Mutex<VoiceCaptureStore>>,
) -> Result<VoiceCaptureStartResult, String> {
    let mut store = store.lock().map_err(|_| "voice capture state is poisoned".to_string())?;
    if store.active_session.is_some() {
        return Err("native voice capture is already active".to_string());
    }

    let started_at_ms = now_ms();
    let session_id = format!("voice-{started_at_ms}");
    let (stream_info, samples, stop_sender, worker) = start_native_voice_worker()?;

    store.active_session = Some(VoiceCaptureSession {
        id: session_id.clone(),
        started_at_ms,
        sample_rate: stream_info.sample_rate,
        channels: stream_info.channels,
        device_name: stream_info.device_name.clone(),
        samples,
        stop_sender,
        worker: Some(worker),
    });

    Ok(VoiceCaptureStartResult {
        session_id,
        started_at_ms,
        sample_rate: stream_info.sample_rate,
        channels: stream_info.channels,
        device_name: stream_info.device_name,
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
    let VoiceCaptureSession {
        id,
        started_at_ms,
        sample_rate,
        channels,
        device_name,
        samples,
        stop_sender,
        mut worker,
    } = session;
    let _ = stop_sender.send(());
    if let Some(worker) = worker.take() {
        let _ = worker.join();
    }

    let recorded_samples = samples
        .lock()
        .map_err(|_| "voice capture sample buffer is poisoned".to_string())?
        .clone();
    let wav_bytes = encode_wav_i16(&recorded_samples, sample_rate, channels);
    let audio_base64 = general_purpose::STANDARD.encode(&wav_bytes);

    Ok(VoiceCaptureStopResult {
        session_id: id,
        started_at_ms,
        stopped_at_ms,
        duration_ms: stopped_at_ms.saturating_sub(started_at_ms),
        byte_length: wav_bytes.len(),
        sample_rate,
        channels,
        device_name,
        audio_base64,
        format: "audio/wav",
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
