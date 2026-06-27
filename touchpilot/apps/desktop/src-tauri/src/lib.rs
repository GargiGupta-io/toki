use base64::{engine::general_purpose, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::MenuBuilder, tray::TrayIconBuilder, Manager, PhysicalPosition, PhysicalSize, Position,
    Size, State,
};
use toki_capture::{
    capture_primary_display, capture_primary_display_metadata, CaptureMetadata, ScreenshotCapture,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoiceTranscriptionRequest {
    audio_base64: String,
    format: String,
    sample_rate: u32,
    channels: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceTranscriptionResponse {
    text: String,
    provider: &'static str,
    model: String,
    byte_length: usize,
    sample_rate: u32,
    channels: u16,
}

#[derive(Deserialize)]
struct OpenAiTranscriptionResponse {
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScreenCandidateRequest {
    image_base64: String,
    image_width: f64,
    image_height: f64,
    display_width: f64,
    display_height: f64,
    scale_factor: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenCandidate {
    id: String,
    label: String,
    role: &'static str,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenCandidateResult {
    candidates: Vec<ScreenCandidate>,
    candidate_source: &'static str,
    candidate_error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisionOcrPayload {
    image_width: f64,
    image_height: f64,
    items: Vec<VisionOcrItem>,
}

#[derive(Deserialize)]
struct VisionOcrItem {
    text: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_millis(0))
        .as_millis()
}

fn auto_smoke_logs_enabled() -> bool {
    std::env::var("TOKI_AUTO_REAL_SMOKE").ok().as_deref() == Some("true")
}

fn normalize_candidate_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn slug_candidate_id(label: &str, index: usize) -> String {
    let slug = label
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if slug.is_empty() {
        format!("ocr-candidate-{}", index + 1)
    } else {
        format!(
            "ocr-{}-{}",
            slug.chars().take(48).collect::<String>(),
            index + 1
        )
    }
}

fn vision_ocr_swift_source() -> &'static str {
    r#"
import AppKit
import Foundation
import Vision

struct OcrItem: Encodable {
  let text: String
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct OcrPayload: Encodable {
  let imageWidth: Int
  let imageHeight: Int
  let items: [OcrItem]
}

let arguments = CommandLine.arguments

guard arguments.count >= 2 else {
  fputs("image path is required\n", stderr)
  exit(2)
}

let imageUrl = URL(fileURLWithPath: arguments[1])

guard let image = NSImage(contentsOf: imageUrl) else {
  fputs("could not open image\n", stderr)
  exit(2)
}

guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fputs("could not decode image\n", stderr)
  exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

let observations = request.results ?? []
let items = observations.compactMap { observation -> OcrItem? in
  guard let candidate = observation.topCandidates(1).first else {
    return nil
  }

  let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)

  if text.isEmpty {
    return nil
  }

  let box = observation.boundingBox

  return OcrItem(
    text: text,
    x: box.origin.x,
    y: box.origin.y,
    width: box.size.width,
    height: box.size.height
  )
}

let payload = OcrPayload(imageWidth: cgImage.width, imageHeight: cgImage.height, items: items)
let data = try JSONEncoder().encode(payload)
print(String(data: data, encoding: .utf8)!)
"#
}

fn normalize_vision_ocr_candidate(
    item: &VisionOcrItem,
    index: usize,
    payload: &VisionOcrPayload,
    request: &ScreenCandidateRequest,
) -> Option<ScreenCandidate> {
    const MIN_CANDIDATE_SIZE: f64 = 4.0;

    let label = normalize_candidate_text(&item.text);

    let image_width = if request.image_width.is_finite() && request.image_width > 0.0 {
        request.image_width
    } else {
        payload.image_width
    };
    let image_height = if request.image_height.is_finite() && request.image_height > 0.0 {
        request.image_height
    } else {
        payload.image_height
    };

    if label.is_empty()
        || !item.x.is_finite()
        || !item.y.is_finite()
        || !item.width.is_finite()
        || !item.height.is_finite()
        || item.width <= 0.0
        || item.height <= 0.0
        || !image_width.is_finite()
        || !image_height.is_finite()
        || image_width <= 0.0
        || image_height <= 0.0
        || !request.scale_factor.is_finite()
        || request.scale_factor <= 0.0
    {
        return None;
    }

    let x = (item.x * image_width) / request.scale_factor;
    let y = ((1.0 - item.y - item.height) * image_height) / request.scale_factor;
    let width = (item.width * image_width) / request.scale_factor;
    let height = (item.height * image_height) / request.scale_factor;

    if !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width < MIN_CANDIDATE_SIZE
        || height < MIN_CANDIDATE_SIZE
        || x < 0.0
        || y < 0.0
        || x + width > request.display_width
        || y + height > request.display_height
    {
        return None;
    }

    Some(ScreenCandidate {
        id: slug_candidate_id(&label, index),
        label,
        role: "ocr_text",
        x: x.round() as i32,
        y: y.round() as i32,
        width: width.round() as i32,
        height: height.round() as i32,
    })
}

#[cfg(target_os = "macos")]
fn collect_macos_vision_candidates(request: ScreenCandidateRequest) -> ScreenCandidateResult {
    const MAX_CANDIDATES: usize = 40;

    let Ok(image_bytes) = general_purpose::STANDARD.decode(&request.image_base64) else {
        return ScreenCandidateResult {
            candidates: Vec::new(),
            candidate_source: "macos-vision-ocr",
            candidate_error: Some("screenshot payload is not valid base64".to_string()),
        };
    };

    let temp_root = std::env::temp_dir();
    let stamp = now_ms();
    let image_path = temp_root.join(format!("toki-live-ocr-{stamp}.png"));
    let script_path = temp_root.join(format!("toki-live-ocr-{stamp}.swift"));

    let result = (|| {
        fs::write(&image_path, image_bytes).map_err(|error| error.to_string())?;
        fs::write(&script_path, vision_ocr_swift_source()).map_err(|error| error.to_string())?;

        let output = Command::new("/usr/bin/swift")
            .arg(&script_path)
            .arg(&image_path)
            .output()
            .map_err(|error| error.to_string())?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                format!("macOS Vision OCR exited with {}", output.status)
            } else {
                stderr
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let payload: VisionOcrPayload =
            serde_json::from_str(&stdout).map_err(|error| error.to_string())?;
        let candidates = payload
            .items
            .iter()
            .enumerate()
            .filter_map(|(index, item)| {
                normalize_vision_ocr_candidate(item, index, &payload, &request)
            })
            .take(MAX_CANDIDATES)
            .collect::<Vec<_>>();

        Ok(candidates)
    })();

    let _ = fs::remove_file(&image_path);
    let _ = fs::remove_file(&script_path);

    match result {
        Ok(candidates) => ScreenCandidateResult {
            candidate_error: if candidates.is_empty() {
                Some("macOS Vision OCR returned no candidates".to_string())
            } else {
                None
            },
            candidates,
            candidate_source: "macos-vision-ocr",
        },
        Err(error) => ScreenCandidateResult {
            candidates: Vec::new(),
            candidate_source: "macos-vision-ocr",
            candidate_error: Some(error),
        },
    }
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
                            (*sample as i32 - 32768).clamp(i16::MIN as i32, i16::MAX as i32) as i16
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

    let worker = thread::spawn(move || match prepare_native_voice_stream(worker_samples) {
        Ok((stream, info)) => {
            let _ = ready_sender.send(Ok(info));
            let _ = stop_receiver.recv();
            drop(stream);
        }
        Err(error) => {
            let _ = ready_sender.send(Err(error));
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

fn position_settings_panel<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return;
    };

    let Ok(window_size) = window.outer_size() else {
        return;
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let margin = 22i32;
    let menu_bar_gap = 46i32;
    let x = monitor_position.x + monitor_size.width as i32 - window_size.width as i32 - margin;
    let y = monitor_position.y + menu_bar_gap;

    let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
}

#[tauri::command]
fn capture_metadata() -> Result<CaptureMetadata, String> {
    if auto_smoke_logs_enabled() {
        eprintln!("toki auto real smoke: capture_metadata start");
    }

    let result = capture_primary_display_metadata().map_err(|error| error.to_string());

    if auto_smoke_logs_enabled() {
        eprintln!("toki auto real smoke: capture_metadata done");
    }

    result
}

#[tauri::command]
fn capture_screenshot() -> Result<ScreenshotCapture, String> {
    if auto_smoke_logs_enabled() {
        eprintln!("toki auto real smoke: capture_screenshot start");
    }

    let result = capture_primary_display().map_err(|error| error.to_string());

    if auto_smoke_logs_enabled() {
        eprintln!("toki auto real smoke: capture_screenshot done");
    }

    result
}

#[tauri::command]
fn collect_screen_candidates(
    request: ScreenCandidateRequest,
) -> Result<ScreenCandidateResult, String> {
    if auto_smoke_logs_enabled() {
        eprintln!("toki auto real smoke: collect_screen_candidates start");
    }

    #[cfg(target_os = "macos")]
    {
        let result = collect_macos_vision_candidates(request);

        if auto_smoke_logs_enabled() {
            eprintln!(
                "toki auto real smoke: collect_screen_candidates done candidates={}",
                result.candidates.len()
            );
        }

        return Ok(result);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;

        Ok(ScreenCandidateResult {
            candidates: Vec::new(),
            candidate_source: "unsupported",
            candidate_error: Some(
                "live screen candidates are currently implemented with macOS Vision OCR"
                    .to_string(),
            ),
        })
    }
}

#[tauri::command]
fn hide_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("settings") else {
        return Err("settings window not found".to_string());
    };

    window.hide().map_err(|error| error.to_string())
}

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        #[cfg(target_os = "macos")]
        position_settings_panel(&window);

        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn native_voice_capture_status(
    store: State<'_, Mutex<VoiceCaptureStore>>,
) -> Result<VoiceCaptureStatus, String> {
    let store = store
        .lock()
        .map_err(|_| "voice capture state is poisoned".to_string())?;

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
    let mut store = store
        .lock()
        .map_err(|_| "voice capture state is poisoned".to_string())?;
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
    let mut store = store
        .lock()
        .map_err(|_| "voice capture state is poisoned".to_string())?;
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

fn transcribe_voice_capture_with_openai(
    audio_bytes: Vec<u8>,
    request: &VoiceTranscriptionRequest,
) -> Result<VoiceTranscriptionResponse, String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY is not set for native voice transcription".to_string())?;
    let endpoint = std::env::var("TOKI_TRANSCRIPTION_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1/audio/transcriptions".to_string());
    let model = std::env::var("TOKI_TRANSCRIPTION_MODEL")
        .unwrap_or_else(|_| "gpt-4o-transcribe".to_string());
    let mime_type = if request.format == "audio/wav" {
        "audio/wav"
    } else {
        "application/octet-stream"
    };
    let audio_part = reqwest::blocking::multipart::Part::bytes(audio_bytes.clone())
        .file_name("toki-command.wav")
        .mime_str(mime_type)
        .map_err(|error| format!("failed to prepare transcription audio payload: {error}"))?;
    let form = reqwest::blocking::multipart::Form::new()
        .part("file", audio_part)
        .text("model", model.clone())
        .text("response_format", "json");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("failed to create transcription client: {error}"))?;
    let response = client
        .post(endpoint)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .map_err(|error| format!("transcription request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("failed to read transcription response: {error}"))?;

    if !status.is_success() {
        return Err(format!("transcription provider returned {status}: {body}"));
    }

    let parsed: OpenAiTranscriptionResponse = serde_json::from_str(&body)
        .map_err(|error| format!("failed to parse transcription response: {error}"))?;
    let text = parsed.text.trim().to_string();

    if text.is_empty() {
        return Err("transcription provider returned an empty transcript".to_string());
    }

    Ok(VoiceTranscriptionResponse {
        text,
        provider: "openai",
        model,
        byte_length: audio_bytes.len(),
        sample_rate: request.sample_rate,
        channels: request.channels,
    })
}

fn find_local_whisper_binary() -> Result<String, String> {
    if let Ok(path) = std::env::var("WHISPER_CPP_BIN") {
        return Ok(path);
    }

    if let Ok(home) = std::env::var("HOME") {
        let local_path = PathBuf::from(home)
            .join("tools")
            .join("whisper.cpp")
            .join("build")
            .join("bin")
            .join("whisper-cli");

        if local_path.exists() {
            return Ok(local_path.to_string_lossy().to_string());
        }
    }

    for candidate in ["whisper-cli", "whisper-cpp", "whisper"] {
        let status = Command::new("which")
            .arg(candidate)
            .output()
            .map_err(|error| format!("failed to search for local Whisper binary: {error}"))?;

        if status.status.success() {
            let path = String::from_utf8_lossy(&status.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    Err("local Whisper binary not found. Build whisper.cpp or set WHISPER_CPP_BIN.".to_string())
}

fn local_whisper_model_path() -> Result<String, String> {
    if let Ok(path) = std::env::var("WHISPER_CPP_MODEL") {
        return Ok(path);
    }

    if let Ok(home) = std::env::var("HOME") {
        let local_path = PathBuf::from(home)
            .join("tools")
            .join("whisper.cpp")
            .join("models")
            .join("ggml-base.en.bin");

        if local_path.exists() {
            return Ok(local_path.to_string_lossy().to_string());
        }
    }

    Err(
        "WHISPER_CPP_MODEL is not set and no ~/tools/whisper.cpp base.en model was found."
            .to_string(),
    )
}

fn validate_voice_transcript(text: &str) -> Result<(), String> {
    let normalized = text.trim().to_ascii_lowercase();
    let placeholder_transcripts = ["[blank_audio]", "[inaudible]", "[silence]", "(silence)"];

    if placeholder_transcripts.contains(&normalized.as_str()) {
        return Err(format!(
            "transcription heard no clear speech: {text}. Try push-to-talk again and speak clearly."
        ));
    }

    if text.trim().is_empty() {
        return Err("transcription provider returned an empty transcript".to_string());
    }

    Ok(())
}

fn transcribe_voice_capture_with_local_whisper(
    audio_bytes: Vec<u8>,
    request: &VoiceTranscriptionRequest,
) -> Result<VoiceTranscriptionResponse, String> {
    let whisper_bin = find_local_whisper_binary()?;
    let model_path = local_whisper_model_path()?;
    let mut wav_path: PathBuf = std::env::temp_dir();
    wav_path.push("toki-app-voice-command.wav");
    let mut output_prefix: PathBuf = std::env::temp_dir();
    output_prefix.push("toki-app-voice-command");
    let txt_path = output_prefix.with_extension("txt");

    let _ = fs::remove_file(&txt_path);
    fs::write(&wav_path, &audio_bytes)
        .map_err(|error| format!("failed to write local Whisper WAV file: {error}"))?;

    let output = Command::new(&whisper_bin)
        .arg("-m")
        .arg(&model_path)
        .arg("-f")
        .arg(&wav_path)
        .arg("-otxt")
        .arg("-of")
        .arg(&output_prefix)
        .output()
        .map_err(|error| format!("failed to run local Whisper binary: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "local Whisper failed: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let text = fs::read_to_string(&txt_path)
        .map_err(|error| format!("failed to read local Whisper transcript: {error}"))?
        .trim()
        .to_string();
    validate_voice_transcript(&text)?;

    Ok(VoiceTranscriptionResponse {
        text,
        provider: "local-whisper",
        model: format!("local-whisper:{model_path}"),
        byte_length: audio_bytes.len(),
        sample_rate: request.sample_rate,
        channels: request.channels,
    })
}

#[tauri::command]
fn transcribe_voice_capture(
    request: VoiceTranscriptionRequest,
) -> Result<VoiceTranscriptionResponse, String> {
    let audio_bytes = general_purpose::STANDARD
        .decode(&request.audio_base64)
        .map_err(|error| format!("native voice audio payload is not valid base64: {error}"))?;

    if audio_bytes.len() <= 44 {
        return Err("native voice audio payload does not contain usable WAV samples".to_string());
    }

    let provider = std::env::var("TOKI_TRANSCRIPTION_PROVIDER")
        .unwrap_or_else(|_| "local-whisper".to_string());

    match provider.as_str() {
        "openai" => transcribe_voice_capture_with_openai(audio_bytes, &request),
        "local-whisper" => transcribe_voice_capture_with_local_whisper(audio_bytes, &request),
        other => Err(format!(
            "unsupported transcription provider: {other}. Use local-whisper or openai."
        )),
    }
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
                .text("open_settings", "Open Toki")
                .text("open_debug", "Open Debug")
                .separator()
                .text("quit", "Quit Toki")
                .build()?;

            let default_icon = app.default_window_icon().cloned();
            let mut tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Toki")
                .icon_as_template(true)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open_settings" => {
                        show_settings_window(app);
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

            #[cfg(target_os = "macos")]
            show_settings_window(app.handle());

            if std::env::var("TOKI_AUTO_REAL_SMOKE").ok().as_deref() == Some("true") {
                let app_handle = app.handle().clone();
                let auto_smoke_goal = std::env::var("TOKI_AUTO_REAL_SMOKE_GOAL")
                    .unwrap_or_else(|_| "Show me what to click next.".to_string());
                thread::spawn(move || {
                    eprintln!("toki auto real smoke requested");
                    thread::sleep(Duration::from_millis(5_000));
                    let Some(overlay) = app_handle.get_webview_window("overlay") else {
                        eprintln!("toki auto real smoke failed: overlay window not found");
                        return;
                    };
                    let Ok(goal_json) = serde_json::to_string(&auto_smoke_goal) else {
                        eprintln!("toki auto real smoke failed: could not encode goal");
                        return;
                    };

                    let script = r#"
(() => {
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (typeof window.__tokiRunRealGuidanceSmoke === "function") {
      window.clearInterval(timer);
      window.__tokiRunRealGuidanceSmoke(__TOKI_AUTO_SMOKE_GOAL__);
      return;
    }

    if (attempts >= 30) {
      window.clearInterval(timer);
    }
  }, 500);
})();
"#
                    .replace("__TOKI_AUTO_SMOKE_GOAL__", &goal_json);

                    match overlay.eval(&script) {
                        Ok(()) => eprintln!("toki auto real smoke eval sent"),
                        Err(error) => eprintln!("toki auto real smoke eval failed: {error}"),
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_metadata,
            capture_screenshot,
            collect_screen_candidates,
            hide_settings_window,
            native_voice_capture_status,
            native_voice_capture_start,
            native_voice_capture_stop,
            transcribe_voice_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
