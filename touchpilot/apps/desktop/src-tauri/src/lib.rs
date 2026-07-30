use base64::{engine::general_purpose, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::MenuBuilder, tray::TrayIconBuilder, Emitter, LogicalSize, Manager, PhysicalPosition,
    PhysicalSize, Position, Size, State,
};
use toki_capture::{
    capture_primary_display, capture_primary_display_metadata, ActiveWindowContext,
    CaptureMetadata, ScreenshotCapture,
};

mod macos_overlay;

static VOICE_SHORTCUT_HELD: AtomicBool = AtomicBool::new(false);
static OVERLAY_GUIDANCE_SURFACE: AtomicBool = AtomicBool::new(false);
const NATIVE_VOICE_KEY_POLL_MS: u64 = 35;
const NATIVE_CURSOR_POLL_MS: u64 = 50;
const NATIVE_CLICK_POLL_MS: u64 = 25;

#[derive(Default)]
struct NativeClickMonitorState {
    armed: AtomicBool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokiDebugExportCapture {
    format: String,
    image_base64: String,
    byte_length: usize,
    captured_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokiDebugExportRequest {
    snapshot: serde_json::Value,
    history_entries: Vec<serde_json::Value>,
    capture: Option<TokiDebugExportCapture>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TokiDebugExportStatus {
    directory: String,
    snapshot_path: String,
    history_path: String,
    capture_path: Option<String>,
    snapshot_exists: bool,
    history_exists: bool,
    last_snapshot_modified_ms: Option<u128>,
}

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

fn stop_voice_capture_session(session: VoiceCaptureSession) {
    let VoiceCaptureSession {
        stop_sender,
        mut worker,
        ..
    } = session;

    let _ = stop_sender.send(());
    if let Some(worker) = worker.take() {
        let _ = worker.join();
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "type")]
enum OverlayCommandPayload {
    #[serde(rename = "start-voice-listening")]
    StartVoiceListening { source: &'static str },
    #[serde(rename = "submit-voice-listening")]
    SubmitVoiceListening,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCursorPosition {
    x: f64,
    y: f64,
    source: &'static str,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeWindowBounds {
    app_name: Option<String>,
    title: Option<String>,
    bundle_identifier: Option<String>,
    owner_process_id: Option<i64>,
    window_number: Option<i64>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveWindowCaptureSnapshot {
    snapshot_id: String,
    started_at_ms: u128,
    window_observed_at_ms: u128,
    capture_started_at_ms: u128,
    completed_at_ms: u128,
    window_to_capture_delay_ms: u128,
    window: NativeWindowBounds,
    metadata: CaptureMetadata,
    screenshot: ScreenshotCapture,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlaySurfaceModeRequest {
    mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopUtilityModeRequest {
    mode: String,
    focus: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TopUtilityModePayload {
    mode: String,
    focused: bool,
}

const TOP_UTILITY_PEEK_WIDTH: f64 = 380.0;
const TOP_UTILITY_PEEK_HEIGHT: f64 = 58.0;
const TOP_UTILITY_EXPANDED_WIDTH: f64 = 400.0;
const TOP_UTILITY_EXPANDED_HEIGHT: f64 = 218.0;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeClickMonitorRequest {
    armed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeClickMonitorStatus {
    armed: bool,
    supported: bool,
    source: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeClickEvent {
    x: f64,
    y: f64,
    button: &'static str,
    timestamp_ms: u128,
    source: &'static str,
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
#[serde(rename_all = "camelCase")]
struct CodexVisionRequest {
    image_base64: String,
    image_format: String,
    prompt: String,
    output_schema: String,
    model: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexVisionResponse {
    raw_answer: String,
    provider_name: String,
    duration_ms: u128,
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
    app_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenCandidate {
    id: String,
    label: String,
    role: String,
    source: &'static str,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccessibilityPayload {
    candidates: Vec<AccessibilityItem>,
    errors: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct AccessibilityItem {
    label: Option<String>,
    name: Option<String>,
    description: Option<String>,
    help: Option<String>,
    role: Option<String>,
    value: Option<String>,
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

#[cfg(target_os = "macos")]
fn macos_accessibility_is_trusted() -> bool {
    use std::os::raw::c_uchar;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> c_uchar;
    }

    unsafe { AXIsProcessTrusted() != 0 }
}

/// Reports whether macOS is currently applying Centre Stage to the default
/// video camera.
///
/// Centre Stage digitally pans, crops, and zooms the camera frame to keep a
/// person centred. That is actively hostile to hand tracking: a raised hand can
/// fall outside the crop entirely, the frame re-frames itself so a still hand
/// appears to move, and the fixed field of view that camera-to-screen mapping
/// assumes stops being fixed. Toki cannot turn it off — the control mode is
/// owned by the user through Control Centre — but it must not stay silent about
/// it, because the failure looks exactly like Toki being broken.
///
/// Returns `None` when the state cannot be determined, which is treated as
/// "nothing to warn about" rather than as a fault.
#[cfg(target_os = "macos")]
fn macos_center_stage_active() -> Option<bool> {
    use std::ffi::c_void;
    use std::os::raw::{c_char, c_uchar};

    #[link(name = "objc", kind = "dylib")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        static AVMediaTypeVideo: *const c_void;
    }

    type SendObj =
        unsafe extern "C" fn(*mut c_void, *mut c_void, *const c_void) -> *mut c_void;
    type SendBool = unsafe extern "C" fn(*mut c_void, *mut c_void) -> c_uchar;
    type SendRespondsTo =
        unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> c_uchar;

    unsafe {
        let class = objc_getClass(c"AVCaptureDevice".as_ptr());
        if class.is_null() {
            return None;
        }

        let send_obj: SendObj = std::mem::transmute(objc_msgSend as *const c_void);
        let device = send_obj(
            class,
            sel_registerName(c"defaultDeviceWithMediaType:".as_ptr()),
            AVMediaTypeVideo,
        );
        if device.is_null() {
            return None;
        }

        // isCenterStageActive arrived in macOS 12.3. Probing the selector first
        // keeps an older system reporting "unknown" instead of trapping.
        let selector = sel_registerName(c"isCenterStageActive".as_ptr());
        let responds: SendRespondsTo = std::mem::transmute(objc_msgSend as *const c_void);
        if responds(
            device,
            sel_registerName(c"respondsToSelector:".as_ptr()),
            selector,
        ) == 0
        {
            return None;
        }

        let send_bool: SendBool = std::mem::transmute(objc_msgSend as *const c_void);
        Some(send_bool(device, selector) != 0)
    }
}

#[cfg(target_os = "macos")]
fn macos_screen_capture_is_trusted() -> bool {
    use std::os::raw::c_uchar;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> c_uchar;
    }

    unsafe { CGPreflightScreenCaptureAccess() != 0 }
}

#[cfg(target_os = "macos")]
fn macos_request_screen_capture_access() -> bool {
    use std::os::raw::c_uchar;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestScreenCaptureAccess() -> c_uchar;
    }

    unsafe { CGRequestScreenCaptureAccess() != 0 }
}

#[cfg(target_os = "macos")]
fn macos_listen_event_is_trusted() -> bool {
    use std::os::raw::c_uchar;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> c_uchar;
    }

    unsafe { CGPreflightListenEventAccess() != 0 }
}

#[cfg(target_os = "macos")]
fn macos_request_listen_event_access() -> bool {
    use std::os::raw::c_uchar;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestListenEventAccess() -> c_uchar;
    }

    unsafe { CGRequestListenEventAccess() != 0 }
}

fn is_right_option_pressed(flags: u64, right_key_state: bool) -> bool {
    // IOLLEvent.h exposes independent device bits for the left and right Alt/Option keys.
    // Keep the key-state check as a second signal for keyboards that omit device flags.
    const NX_DEVICE_RIGHT_ALT_KEY_MASK: u64 = 0x0000_0040;

    right_key_state || flags & NX_DEVICE_RIGHT_ALT_KEY_MASK != 0
}

#[cfg(target_os = "macos")]
mod native_cursor {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const c_void) -> *mut c_void;
        fn CGEventGetLocation(event: *mut c_void) -> CGPoint;
        fn CGEventSourceButtonState(state_id: i32, button: u32) -> bool;
        fn CGEventSourceFlagsState(state_id: i32) -> u64;
        fn CGEventSourceKeyState(state_id: i32, key: u16) -> bool;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    pub fn cursor_position() -> Result<(f64, f64), String> {
        let event = unsafe { CGEventCreate(std::ptr::null()) };

        if event.is_null() {
            return Err("could not create native cursor event".to_string());
        }

        let location = unsafe { CGEventGetLocation(event) };
        unsafe {
            CFRelease(event.cast());
        }

        Ok((location.x, location.y))
    }

    pub fn left_mouse_button_down() -> bool {
        const K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE: i32 = 0;
        const K_CG_MOUSE_BUTTON_LEFT: u32 = 0;

        unsafe {
            CGEventSourceButtonState(
                K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE,
                K_CG_MOUSE_BUTTON_LEFT,
            )
        }
    }

    pub fn right_option_down() -> bool {
        const K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE: i32 = 0;
        const K_VK_RIGHT_OPTION: u16 = 0x3D;

        let flags =
            unsafe { CGEventSourceFlagsState(K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE) };
        let right_key_state = unsafe {
            CGEventSourceKeyState(
                K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE,
                K_VK_RIGHT_OPTION,
            )
        };

        super::is_right_option_pressed(flags, right_key_state)
    }
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
        role: "ocr_text".to_string(),
        source: "ocr",
        x: x.round() as i32,
        y: y.round() as i32,
        width: width.round() as i32,
        height: height.round() as i32,
        metadata: None,
    })
}

#[cfg(target_os = "macos")]
fn normalize_accessibility_candidate(
    item: &AccessibilityItem,
    index: usize,
    request: &ScreenCandidateRequest,
) -> Option<ScreenCandidate> {
    const MIN_CANDIDATE_SIZE: f64 = 4.0;

    let label = [
        item.label.as_deref(),
        item.name.as_deref(),
        item.description.as_deref(),
        item.help.as_deref(),
        item.value.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(normalize_candidate_text)
    .find(|value| !value.is_empty())?;

    if !item.x.is_finite()
        || !item.y.is_finite()
        || !item.width.is_finite()
        || !item.height.is_finite()
        || item.width < MIN_CANDIDATE_SIZE
        || item.height < MIN_CANDIDATE_SIZE
        || item.x < 0.0
        || item.y < 0.0
        || item.x + item.width > request.display_width
        || item.y + item.height > request.display_height
    {
        return None;
    }

    Some(ScreenCandidate {
        id: slug_candidate_id(&label, index).replacen("ocr-", "ax-", 1),
        label,
        role: item
            .role
            .as_deref()
            .map(normalize_candidate_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "accessibility_element".to_string()),
        source: "accessibility",
        x: item.x.round() as i32,
        y: item.y.round() as i32,
        width: item.width.round() as i32,
        height: item.height.round() as i32,
        metadata: Some(serde_json::json!({
            "nativeRole": item.role,
            "nativeName": item.name,
            "nativeDescription": item.description,
            "nativeHelp": item.help,
            "nativeValue": item.value,
        })),
    })
}

#[cfg(target_os = "macos")]
fn accessibility_swift_source() -> &'static str {
    r#"
import AppKit
import ApplicationServices
import Foundation

struct AccessibilityCandidate: Encodable {
  let label: String?
  let name: String?
  let description: String?
  let help: String?
  let role: String?
  let value: String?
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct AccessibilityPayload: Encodable {
  let candidates: [AccessibilityCandidate]
  let errors: [String]
}

let preferredAppName: String
if CommandLine.arguments.count > 1 {
  preferredAppName = CommandLine.arguments[1].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
} else {
  preferredAppName = ""
}

var errors: [String] = []
var candidates: [AccessibilityCandidate] = []
var visitedCount = 0
let maxCandidates = 120
let maxVisited = 800
let maxDepth = 8

func emit() {
  let payload = AccessibilityPayload(candidates: candidates, errors: errors)
  let encoder = JSONEncoder()
  let data = try! encoder.encode(payload)
  print(String(data: data, encoding: .utf8)!)
}

guard AXIsProcessTrusted() else {
  errors.append("macOS Accessibility is not trusted")
  emit()
  exit(0)
}

func normalized(_ value: String?) -> String? {
  guard let value else { return nil }
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? nil : trimmed
}

func copyAttribute(_ element: AXUIElement, _ attribute: CFString) -> AnyObject? {
  var value: CFTypeRef?
  let error = AXUIElementCopyAttributeValue(element, attribute, &value)
  if error != .success {
    return nil
  }
  return value as AnyObject?
}

func stringAttribute(_ element: AXUIElement, _ attribute: CFString) -> String? {
  guard let value = copyAttribute(element, attribute) else {
    return nil
  }

  if let string = value as? String {
    return normalized(string)
  }

  if let number = value as? NSNumber {
    return normalized(number.stringValue)
  }

  return nil
}

func pointAttribute(_ element: AXUIElement, _ attribute: CFString) -> CGPoint? {
  guard let value = copyAttribute(element, attribute) else {
    return nil
  }

  let axValue = value as! AXValue
  guard AXValueGetType(axValue) == .cgPoint else {
    return nil
  }

  var point = CGPoint.zero
  guard AXValueGetValue(axValue, .cgPoint, &point) else {
    return nil
  }
  return point
}

func sizeAttribute(_ element: AXUIElement, _ attribute: CFString) -> CGSize? {
  guard let value = copyAttribute(element, attribute) else {
    return nil
  }

  let axValue = value as! AXValue
  guard AXValueGetType(axValue) == .cgSize else {
    return nil
  }

  var size = CGSize.zero
  guard AXValueGetValue(axValue, .cgSize, &size) else {
    return nil
  }
  return size
}

func elementArrayAttribute(_ element: AXUIElement, _ attribute: CFString) -> [AXUIElement] {
  guard let values = copyAttribute(element, attribute) as? [AXUIElement] else {
    return []
  }
  return values
}

func selectApplication() -> NSRunningApplication? {
  if !preferredAppName.isEmpty {
    let matches = NSWorkspace.shared.runningApplications.filter { app in
      let name = (app.localizedName ?? "").lowercased()
      let bundle = (app.bundleIdentifier ?? "").lowercased()
      return name == preferredAppName ||
        name.contains(preferredAppName) ||
        bundle.contains(preferredAppName)
    }

    if let active = matches.first(where: { $0.isActive }) {
      return active
    }

    if let first = matches.first {
      return first
    }
  }

  return NSWorkspace.shared.frontmostApplication
}

func candidateLabel(
  name: String?,
  description: String?,
  help: String?,
  value: String?
) -> String? {
  for item in [name, description, help, value] {
    if let normalized = normalized(item) {
      return normalized
    }
  }
  return nil
}

func visit(_ element: AXUIElement, depth: Int) {
  if candidates.count >= maxCandidates || visitedCount >= maxVisited || depth > maxDepth {
    return
  }

  visitedCount += 1

  let role = stringAttribute(element, kAXRoleAttribute as CFString)
  let subrole = stringAttribute(element, kAXSubroleAttribute as CFString)
  let name = stringAttribute(element, kAXTitleAttribute as CFString)
  let description = stringAttribute(element, kAXDescriptionAttribute as CFString)
  let help = stringAttribute(element, kAXHelpAttribute as CFString)
  let value = stringAttribute(element, kAXValueAttribute as CFString)
  let position = pointAttribute(element, kAXPositionAttribute as CFString)
  let size = sizeAttribute(element, kAXSizeAttribute as CFString)
  let label = candidateLabel(name: name, description: description, help: help, value: value)

  if
    let position,
    let size,
    let label,
    size.width >= 4,
    size.height >= 4,
    position.x.isFinite,
    position.y.isFinite,
    size.width.isFinite,
    size.height.isFinite
  {
    candidates.append(
      AccessibilityCandidate(
        label: label,
        name: name,
        description: description,
        help: help,
        role: [role, subrole].compactMap { normalized($0) }.joined(separator: " "),
        value: value,
        x: Double(position.x),
        y: Double(position.y),
        width: Double(size.width),
        height: Double(size.height)
      )
    )
  }

  let children = elementArrayAttribute(element, kAXChildrenAttribute as CFString)
  for child in children {
    visit(child, depth: depth + 1)
  }
}

guard let app = selectApplication() else {
  errors.append("no frontmost application was available for native Accessibility")
  emit()
  exit(0)
}

let root = AXUIElementCreateApplication(app.processIdentifier)
let windows = elementArrayAttribute(root, kAXWindowsAttribute as CFString)

if windows.isEmpty {
  visit(root, depth: 0)
} else {
  for window in windows {
    visit(window, depth: 0)
  }
}

if candidates.isEmpty {
  errors.append("native Accessibility returned no labelled candidates for \(app.localizedName ?? "frontmost app")")
}

emit()
"#
}

#[cfg(target_os = "macos")]
fn frontmost_window_bounds_swift_source() -> &'static str {
    r#"
import AppKit
import CoreGraphics
import Foundation

struct WindowBoundsPayload: Encodable {
  let appName: String?
  let title: String?
  let bundleIdentifier: String?
  let ownerProcessId: Int
  let windowNumber: Int
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

let preferredAppName: String
if CommandLine.arguments.count > 1 {
  preferredAppName = CommandLine.arguments[1].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
} else {
  preferredAppName = ""
}

func optionalDoubleArgument(_ index: Int) -> Double? {
  guard CommandLine.arguments.count > index else {
    return nil
  }

  let value = CommandLine.arguments[index].trimmingCharacters(in: .whitespacesAndNewlines)
  return value.isEmpty ? nil : Double(value)
}

let targetPoint: CGPoint?
if let x = optionalDoubleArgument(2), let y = optionalDoubleArgument(3) {
  targetPoint = CGPoint(x: x, y: y)
} else {
  targetPoint = nil
}

func normalized(_ value: String?) -> String? {
  guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
    return nil
  }
  return value
}

func doubleValue(_ value: Any?) -> Double? {
  if let number = value as? NSNumber {
    return number.doubleValue
  }
  if let double = value as? Double {
    return double
  }
  if let int = value as? Int {
    return Double(int)
  }
  return nil
}

func intValue(_ value: Any?) -> Int? {
  if let number = value as? NSNumber {
    return number.intValue
  }
  if let int = value as? Int {
    return int
  }
  if let int32 = value as? Int32 {
    return Int(int32)
  }
  return nil
}

func isIgnoredOwnerName(_ value: String?) -> Bool {
  let normalized = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

  return normalized == "toki" ||
    normalized == "touchpilot" ||
    normalized == "control center" ||
    normalized == "notification center" ||
    normalized == "dock" ||
    normalized == "window server"
}

func selectApplication() -> NSRunningApplication? {
  if !preferredAppName.isEmpty {
    let matches = NSWorkspace.shared.runningApplications.filter { app in
      let name = (app.localizedName ?? "").lowercased()
      let bundle = (app.bundleIdentifier ?? "").lowercased()
      return name == preferredAppName ||
        name.contains(preferredAppName) ||
        bundle.contains(preferredAppName)
    }

    if let active = matches.first(where: { $0.isActive }) {
      return active
    }

    if let first = matches.first {
      return first
    }
  }

  if let frontmost = NSWorkspace.shared.frontmostApplication,
     !isIgnoredOwnerName(frontmost.localizedName),
     !isIgnoredOwnerName(frontmost.bundleIdentifier) {
    return frontmost
  }

  return nil
}

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowInfo = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
  fputs("native macOS window list was unavailable\n", stderr)
  exit(4)
}

let selectedApp = selectApplication()
let targetPid = selectedApp.map { Int($0.processIdentifier) }
let targetApp = targetPid.flatMap { pid in
  NSWorkspace.shared.runningApplications.first { Int($0.processIdentifier) == pid }
}

func makeWindowPayload(_ info: [String: Any]) -> WindowBoundsPayload? {
  guard
    let ownerPid = intValue(info[kCGWindowOwnerPID as String]),
    let windowNumber = intValue(info[kCGWindowNumber as String]),
    let ownerName = normalized(info[kCGWindowOwnerName as String] as? String),
    !isIgnoredOwnerName(ownerName),
    let layer = intValue(info[kCGWindowLayer as String]),
    layer == 0,
    let bounds = info[kCGWindowBounds as String] as? [String: Any],
    let x = doubleValue(bounds["X"]),
    let y = doubleValue(bounds["Y"]),
    let width = doubleValue(bounds["Width"]),
    let height = doubleValue(bounds["Height"]),
    width >= 80,
    height >= 80
  else {
    return nil
  }

  let title = normalized(info[kCGWindowName as String] as? String)

  // Ignore tiny helper panels and non-content utility windows when a main window exists.
  guard
    title != "Item-0",
    title != "StatusItem",
    title != "Menubar"
  else {
    return nil
  }

  let app = NSWorkspace.shared.runningApplications.first { Int($0.processIdentifier) == ownerPid }

  return WindowBoundsPayload(
    appName: app?.localizedName ?? ownerName,
    title: title,
    bundleIdentifier: app?.bundleIdentifier,
    ownerProcessId: ownerPid,
    windowNumber: windowNumber,
    x: x,
    y: y,
    width: width,
    height: height
  )
}

func contains(_ window: WindowBoundsPayload, point: CGPoint) -> Bool {
  return point.x >= window.x &&
    point.x <= window.x + window.width &&
    point.y >= window.y &&
    point.y <= window.y + window.height
}

// CGWindowListCopyWindowInfo preserves front-to-back z-order. Keep that order:
// choosing the largest window can silently replace the visible app under a Toki overlay.
let allWindows = windowInfo.compactMap { info -> WindowBoundsPayload? in
  makeWindowPayload(info)
}
let selectedAppWindows = allWindows.filter { window in
  guard let targetPid else {
    return false
  }
  return window.ownerProcessId == targetPid
}
let pointMatches = targetPoint.map { point in
  allWindows.filter { contains($0, point: point) }
} ?? []

let window: WindowBoundsPayload?
if !preferredAppName.isEmpty {
  window = selectedAppWindows.first ?? allWindows.first
} else if targetPoint != nil {
  window = pointMatches.first ?? selectedAppWindows.first ?? allWindows.first
} else {
  window = selectedAppWindows.first ?? allWindows.first
}

guard let window else {
    let appName = targetApp?.localizedName ?? "unknown app"
    fputs("no usable content window was available; selected application was \(appName)\n", stderr)
    exit(4)
  }

let data = try! JSONEncoder().encode(window)
print(String(data: data, encoding: .utf8)!)
"#
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn frontmost_window_bounds(
    app_name: Option<String>,
    point_x: Option<f64>,
    point_y: Option<f64>,
) -> Result<NativeWindowBounds, String> {
    let temp_root = std::env::temp_dir();
    let stamp = now_ms();
    let script_path = temp_root.join(format!("toki-window-bounds-{stamp}.swift"));

    let output = fs::write(&script_path, frontmost_window_bounds_swift_source())
        .map_err(|error| error.to_string())
        .and_then(|_| {
            Command::new("/usr/bin/swift")
                .arg(&script_path)
                .arg(app_name.as_deref().unwrap_or(""))
                .arg(point_x.map(|value| value.to_string()).unwrap_or_default())
                .arg(point_y.map(|value| value.to_string()).unwrap_or_default())
                .output()
                .map_err(|error| error.to_string())
        });

    let _ = fs::remove_file(&script_path);

    let output = output.map_err(|_| "could not run native macOS window probe".to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("native macOS window probe exited with {}", output.status)
        } else {
            stderr
        });
    }

    serde_json::from_slice::<NativeWindowBounds>(&output.stdout).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn screen_capture_access_status() -> Result<bool, String> {
    Ok(macos_screen_capture_is_trusted())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn camera_reframing_status() -> Result<Option<bool>, String> {
    Ok(macos_center_stage_active())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn request_screen_capture_access() -> Result<bool, String> {
    if macos_screen_capture_is_trusted() {
        return Ok(true);
    }

    Ok(macos_request_screen_capture_access())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn frontmost_window_bounds(
    _app_name: Option<String>,
    _point_x: Option<f64>,
    _point_y: Option<f64>,
) -> Result<NativeWindowBounds, String> {
    Err("active window crop is only implemented on macOS right now".to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn screen_capture_access_status() -> Result<bool, String> {
    Ok(true)
}

/// Centre Stage is a macOS camera feature. Other platforms report "unknown",
/// which the caller treats as nothing to warn about.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn camera_reframing_status() -> Result<Option<bool>, String> {
    Ok(None)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn request_screen_capture_access() -> Result<bool, String> {
    Ok(true)
}

#[cfg(target_os = "macos")]
fn collect_macos_accessibility_candidates(
    request: &ScreenCandidateRequest,
) -> ScreenCandidateResult {
    if !macos_accessibility_is_trusted() {
        return ScreenCandidateResult {
            candidates: Vec::new(),
            candidate_source: "macos-accessibility",
            candidate_error: Some(
                "macOS Accessibility is not trusted; skipped native UI candidates without opening System Settings."
                    .to_string(),
            ),
        };
    }

    let temp_root = std::env::temp_dir();
    let stamp = now_ms();
    let script_path = temp_root.join(format!("toki-native-ax-{stamp}.swift"));

    let output = fs::write(&script_path, accessibility_swift_source())
        .map_err(|error| error.to_string())
        .and_then(|_| {
            Command::new("/usr/bin/swift")
                .arg(&script_path)
                .arg(request.app_name.as_deref().unwrap_or(""))
                .output()
                .map_err(|error| error.to_string())
        });

    let _ = fs::remove_file(&script_path);

    let Ok(output) = output else {
        return ScreenCandidateResult {
            candidates: Vec::new(),
            candidate_source: "macos-accessibility",
            candidate_error: Some("could not run native macOS Accessibility probe".to_string()),
        };
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        return ScreenCandidateResult {
            candidates: Vec::new(),
            candidate_source: "macos-accessibility",
            candidate_error: Some(if stderr.is_empty() {
                format!(
                    "native macOS Accessibility probe exited with {}",
                    output.status
                )
            } else {
                stderr
            }),
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let payload = match serde_json::from_str::<AccessibilityPayload>(&stdout) {
        Ok(payload) => payload,
        Err(error) => {
            return ScreenCandidateResult {
                candidates: Vec::new(),
                candidate_source: "macos-accessibility",
                candidate_error: Some(error.to_string()),
            };
        }
    };
    let candidates = payload
        .candidates
        .iter()
        .enumerate()
        .filter_map(|(index, item)| normalize_accessibility_candidate(item, index, request))
        .collect::<Vec<_>>();
    let error = payload
        .errors
        .unwrap_or_default()
        .into_iter()
        .filter(|error| !normalize_candidate_text(error).is_empty())
        .collect::<Vec<_>>()
        .join("; ");

    ScreenCandidateResult {
        candidate_error: if candidates.is_empty() && !error.is_empty() {
            Some(error)
        } else if candidates.is_empty() {
            Some("macOS Accessibility returned no candidates".to_string())
        } else {
            None
        },
        candidates,
        candidate_source: "macos-accessibility",
    }
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

#[cfg(target_os = "macos")]
fn prepare_macos_overlay_on_main_thread<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let overlay = window.clone();
    window
        .run_on_main_thread(move || match macos_overlay::prepare(&overlay) {
            Ok(status) if status.ready => {
                eprintln!("toki macOS overlay ready on active Space");
            }
            Ok(status) => {
                eprintln!(
                    "toki macOS overlay contract incomplete: visible={}, on_active_space={}, flags_ready={}",
                    status.visible, status.on_active_space, status.contract_ready
                );
            }
            Err(error) => eprintln!("failed to prepare Toki macOS overlay: {error}"),
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn prepare_macos_top_utility_on_main_thread<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    ignores_mouse_events: bool,
) -> Result<(), String> {
    let utility = window.clone();
    window
        .run_on_main_thread(move || {
            match macos_overlay::prepare_auxiliary(&utility, ignores_mouse_events) {
                Ok(status) if status.contract_ready => {
                    eprintln!("toki macOS top utility ready above fullscreen content");
                }
                Ok(status) => {
                    eprintln!(
                        "toki macOS top utility contract incomplete: visible={}, on_active_space={}, flags_ready={}",
                        status.visible, status.on_active_space, status.contract_ready
                    );
                }
                Err(error) => eprintln!("failed to prepare Toki macOS top utility: {error}"),
            }
        })
        .map_err(|error| error.to_string())
}

fn show_overlay_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> Result<(), String> {
    window.set_title(" ").map_err(|error| error.to_string())?;
    window
        .set_decorations(false)
        .map_err(|error| error.to_string())?;
    fit_overlay_to_monitor(window);
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|error| error.to_string())?;
    window
        .set_focusable(false)
        .map_err(|error| error.to_string())?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())?;
    window
        .set_visible_on_all_workspaces(true)
        .map_err(|error| error.to_string())?;
    window
        .set_shadow(false)
        .map_err(|error| error.to_string())?;

    #[cfg(windows)]
    prepare_windows_utility_window(window, true);

    #[cfg(not(target_os = "macos"))]
    window.show().map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    prepare_macos_overlay_on_main_thread(window)?;

    Ok(())
}

fn position_top_utility<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    logical_width: f64,
    logical_height: f64,
) -> Result<(), String> {
    window
        .set_size(Size::Logical(LogicalSize::new(
            logical_width,
            logical_height,
        )))
        .map_err(|error| error.to_string())?;

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return Ok(());
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let scale_factor = monitor.scale_factor();
    let window_width = (logical_width * scale_factor).round() as i32;

    #[cfg(target_os = "macos")]
    let top_gap = 0;
    #[cfg(not(target_os = "macos"))]
    let top_gap = (8.0 * scale_factor).round() as i32;

    let x = monitor_position.x + (monitor_size.width as i32 - window_width) / 2;
    let y = monitor_position.y + top_gap;

    window
        .set_position(Position::Physical(PhysicalPosition { x, y }))
        .map_err(|error| error.to_string())
}

fn apply_top_utility_mode<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    mode: &str,
    focus: bool,
) -> Result<(), String> {
    let payload = TopUtilityModePayload {
        mode: mode.to_string(),
        focused: mode == "expanded" && focus,
    };

    match mode {
        "hidden" => {
            window
                .emit("toki://top-utility-mode", payload.clone())
                .map_err(|error| error.to_string())?;
            let _ = window
                .app_handle()
                .emit_to("overlay", "toki://top-utility-mode", payload);
            return window.hide().map_err(|error| error.to_string());
        }
        "peek" => {
            position_top_utility(window, TOP_UTILITY_PEEK_WIDTH, TOP_UTILITY_PEEK_HEIGHT)?;
            window
                .set_focusable(false)
                .map_err(|error| error.to_string())?;
            window
                .set_ignore_cursor_events(true)
                .map_err(|error| error.to_string())?;
        }
        "expanded" => {
            position_top_utility(
                window,
                TOP_UTILITY_EXPANDED_WIDTH,
                TOP_UTILITY_EXPANDED_HEIGHT,
            )?;
            window
                .set_focusable(true)
                .map_err(|error| error.to_string())?;
            window
                .set_ignore_cursor_events(false)
                .map_err(|error| error.to_string())?;
        }
        _ => return Err(format!("unsupported top utility mode: {mode}")),
    }

    window.show().map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    prepare_macos_top_utility_on_main_thread(window, mode == "peek")?;

    window
        .emit("toki://top-utility-mode", payload.clone())
        .map_err(|error| error.to_string())?;
    let _ = window
        .app_handle()
        .emit_to("overlay", "toki://top-utility-mode", payload);

    if mode == "expanded" && focus {
        window.set_focus().map_err(|error| error.to_string())?;
    }

    Ok(())
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

fn capture_screenshot_with_permission_context() -> Result<ScreenshotCapture, String> {
    #[cfg(target_os = "macos")]
    let preflight_trusted = macos_screen_capture_is_trusted();

    #[cfg(target_os = "macos")]
    require_macos_screen_capture_trust(preflight_trusted)?;

    capture_primary_display().map_err(|error| error.to_string())
}

fn metadata_from_screenshot(screenshot: &ScreenshotCapture) -> CaptureMetadata {
    CaptureMetadata {
        source: screenshot.source.clone(),
        display: screenshot.display.clone(),
        cursor: screenshot.cursor.clone(),
        active_window: screenshot.active_window.clone(),
        captured_at: screenshot.captured_at.clone(),
    }
}

fn require_macos_screen_capture_trust(preflight_trusted: bool) -> Result<(), String> {
    if preflight_trusted {
        return Ok(());
    }

    Err(
        "Screen Recording is not trusted for this Toki build. Grant Screen Recording permission to Toki, quit and relaunch it, then try again."
            .to_string(),
    )
}

#[tauri::command]
fn capture_active_window_snapshot(
    app_name: Option<String>,
    point_x: Option<f64>,
    point_y: Option<f64>,
) -> Result<ActiveWindowCaptureSnapshot, String> {
    let started_at_ms = now_ms();
    let snapshot_id = format!("active-window-{started_at_ms}");
    let window = frontmost_window_bounds(app_name, point_x, point_y)?;
    let window_observed_at_ms = now_ms();
    let capture_started_at_ms = now_ms();
    let mut screenshot = capture_screenshot_with_permission_context()?;

    screenshot.active_window = Some(ActiveWindowContext {
        title: window.title.clone(),
        app_name: window.app_name.clone(),
    });

    let metadata = metadata_from_screenshot(&screenshot);
    let completed_at_ms = now_ms();

    Ok(ActiveWindowCaptureSnapshot {
        snapshot_id,
        started_at_ms,
        window_observed_at_ms,
        capture_started_at_ms,
        completed_at_ms,
        window_to_capture_delay_ms: capture_started_at_ms.saturating_sub(window_observed_at_ms),
        window,
        metadata,
        screenshot,
    })
}

#[tauri::command]
fn capture_screenshot() -> Result<ScreenshotCapture, String> {
    if auto_smoke_logs_enabled() {
        eprintln!("toki auto real smoke: capture_screenshot start");
    }

    let result = capture_screenshot_with_permission_context();

    if auto_smoke_logs_enabled() {
        eprintln!("toki auto real smoke: capture_screenshot done");
    }

    result
}

/// Absolute path to a guidance CLI, for development only.
///
/// Deliberately an environment variable rather than a stored setting: a
/// Finder-launched app inherits no environment, so this cannot be switched on
/// by an ordinary user, and there is no UI anyone could be talked into using.
const DEVELOPER_CLI_BIN_ENV: &str = "TOKI_DEVELOPER_CLI_BIN";

/// Absolute path to a local Whisper build, for development only. Same rules as
/// `DEVELOPER_CLI_BIN_ENV`.
const WHISPER_BIN_ENV: &str = "WHISPER_CPP_BIN";

/// Absolute path to the Whisper model file. Resolved the same way as the binary
/// so the feature is configured entirely explicitly or not at all.
const WHISPER_MODEL_ENV: &str = "WHISPER_CPP_MODEL";

/// How many transitions the local history keeps.
///
/// A transition is written roughly per inference frame while gestures are
/// running, so 160 covered about three seconds — short enough that a
/// thirty-second recording arrived containing only its own tail, and the event
/// being investigated had already been discarded. Sized here for about half a
/// minute of continuous gesture activity.
const TOKI_DEBUG_HISTORY_LIMIT: usize = 2_000;
const TOKI_DEBUG_SNAPSHOT_MAX_BYTES: usize = 5_000_000;
const TOKI_DEBUG_CAPTURE_MAX_BYTES: usize = 16_000_000;

fn set_private_directory_permissions(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn set_private_file_permissions(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

/// Where diagnostics would live, without bringing it into existence.
///
/// Asking whether diagnostics exist must not be what creates them. Only an
/// actual write should, so that a user who never enables diagnostics never
/// acquires the folder at all.
fn toki_debug_export_directory_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve Toki app data: {error}"))?
        .join("diagnostics"))
}

fn toki_debug_export_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = toki_debug_export_directory_path(app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create Toki diagnostics directory: {error}"))?;
    set_private_directory_permissions(&directory)?;
    Ok(directory)
}

fn write_private_file_atomically(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "diagnostics path has no parent directory".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("diagnostics");
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", now_ms()));

    fs::write(&temp_path, bytes)
        .map_err(|error| format!("failed to stage Toki diagnostics: {error}"))?;
    set_private_file_permissions(&temp_path)?;

    if let Err(first_error) = fs::rename(&temp_path, path) {
        if path.exists() {
            fs::remove_file(path).map_err(|error| {
                format!("failed to replace Toki diagnostics after {first_error}: {error}")
            })?;
            fs::rename(&temp_path, path).map_err(|error| {
                format!("failed to publish Toki diagnostics after {first_error}: {error}")
            })?;
        } else {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("failed to publish Toki diagnostics: {first_error}"));
        }
    }

    set_private_file_permissions(path)?;
    Ok(())
}

fn append_toki_debug_history(
    history_path: &std::path::Path,
    entries: &[serde_json::Value],
) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }

    let mut lines = fs::read_to_string(history_path)
        .unwrap_or_default()
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    for entry in entries {
        lines.push(
            serde_json::to_string(entry)
                .map_err(|error| format!("failed to encode Toki diagnostics history: {error}"))?,
        );
    }

    if lines.len() > TOKI_DEBUG_HISTORY_LIMIT {
        lines = lines.split_off(lines.len() - TOKI_DEBUG_HISTORY_LIMIT);
    }

    let mut body = lines.join("\n");
    body.push('\n');
    write_private_file_atomically(history_path, body.as_bytes())
}

fn toki_debug_capture_path(directory: &std::path::Path) -> Option<PathBuf> {
    ["latest-capture.png", "latest-capture.jpg"]
        .into_iter()
        .map(|name| directory.join(name))
        .find(|path| path.is_file())
}

fn file_modified_ms(path: &std::path::Path) -> Option<u128> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis())
}

fn build_toki_debug_export_status(app: &tauri::AppHandle) -> Result<TokiDebugExportStatus, String> {
    let directory = toki_debug_export_directory_path(app)?;
    let snapshot_path = directory.join("latest.json");
    let history_path = directory.join("history.ndjson");
    let capture_path = toki_debug_capture_path(&directory);

    Ok(TokiDebugExportStatus {
        directory: directory.display().to_string(),
        snapshot_path: snapshot_path.display().to_string(),
        history_path: history_path.display().to_string(),
        capture_path: capture_path.map(|path| path.display().to_string()),
        snapshot_exists: snapshot_path.is_file(),
        history_exists: history_path.is_file(),
        last_snapshot_modified_ms: file_modified_ms(&snapshot_path),
    })
}

#[tauri::command]
fn toki_debug_export_status(app: tauri::AppHandle) -> Result<TokiDebugExportStatus, String> {
    build_toki_debug_export_status(&app)
}

/// Delete everything diagnostics has collected.
///
/// Switching diagnostics off withdraws consent, and files gathered under the
/// old setting should not outlive it. Removing a directory that is already
/// absent is success, not an error, so turning the setting off when it was
/// never on is silent rather than noisy.
#[tauri::command]
fn clear_toki_debug_export(app: tauri::AppHandle) -> Result<TokiDebugExportStatus, String> {
    let directory = toki_debug_export_directory_path(&app)?;

    if directory.exists() {
        fs::remove_dir_all(&directory)
            .map_err(|error| format!("failed to clear Toki diagnostics: {error}"))?;
    }

    build_toki_debug_export_status(&app)
}

#[tauri::command]
fn write_toki_debug_export(
    app: tauri::AppHandle,
    request: TokiDebugExportRequest,
) -> Result<TokiDebugExportStatus, String> {
    let directory = toki_debug_export_directory(&app)?;
    let snapshot_path = directory.join("latest.json");
    let history_path = directory.join("history.ndjson");
    let snapshot_bytes = serde_json::to_vec_pretty(&request.snapshot)
        .map_err(|error| format!("failed to encode Toki diagnostics: {error}"))?;

    if snapshot_bytes.len() > TOKI_DEBUG_SNAPSHOT_MAX_BYTES {
        return Err("Toki diagnostics snapshot exceeded the 5 MB local limit".to_string());
    }

    write_private_file_atomically(&snapshot_path, &snapshot_bytes)?;
    append_toki_debug_history(&history_path, &request.history_entries)?;

    if let Some(capture) = request.capture {
        let extension = match capture.format.as_str() {
            "png" => "png",
            "jpeg" => "jpg",
            other => {
                return Err(format!(
                    "unsupported Toki diagnostics image format: {other}"
                ))
            }
        };
        let capture_bytes = general_purpose::STANDARD
            .decode(&capture.image_base64)
            .map_err(|error| format!("invalid Toki diagnostics image payload: {error}"))?;

        if capture_bytes.is_empty() || capture_bytes.len() > TOKI_DEBUG_CAPTURE_MAX_BYTES {
            return Err("Toki diagnostics image payload size is invalid".to_string());
        }
        if capture.byte_length != capture_bytes.len() {
            return Err(format!(
                "Toki diagnostics image length mismatch for capture at {}",
                capture.captured_at
            ));
        }

        let capture_path = directory.join(format!("latest-capture.{extension}"));
        write_private_file_atomically(&capture_path, &capture_bytes)?;
        let stale_capture_path = directory.join(if extension == "png" {
            "latest-capture.jpg"
        } else {
            "latest-capture.png"
        });
        if stale_capture_path.is_file() {
            let _ = fs::remove_file(stale_capture_path);
        }
    }

    build_toki_debug_export_status(&app)
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
        let accessibility_result = collect_macos_accessibility_candidates(&request);
        let vision_result = collect_macos_vision_candidates(request);
        let result = if accessibility_result.candidates.is_empty() {
            if vision_result.candidates.is_empty() {
                ScreenCandidateResult {
                    candidates: Vec::new(),
                    candidate_source: "macos-vision-ocr",
                    candidate_error: Some(
                        [
                            accessibility_result.candidate_error,
                            vision_result.candidate_error,
                        ]
                        .into_iter()
                        .flatten()
                        .collect::<Vec<_>>()
                        .join(" | "),
                    ),
                }
            } else {
                let candidate_error = [
                    accessibility_result.candidate_error,
                    vision_result.candidate_error,
                ]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" | ");

                ScreenCandidateResult {
                    candidates: vision_result.candidates,
                    candidate_source: "macos-vision-ocr",
                    candidate_error: if candidate_error.is_empty() {
                        None
                    } else {
                        Some(candidate_error)
                    },
                }
            }
        } else {
            let has_vision_candidates = !vision_result.candidates.is_empty();
            let mut candidates = accessibility_result.candidates;
            candidates.extend(vision_result.candidates);

            ScreenCandidateResult {
                candidates,
                candidate_source: if has_vision_candidates {
                    "fused"
                } else {
                    "macos-accessibility"
                },
                candidate_error: vision_result.candidate_error,
            }
        };

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

    apply_top_utility_mode(&window, "hidden", false)
}

#[tauri::command]
fn set_top_utility_mode(
    app: tauri::AppHandle,
    request: TopUtilityModeRequest,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window("settings") else {
        return Err("settings window not found".to_string());
    };

    apply_top_utility_mode(&window, &request.mode, request.focus.unwrap_or(false))
}

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = apply_top_utility_mode(&window, "expanded", true);
    }
}

fn emit_overlay_command(app: &tauri::AppHandle, payload: OverlayCommandPayload) {
    if let Err(error) = app.emit_to("overlay", "toki://overlay-command", payload) {
        eprintln!("failed to emit overlay command: {error}");
    }
}

#[cfg(target_os = "macos")]
fn start_native_voice_key_monitor(app: tauri::AppHandle) {
    if !macos_listen_event_is_trusted() {
        eprintln!(
            "toki voice shortcut: Input Monitoring is missing; requesting access for Right Option hold-to-talk"
        );
        if !macos_request_listen_event_access() {
            eprintln!(
                "toki voice shortcut: Input Monitoring remains unavailable; enable Toki in Privacy & Security > Input Monitoring, then relaunch"
            );
        }
    }

    thread::spawn(move || {
        let mut was_down = false;

        loop {
            thread::sleep(Duration::from_millis(NATIVE_VOICE_KEY_POLL_MS));

            let is_down = native_cursor::right_option_down();

            if is_down && !was_down {
                if !VOICE_SHORTCUT_HELD.swap(true, Ordering::SeqCst) {
                    eprintln!("toki voice shortcut: Right Option pressed");
                    emit_overlay_command(
                        &app,
                        OverlayCommandPayload::StartVoiceListening { source: "hotkey" },
                    );
                }
            }

            if !is_down && was_down {
                VOICE_SHORTCUT_HELD.store(false, Ordering::SeqCst);
                eprintln!("toki voice shortcut: Right Option released");
                emit_overlay_command(&app, OverlayCommandPayload::SubmitVoiceListening);
            }

            was_down = is_down;
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn start_native_voice_key_monitor(_app: tauri::AppHandle) {}

fn emit_native_click(app: &tauri::AppHandle, payload: NativeClickEvent) {
    if let Err(error) = app.emit_to("overlay", "toki://native-click", payload) {
        eprintln!("failed to emit native click: {error}");
    }
}

fn emit_native_cursor(app: &tauri::AppHandle, payload: NativeCursorPosition) {
    if let Err(error) = app.emit_to("overlay", "toki://native-cursor", payload) {
        eprintln!("failed to emit native cursor: {error}");
    }
}

#[cfg(target_os = "macos")]
fn start_native_cursor_monitor(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut last_position: Option<(f64, f64)> = None;

        loop {
            thread::sleep(Duration::from_millis(NATIVE_CURSOR_POLL_MS));

            let Ok((x, y)) = native_cursor::cursor_position() else {
                continue;
            };

            let should_emit = match last_position {
                None => true,
                Some((last_x, last_y)) => (x - last_x).abs() >= 1.5 || (y - last_y).abs() >= 1.5,
            };

            if !should_emit {
                continue;
            }

            last_position = Some((x, y));

            emit_native_cursor(
                &app,
                NativeCursorPosition {
                    x,
                    y,
                    source: "native-macos-coregraphics-stream",
                },
            );
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn start_native_cursor_monitor(_app: tauri::AppHandle) {}

#[cfg(target_os = "macos")]
fn start_native_click_monitor(app: tauri::AppHandle, monitor_state: Arc<NativeClickMonitorState>) {
    thread::spawn(move || {
        let mut was_down = false;

        loop {
            thread::sleep(Duration::from_millis(NATIVE_CLICK_POLL_MS));

            if !monitor_state.armed.load(Ordering::SeqCst) {
                was_down = false;
                continue;
            }

            let is_down = native_cursor::left_mouse_button_down();

            if is_down && !was_down {
                match native_cursor::cursor_position() {
                    Ok((x, y)) => emit_native_click(
                        &app,
                        NativeClickEvent {
                            x,
                            y,
                            button: "left",
                            timestamp_ms: now_ms(),
                            source: "native-macos-coregraphics",
                        },
                    ),
                    Err(error) => eprintln!("native click monitor cursor error: {error}"),
                }
            }

            was_down = is_down;
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn start_native_click_monitor(
    _app: tauri::AppHandle,
    _monitor_state: Arc<NativeClickMonitorState>,
) {
}

#[tauri::command]
fn native_click_monitor_set_armed(
    request: NativeClickMonitorRequest,
    monitor_state: State<'_, Arc<NativeClickMonitorState>>,
) -> NativeClickMonitorStatus {
    #[cfg(target_os = "macos")]
    {
        monitor_state.armed.store(request.armed, Ordering::SeqCst);

        return NativeClickMonitorStatus {
            armed: request.armed,
            supported: true,
            source: "native-macos-coregraphics",
        };
    }

    #[cfg(not(target_os = "macos"))]
    {
        monitor_state.armed.store(false, Ordering::SeqCst);

        NativeClickMonitorStatus {
            armed: false,
            supported: false,
            source: "unsupported",
        }
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
    if let Some(session) = store.active_session.take() {
        stop_voice_capture_session(session);
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

#[tauri::command]
fn native_voice_capture_reset(store: State<'_, Mutex<VoiceCaptureStore>>) -> Result<(), String> {
    let mut store = store
        .lock()
        .map_err(|_| "voice capture state is poisoned".to_string())?;

    if let Some(session) = store.active_session.take() {
        stop_voice_capture_session(session);
    }

    Ok(())
}

/// Resolve a helper executable that an operator has deliberately named.
///
/// Toki used to *search* for its helper binaries: the guidance CLI in
/// `~/.local/bin`, `~/.npm-global/bin`, `/opt/homebrew/bin` and `PATH`; the
/// local Whisper build in `~/tools/whisper.cpp` and `PATH`. Those locations are
/// writable without sudo, and macOS attributes permissions to the responsible
/// process -- so anything Toki launched ran inside Toki's camera, microphone,
/// and screen-recording grants. Any program running as the user could drop a
/// file with the right name into one of them and have its own code read the
/// screen, a privilege it could never have obtained directly.
///
/// Searching is the vulnerability, not the specific directories. Renaming the
/// binary changes nothing, and validating whatever a search turned up is not a
/// fix either -- these tools ship as unsigned scripts, so a signature
/// requirement would reject the real one and teach us to relax the check.
///
/// So nothing is searched for. The operator names an absolute path or the
/// feature does not exist. A GUI application launched from Finder inherits no
/// environment, so these variables are absent for every ordinary user and both
/// paths are unreachable by construction -- the same mechanism that made the
/// old `OPENAI_API_KEY` lookup fail for everyone, used deliberately this time.
fn resolve_operator_binary(env_name: &str, purpose: &str) -> Result<PathBuf, String> {
    // Stored setting first, environment second. Requiring the environment alone
    // repeated the mistake this codebase already fixed once for the API key: a
    // GUI application launched from Finder inherits no environment, so a value
    // that works from a terminal is simply absent the rest of the time. The
    // security property that matters is that nothing is *searched for* -- an
    // operator naming a path in Preferences is as deliberate as exporting it.
    let configured = read_stored_setting(env_name)
        .or_else(|| std::env::var(env_name).ok())
        .ok_or_else(|| {
            format!(
                "{purpose} is not configured. Set a path in Toki's Preferences, \
                 or export {env_name} and launch Toki from a terminal."
            )
        })?;

    let candidate = PathBuf::from(configured.trim());

    // A relative path resolves against Toki's working directory, which
    // reintroduces exactly the ambiguity this function exists to remove.
    if !candidate.is_absolute() {
        return Err(format!(
            "{env_name} must be an absolute path, not {}",
            candidate.display()
        ));
    }

    if !candidate.is_file() {
        return Err(format!(
            "{env_name} does not point at a file: {}",
            candidate.display()
        ));
    }

    Ok(candidate)
}

fn find_developer_cli_binary() -> Result<PathBuf, String> {
    resolve_operator_binary(DEVELOPER_CLI_BIN_ENV, "CLI guidance")
}

fn truncate_process_detail(value: &str) -> String {
    const LIMIT: usize = 1_200;
    let value = value.trim();
    if value.chars().count() <= LIMIT {
        value.to_string()
    } else {
        let truncated: String = value.chars().take(LIMIT).collect();
        format!("{truncated}...")
    }
}

fn run_command_with_timeout(
    command: &mut Command,
    timeout: Duration,
    stdout_path: &PathBuf,
    stderr_path: &PathBuf,
) -> Result<(ExitStatus, String, String), String> {
    let stdout_file = fs::File::create(stdout_path)
        .map_err(|error| format!("failed to capture CLI output: {error}"))?;
    let stderr_file = fs::File::create(stderr_path)
        .map_err(|error| format!("failed to capture CLI errors: {error}"))?;
    command
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        // Closed, not inherited. A CLI that reads a prompt from standard input
        // waits for one when it is handed an open pipe -- three seconds of it,
        // on every guidance request, before giving up and carrying on. Nothing
        // is ever sent this way; the prompt is an argument.
        .stdin(Stdio::null());

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start the guidance CLI: {error}"))?;
    let started = Instant::now();

    let status = loop {
        match child
            .try_wait()
            .map_err(|error| format!("failed while waiting for Codex CLI: {error}"))?
        {
            Some(status) => break status,
            None if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Codex vision timed out after {}s.",
                    timeout.as_secs()
                ));
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    };

    let stdout = fs::read_to_string(stdout_path)
        .map_err(|error| format!("failed to read Codex response: {error}"))?;
    let stderr = fs::read_to_string(stderr_path)
        .map_err(|error| format!("failed to read Codex diagnostics: {error}"))?;
    Ok((status, stdout, stderr))
}

fn run_codex_vision_request(request: CodexVisionRequest) -> Result<CodexVisionResponse, String> {
    if !matches!(request.image_format.as_str(), "png" | "jpeg") {
        return Err("Codex vision image format must be png or jpeg.".to_string());
    }
    if request.prompt.trim().is_empty() {
        return Err("Codex vision prompt is empty.".to_string());
    }
    if request.output_schema.trim().is_empty() {
        return Err("Codex vision output schema is empty.".to_string());
    }

    let image_bytes = general_purpose::STANDARD
        .decode(&request.image_base64)
        .map_err(|error| format!("Codex vision image payload is not valid base64: {error}"))?;
    if image_bytes.is_empty() || image_bytes.len() > 12_000_000 {
        return Err("Codex vision image payload size is invalid.".to_string());
    }

    let request_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let work_dir = std::env::temp_dir().join(format!("toki-codex-guidance-{request_id}"));
    fs::create_dir(&work_dir)
        .map_err(|error| format!("failed to create Codex guidance workspace: {error}"))?;

    let image_extension = if request.image_format == "jpeg" {
        "jpg"
    } else {
        "png"
    };
    let image_path = work_dir.join(format!("screen.{image_extension}"));
    let stdout_path = work_dir.join("stdout.txt");
    let stderr_path = work_dir.join("stderr.txt");

    let result = (|| {
        fs::write(&image_path, image_bytes)
            .map_err(|error| format!("failed to write Codex screenshot: {error}"))?;
        let cli_bin = find_developer_cli_binary()?;
        let timeout =
            Duration::from_millis(request.timeout_ms.unwrap_or(25_000).clamp(5_000, 60_000));

        // The CLI has no flag for attaching an image and none for constraining
        // the reply to a schema, so the prompt carries both: the image as a
        // path for the CLI's own file-reading tool to open, and the schema
        // inline. That is also how the hosted provider does it, for the same
        // reason -- an answer the client cannot parse is worth nothing.
        let prompt = format!(
            "Read the image at {}.\n\n{}\n\nReturn only a JSON object matching \
             this schema. No prose, no explanation, no markdown fence.\n\n{}",
            image_path.display(),
            request.prompt.trim(),
            request.output_schema.trim(),
        );

        // Argument order matters here, and not for style.
        //
        // `--allowedTools` and `--add-dir` each take a *list*, so they keep
        // consuming arguments until something that starts with a dash stops
        // them. Leaving either of them last swallows the prompt as one more
        // value, and the CLI then exits saying no prompt was given -- which
        // reads as the prompt being empty rather than as an argument order
        // problem. The list-taking flags therefore go first, and the prompt
        // comes last, behind flags that take exactly one value.
        let mut command = Command::new(cli_bin);
        command
            // Reading one file is the entire capability this needs. The CLI
            // inherits Toki's screen-recording and camera grants when Toki
            // launches it, so anything broader would be lending them out.
            .arg("--allowedTools")
            .arg("Read")
            // Confine it to the throwaway directory holding the screenshot.
            .arg("--add-dir")
            .arg(&work_dir)
            .arg("--output-format")
            .arg("text")
            // Never stop to ask a human. The default mode pauses on an
            // unapproved tool, which here is a request that hangs until the
            // timeout kills it -- and nobody is watching to answer.
            .arg("--permission-mode")
            .arg("dontAsk")
            .current_dir(&work_dir);

        let model = request
            .model
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(model) = model {
            command.arg("--model").arg(model);
        }

        // Last two, in this order: the flag that turns on one-shot mode, then
        // the prompt as the trailing positional argument.
        command.arg("--print").arg(prompt);

        let started = Instant::now();
        let (status, stdout, stderr) =
            run_command_with_timeout(&mut command, timeout, &stdout_path, &stderr_path)?;
        if !status.success() {
            let detail = truncate_process_detail(&stderr);
            return Err(if detail.is_empty() {
                format!("Codex CLI exited with status {status}.")
            } else {
                format!("Codex CLI exited with status {status}: {detail}")
            });
        }

        let raw_answer = stdout.trim().to_string();
        if raw_answer.is_empty() {
            return Err("Codex CLI returned an empty vision response.".to_string());
        }

        Ok(CodexVisionResponse {
            raw_answer,
            provider_name: model
                .map(|value| format!("codex-subscription:{value}"))
                .unwrap_or_else(|| "codex-subscription".to_string()),
            duration_ms: started.elapsed().as_millis(),
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

#[tauri::command]
async fn request_codex_vision_guidance(
    request: CodexVisionRequest,
) -> Result<CodexVisionResponse, String> {
    tauri::async_runtime::spawn_blocking(move || run_codex_vision_request(request))
        .await
        .map_err(|error| format!("Codex vision worker failed: {error}"))?
}

/// Keychain coordinates for the user's API key.
///
/// The service name is the bundle identifier so the entry is attributable in
/// Keychain Access, and so a user can find and remove it without our help.
/// Operator-configured paths, kept beside the API key.
///
/// These are not secrets -- they are filesystem paths the user chose. They live
/// in the Keychain only because it is the store this app already has, and it
/// keeps the "nothing is searched for" property intact: a value is present
/// because someone typed it, never because a directory was scanned.
#[cfg(target_os = "macos")]
fn read_stored_setting(name: &str) -> Option<String> {
    security_framework::passwords::get_generic_password(OPENAI_KEYCHAIN_SERVICE, name)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(not(target_os = "macos"))]
fn read_stored_setting(_name: &str) -> Option<String> {
    None
}

#[tauri::command]
fn operator_setting_status(name: String) -> Option<String> {
    read_stored_setting(&name)
}

#[tauri::command]
fn set_operator_setting(name: String, value: String) -> Result<(), String> {
    let trimmed = value.trim();

    #[cfg(target_os = "macos")]
    {
        if trimmed.is_empty() {
            let _ = security_framework::passwords::delete_generic_password(
                OPENAI_KEYCHAIN_SERVICE,
                &name,
            );
            return Ok(());
        }

        // Refuse a relative path here rather than at use time, so the mistake is
        // reported while the user is looking at the field.
        if !std::path::Path::new(trimmed).is_absolute() {
            return Err("Enter an absolute path.".to_string());
        }

        security_framework::passwords::set_generic_password(
            OPENAI_KEYCHAIN_SERVICE,
            &name,
            trimmed.as_bytes(),
        )
        .map_err(|error| format!("Could not save the setting: {error}"))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = trimmed;
        Err("Storing settings is only supported on macOS.".to_string())
    }
}

const OPENAI_KEYCHAIN_SERVICE: &str = "app.toki.desktop";
const OPENAI_KEYCHAIN_ACCOUNT: &str = "openai-api-key";

#[cfg(target_os = "macos")]
fn read_stored_openai_api_key() -> Option<String> {
    security_framework::passwords::get_generic_password(
        OPENAI_KEYCHAIN_SERVICE,
        OPENAI_KEYCHAIN_ACCOUNT,
    )
    .ok()
    .and_then(|bytes| String::from_utf8(bytes).ok())
    .map(|key| key.trim().to_string())
    .filter(|key| !key.is_empty())
}

#[cfg(not(target_os = "macos"))]
fn read_stored_openai_api_key() -> Option<String> {
    None
}

/// The key a transcription request should use.
///
/// The Keychain comes first because it is the only source an app launched from
/// Finder can actually read: a double-clicked app inherits no shell
/// environment, so the variable that works from a terminal is simply absent for
/// every ordinary user. The environment is kept as a fallback so the existing
/// terminal-launched development flow and the QA probe binaries keep working.
fn resolve_openai_api_key() -> Result<String, String> {
    if let Some(key) = read_stored_openai_api_key() {
        return Ok(key);
    }

    std::env::var("OPENAI_API_KEY")
        .ok()
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .ok_or_else(|| {
            "No OpenAI API key is stored. Add one in Toki's settings to use voice."
                .to_string()
        })
}

/// What the settings UI is allowed to know about the stored key.
///
/// Deliberately not the key. The UI needs to answer "is one saved" and "is it
/// the one I meant", and the last four characters answer the second without
/// handing the secret back across the bridge, where it could reach a log, a
/// diagnostics snapshot, or an error string.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiKeyStatus {
    stored: bool,
    available: bool,
    source: &'static str,
    hint: Option<String>,
}

fn openai_key_hint(key: &str) -> Option<String> {
    let visible: String = key.chars().rev().take(4).collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    if visible.is_empty() {
        None
    } else {
        Some(format!("…{visible}"))
    }
}

fn build_openai_key_status() -> OpenAiKeyStatus {
    if let Some(key) = read_stored_openai_api_key() {
        return OpenAiKeyStatus {
            stored: true,
            available: true,
            source: "keychain",
            hint: openai_key_hint(&key),
        };
    }

    match std::env::var("OPENAI_API_KEY") {
        Ok(key) if !key.trim().is_empty() => OpenAiKeyStatus {
            stored: false,
            available: true,
            source: "environment",
            hint: openai_key_hint(key.trim()),
        },
        _ => OpenAiKeyStatus {
            stored: false,
            available: false,
            source: "none",
            hint: None,
        },
    }
}

#[tauri::command]
fn openai_api_key_status() -> OpenAiKeyStatus {
    build_openai_key_status()
}

#[tauri::command]
fn set_openai_api_key(key: String) -> Result<OpenAiKeyStatus, String> {
    let trimmed = key.trim();

    if trimmed.is_empty() {
        return Err("An API key is required.".to_string());
    }

    // A length floor catches the common paste accidents -- a truncated
    // selection, or the label rather than the value. Deliberately no prefix
    // check: OpenAI has shipped several key formats and rejecting an
    // unfamiliar but valid one is worse than letting the API say no.
    if trimmed.len() < 20 {
        return Err("That does not look like a complete API key.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        security_framework::passwords::set_generic_password(
            OPENAI_KEYCHAIN_SERVICE,
            OPENAI_KEYCHAIN_ACCOUNT,
            trimmed.as_bytes(),
        )
        .map_err(|error| format!("Could not save the API key to the Keychain: {error}"))?;
        Ok(build_openai_key_status())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Storing an API key is only supported on macOS.".to_string())
    }
}

#[tauri::command]
fn clear_openai_api_key() -> Result<OpenAiKeyStatus, String> {
    #[cfg(target_os = "macos")]
    {
        // Deleting an entry that was never created is success, not an error,
        // so clearing when nothing is stored stays silent.
        match security_framework::passwords::delete_generic_password(
            OPENAI_KEYCHAIN_SERVICE,
            OPENAI_KEYCHAIN_ACCOUNT,
        ) {
            Ok(()) => Ok(build_openai_key_status()),
            Err(_) if read_stored_openai_api_key().is_none() => {
                Ok(build_openai_key_status())
            }
            Err(error) => Err(format!("Could not remove the API key: {error}")),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(build_openai_key_status())
    }
}

/// Where the signed-in session lives.
///
/// The refresh token is a long-lived credential: anyone holding it can mint
/// access tokens until it is revoked. That rules out a file in Application
/// Support, which any process running as the user can read. The Keychain is
/// encrypted at rest and scoped to this app, so a copy of the disk without the
/// login password yields nothing.
///
/// The tokens deliberately never reach the frontend's own storage — no
/// localStorage, no cookie. They cross into JavaScript only in memory, for the
/// duration of a request.
#[cfg(target_os = "macos")]
const AUTH_SESSION_ACCOUNT: &str = "auth-session";

#[tauri::command]
fn read_auth_session() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        security_framework::passwords::get_generic_password(
            OPENAI_KEYCHAIN_SERVICE,
            AUTH_SESSION_ACCOUNT,
        )
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .filter(|value| !value.trim().is_empty())
    }

    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[tauri::command]
fn store_auth_session(session: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        security_framework::passwords::set_generic_password(
            OPENAI_KEYCHAIN_SERVICE,
            AUTH_SESSION_ACCOUNT,
            session.as_bytes(),
        )
        .map_err(|error| format!("Could not save the sign-in to the Keychain: {error}"))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = session;
        Err("Storing a sign-in is only supported on macOS.".to_string())
    }
}

#[tauri::command]
fn clear_auth_session() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Signing out must succeed even when nothing was stored, otherwise a
        // half-finished sign-in leaves the user unable to get out of it.
        match security_framework::passwords::delete_generic_password(
            OPENAI_KEYCHAIN_SERVICE,
            AUTH_SESSION_ACCOUNT,
        ) {
            Ok(()) => Ok(()),
            Err(_) if read_auth_session().is_none() => Ok(()),
            Err(error) => Err(format!("Could not remove the sign-in: {error}")),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// Send a token request on the webview's behalf.
///
/// The window's content security policy permits no remote origin, so a request
/// made from JavaScript would be blocked before it left the process. Relaxing
/// that policy to allow one host would relax it for every script in the window;
/// making the call here keeps the window with no network reach at all, and
/// keeps the exchange out of a place where an injected script could watch it.
///
/// The URL is built here rather than accepted from the caller, so the only
/// thing this can ever talk to is the configured project's token endpoint.
#[tauri::command]
async fn auth_token_request(
    supabase_url: String,
    anon_key: String,
    grant_type: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if grant_type != "pkce" && grant_type != "refresh_token" {
        return Err("Unsupported sign-in request.".to_string());
    }

    let base = reqwest::Url::parse(supabase_url.trim())
        .map_err(|_| "The sign-in project address is not a valid URL.".to_string())?;

    // Credentials must never travel in the clear, and refusing here means a
    // misconfigured build fails loudly instead of leaking tokens quietly.
    if base.scheme() != "https" {
        return Err("The sign-in project address must use https.".to_string());
    }

    let mut endpoint = base
        .join("/auth/v1/token")
        .map_err(|_| "Could not build the sign-in request.".to_string())?;
    endpoint.set_query(Some(&format!("grant_type={grant_type}")));

    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| format!("Could not start the sign-in request: {error}"))?;

        let response = client
            .post(endpoint)
            .header("apikey", anon_key)
            .json(&payload)
            .send()
            .map_err(|error| format!("Sign-in could not reach the server: {error}"))?;

        // The body is returned whatever the status, because the failure detail
        // the user needs ("this link expired") lives in it. The caller decides
        // what a response without tokens means.
        response
            .json::<serde_json::Value>()
            .map_err(|_| "The sign-in server sent an unreadable reply.".to_string())
    })
    .await
    .map_err(|error| format!("The sign-in request could not be run: {error}"))?
}

#[derive(serde::Serialize)]
struct ApiReply {
    status: u16,
    body: serde_json::Value,
}

/// Call Toki's own service on the webview's behalf.
///
/// Same reason as the sign-in exchange: the window is allowed to reach no
/// remote origin at all, and opening it for one host opens it for every script
/// in the window. Requests go out from here instead, which also keeps the
/// access token out of the JavaScript heap on the way.
///
/// The status is returned rather than turned into an error, because 401, 402
/// and 429 each need a different offer to the user -- sign in, upgrade, wait --
/// and collapsing them into one failure is what makes a locked feature look
/// broken.
#[tauri::command]
async fn toki_api_request(
    endpoint: String,
    path: String,
    access_token: String,
    body: serde_json::Value,
) -> Result<ApiReply, String> {
    let base = reqwest::Url::parse(endpoint.trim())
        .map_err(|_| "The guidance service address is not a valid URL.".to_string())?;

    // Bearer tokens must not travel in the clear. Localhost is the exception
    // that makes running the service on this machine during development
    // possible without weakening the rule anywhere else.
    let is_local = matches!(base.host_str(), Some("127.0.0.1") | Some("localhost"));
    if base.scheme() != "https" && !is_local {
        return Err("The guidance service address must use https.".to_string());
    }

    let url = base
        .join(&path)
        .map_err(|_| "Could not build the guidance request.".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            // Long enough for a model to look at a screenshot, short enough
            // that a hung request does not leave the pointer waiting forever.
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|error| format!("Could not start the request: {error}"))?;

        let response = client
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .map_err(|error| format!("Toki could not reach the guidance service: {error}"))?;

        let status = response.status().as_u16();
        // A body that is not JSON still has to produce something the caller can
        // report, so an unreadable reply becomes an empty object rather than an
        // error that loses the status code.
        let body = response
            .json::<serde_json::Value>()
            .unwrap_or_else(|_| serde_json::json!({}));

        Ok(ApiReply { status, body })
    })
    .await
    .map_err(|error| format!("The request could not be run: {error}"))?
}

fn transcribe_voice_capture_with_openai(
    audio_bytes: Vec<u8>,
    request: &VoiceTranscriptionRequest,
) -> Result<VoiceTranscriptionResponse, String> {
    let api_key = resolve_openai_api_key()?;
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

/// Locate a local Whisper build, if an operator has named one.
///
/// Same rule as the guidance CLI above, and for the same reason: this used to
/// search `~/tools/whisper.cpp/build/bin` and then `PATH` for `whisper-cli`,
/// `whisper-cpp`, or `whisper`. Both are writable without sudo, so a planted
/// file would have been executed inside Toki's microphone and screen-recording
/// grants. See `resolve_operator_binary` for the full reasoning.
fn find_local_whisper_binary() -> Result<String, String> {
    resolve_operator_binary(WHISPER_BIN_ENV, "Local Whisper transcription")
        .map(|path| path.to_string_lossy().to_string())
}

/// Locate the Whisper model an operator has named.
///
/// Lower stakes than the binary beside it -- this is a data file handed to a
/// program the operator already chose explicitly, not something Toki executes.
/// It is resolved the same way anyway: half a feature configured explicitly and
/// half of it guessed from a writable directory is the kind of asymmetry that
/// invites someone to reintroduce the searching later.
fn local_whisper_model_path() -> Result<String, String> {
    resolve_operator_binary(WHISPER_MODEL_ENV, "Local Whisper transcription")
        .map(|path| path.to_string_lossy().to_string())
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

#[tauri::command]
fn native_cursor_position() -> Result<NativeCursorPosition, String> {
    #[cfg(target_os = "macos")]
    {
        let (x, y) = native_cursor::cursor_position()?;

        return Ok(NativeCursorPosition {
            x,
            y,
            source: "native-macos-coregraphics",
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("native cursor position is not implemented for this platform".to_string())
    }
}

#[tauri::command]
fn macos_overlay_window_status(
    app: tauri::AppHandle,
) -> Result<Option<macos_overlay::WindowStatus>, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        return Ok(macos_overlay::latest_status());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(Some(macos_overlay::unsupported_status()))
    }
}

#[tauri::command]
fn set_overlay_surface_mode(
    app: tauri::AppHandle,
    request: OverlaySurfaceModeRequest,
) -> Result<(), String> {
    let Some(overlay) = app.get_webview_window("overlay") else {
        return Err("overlay window is not available".to_string());
    };

    match request.mode.as_str() {
        "guidance" => {
            OVERLAY_GUIDANCE_SURFACE.store(true, Ordering::SeqCst);
            show_overlay_window(&overlay)
        }
        "puck" => {
            OVERLAY_GUIDANCE_SURFACE.store(false, Ordering::SeqCst);
            show_overlay_window(&overlay)
        }
        other => Err(format!(
            "unsupported overlay surface mode: {other}. Use puck or guidance."
        )),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let native_click_monitor_state = Arc::new(NativeClickMonitorState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // The updater fetches and verifies in Rust, not the webview, so the
        // content security policy does not apply to it and github.com does not
        // need to be allowed in connect-src.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Sign-in returns from the browser through a toki:// link. macOS
        // launches the app to deliver one, so the callback has to survive a
        // cold start, not only arrive while the app is already open.
        .plugin(tauri_plugin_deep_link::init())
        .manage(Mutex::new(VoiceCaptureStore::default()))
        .manage(native_click_monitor_state.clone())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            start_native_voice_key_monitor(app.handle().clone());
            start_native_cursor_monitor(app.handle().clone());
            start_native_click_monitor(app.handle().clone(), native_click_monitor_state);

            if let Some(overlay) = app.get_webview_window("overlay") {
                if let Err(error) = show_overlay_window(&overlay) {
                    eprintln!("failed to prepare Toki overlay: {error}");
                }
            }

            if let Some(settings) = app.get_webview_window("settings") {
                let _ = settings.set_title(" ");
                let _ = settings.hide();
                let _ = settings.set_decorations(false);
                let _ = settings.set_focusable(true);
                let _ = settings.set_skip_taskbar(true);
                let _ = settings.set_visible_on_all_workspaces(true);
                let _ = settings.set_shadow(false);
                #[cfg(windows)]
                prepare_windows_utility_window(&settings, false);
            }

            if let Some(debug) = app.get_webview_window("debug") {
                let _ = debug.hide();
            }

            if let Some(preferences) = app.get_webview_window("preferences") {
                let _ = preferences.hide();
            }

            let tray_menu = MenuBuilder::new(app)
                .text("open_settings", "Open Toki")
                .text("open_preferences", "Preferences…")
                .text("open_debug", "Open Debug")
                .separator()
                .text("quit", "Quit Toki")
                .build()?;

            // The menu bar wants a template image, not the app icon.
            //
            // macOS recolours these itself -- black on a light menu bar, white
            // on a dark one -- and only a solid shape with an alpha channel
            // survives that. Handing it the colourful app icon, which is what
            // `default_window_icon` returns, produces something that looks
            // wrong on whichever appearance the user is not using.
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!(
                "../icons/trayTemplate@2x.png"
            ))
            .ok();
            let mut tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Toki")
                .icon_as_template(true)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open_settings" => {
                        show_settings_window(app);
                    }
                    "open_preferences" => {
                        if let Some(window) = app.get_webview_window("preferences") {
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

            if let Some(icon) = tray_icon {
                tray = tray.icon(icon).icon_as_template(true);
            }

            let _tray = tray.build(app)?;

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
            camera_reframing_status,
            capture_active_window_snapshot,
            capture_metadata,
            capture_screenshot,
            collect_screen_candidates,
            frontmost_window_bounds,
            screen_capture_access_status,
            request_screen_capture_access,
            hide_settings_window,
            macos_overlay_window_status,
            native_click_monitor_set_armed,
            native_cursor_position,
            native_voice_capture_status,
            native_voice_capture_reset,
            native_voice_capture_start,
            native_voice_capture_stop,
            request_codex_vision_guidance,
            set_overlay_surface_mode,
            set_top_utility_mode,
            toki_debug_export_status,
            clear_toki_debug_export,
            openai_api_key_status,
            operator_setting_status,
            set_operator_setting,
            set_openai_api_key,
            clear_openai_api_key,
            read_auth_session,
            store_auth_session,
            clear_auth_session,
            auth_token_request,
            toki_api_request,
            transcribe_voice_capture,
            write_toki_debug_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        is_right_option_pressed, metadata_from_screenshot, require_macos_screen_capture_trust,
    };
    use toki_capture::{
        ActiveWindowContext, CaptureSource, CursorContext, DisplayContext, ScreenshotCapture,
        ScreenshotFormat,
    };

    #[test]
    fn snapshot_metadata_uses_the_exact_screenshot_context() {
        let screenshot = ScreenshotCapture {
            source: CaptureSource::ActiveDisplay,
            display: DisplayContext {
                id: "display-1".to_string(),
                width: 1512,
                height: 982,
                scale_factor: 2.0,
            },
            cursor: Some(CursorContext { x: 412.0, y: 318.0 }),
            active_window: Some(ActiveWindowContext {
                title: Some("Known screen".to_string()),
                app_name: Some("Fixture App".to_string()),
            }),
            captured_at: "2026-07-10T12:00:00Z".to_string(),
            format: ScreenshotFormat::Png,
            byte_length: 4,
            image_width: 3024,
            image_height: 1964,
            image_base64: "dGVzdA==".to_string(),
        };

        let metadata = metadata_from_screenshot(&screenshot);

        assert!(matches!(metadata.source, CaptureSource::ActiveDisplay));
        assert_eq!(metadata.display.id, screenshot.display.id);
        assert_eq!(metadata.display.width, screenshot.display.width);
        assert_eq!(metadata.cursor.as_ref().map(|cursor| cursor.x), Some(412.0));
        assert_eq!(
            metadata
                .active_window
                .as_ref()
                .and_then(|window| window.app_name.as_deref()),
            Some("Fixture App")
        );
        assert_eq!(metadata.captured_at, screenshot.captured_at);
    }

    #[test]
    fn screen_capture_preflight_fails_closed_before_pixels_are_captured() {
        assert!(require_macos_screen_capture_trust(true).is_ok());
        let error = require_macos_screen_capture_trust(false).unwrap_err();
        assert!(error.contains("Screen Recording is not trusted"));
        assert!(error.contains("quit and relaunch"));
    }

    #[test]
    fn right_option_detector_accepts_either_native_right_side_signal() {
        assert!(is_right_option_pressed(0x0000_0040, false));
        assert!(is_right_option_pressed(0, true));
        assert!(is_right_option_pressed(0x0000_0040, true));
    }

    #[test]
    fn right_option_detector_rejects_left_and_generic_option_signals() {
        const LEFT_OPTION_DEVICE_FLAG: u64 = 0x0000_0020;
        const GENERIC_OPTION_FLAG: u64 = 1 << 19;

        assert!(!is_right_option_pressed(0, false));
        assert!(!is_right_option_pressed(LEFT_OPTION_DEVICE_FLAG, false));
        assert!(!is_right_option_pressed(GENERIC_OPTION_FLAG, false));
        assert!(!is_right_option_pressed(
            LEFT_OPTION_DEVICE_FLAG | GENERIC_OPTION_FLAG,
            false,
        ));
    }
}
