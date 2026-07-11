use base64::{engine::general_purpose, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::MenuBuilder, tray::TrayIconBuilder, Emitter, LogicalSize, Manager, PhysicalPosition,
    PhysicalSize, Position, Size, State,
};
use toki_capture::{
    capture_primary_display, capture_primary_display_metadata, ActiveWindowContext,
    CaptureMetadata, ScreenshotCapture,
};

static VOICE_SHORTCUT_HELD: AtomicBool = AtomicBool::new(false);
static OVERLAY_GUIDANCE_SURFACE: AtomicBool = AtomicBool::new(false);
const NATIVE_VOICE_KEY_POLL_MS: u64 = 35;
const NATIVE_CURSOR_POLL_MS: u64 = 50;
const NATIVE_CLICK_POLL_MS: u64 = 25;

#[derive(Default)]
struct NativeClickMonitorState {
    armed: AtomicBool,
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

const TOP_UTILITY_PEEK_WIDTH: f64 = 392.0;
const TOP_UTILITY_PEEK_HEIGHT: f64 = 60.0;
const TOP_UTILITY_EXPANDED_WIDTH: f64 = 424.0;
const TOP_UTILITY_EXPANDED_HEIGHT: f64 = 224.0;

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

    pub fn option_down() -> bool {
        const K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE: i32 = 0;
        const K_VK_LEFT_OPTION: u16 = 0x3A;
        const K_VK_RIGHT_OPTION: u16 = 0x3D;
        const K_CG_EVENT_FLAG_MASK_ALTERNATE: u64 = 1 << 19;

        let flags =
            unsafe { CGEventSourceFlagsState(K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE) };
        let option_flag_down = flags & K_CG_EVENT_FLAG_MASK_ALTERNATE != 0;
        let left_option_down = unsafe {
            CGEventSourceKeyState(
                K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE,
                K_VK_LEFT_OPTION,
            )
        };
        let right_option_down = unsafe {
            CGEventSourceKeyState(
                K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE,
                K_VK_RIGHT_OPTION,
            )
        };

        option_flag_down || left_option_down || right_option_down
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
  guard preferredAppName.isEmpty else {
    return false
  }

  let normalized = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

  return normalized == "toki" ||
    normalized == "touchpilot" ||
    normalized == "system settings" ||
    normalized == "system preferences" ||
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
var fallbackOwnerPid: Int? = nil

if selectedApp == nil {
  fallbackOwnerPid = windowInfo.compactMap { info -> (pid: Int, area: Double)? in
    guard
      let ownerPid = intValue(info[kCGWindowOwnerPID as String]),
      let ownerName = normalized(info[kCGWindowOwnerName as String] as? String),
      !isIgnoredOwnerName(ownerName),
      let layer = intValue(info[kCGWindowLayer as String]),
      layer == 0,
      let bounds = info[kCGWindowBounds as String] as? [String: Any],
      let width = doubleValue(bounds["Width"]),
      let height = doubleValue(bounds["Height"]),
      width >= 160,
      height >= 160
    else {
      return nil
    }

    return (pid: ownerPid, area: width * height)
  }
  .max(by: { $0.area < $1.area })?
  .pid
}

let targetPid = selectedApp.map { Int($0.processIdentifier) } ?? fallbackOwnerPid
let targetApp = targetPid.flatMap { pid in
  NSWorkspace.shared.runningApplications.first { Int($0.processIdentifier) == pid }
}

func makeWindowPayload(_ info: [String: Any], expectedPid: Int?) -> WindowBoundsPayload? {
  guard
    let ownerPid = intValue(info[kCGWindowOwnerPID as String]),
    expectedPid == nil || ownerPid == expectedPid,
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
    x: x,
    y: y,
    width: width,
    height: height
  )
}

let usableWindows = windowInfo.compactMap { info -> WindowBoundsPayload? in
  guard let targetPid else {
    return nil
  }

  return makeWindowPayload(info, expectedPid: targetPid)
}

let fallbackWindows = windowInfo.compactMap { info -> WindowBoundsPayload? in
  makeWindowPayload(info, expectedPid: nil)
}

guard let window = (usableWindows.isEmpty ? fallbackWindows : usableWindows)
  .max(by: { ($0.width * $0.height) < ($1.width * $1.height) }) else {
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
fn frontmost_window_bounds(app_name: Option<String>) -> Result<NativeWindowBounds, String> {
    let temp_root = std::env::temp_dir();
    let stamp = now_ms();
    let script_path = temp_root.join(format!("toki-window-bounds-{stamp}.swift"));

    let output = fs::write(&script_path, frontmost_window_bounds_swift_source())
        .map_err(|error| error.to_string())
        .and_then(|_| {
            Command::new("/usr/bin/swift")
                .arg(&script_path)
                .arg(app_name.as_deref().unwrap_or(""))
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

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn frontmost_window_bounds(_app_name: Option<String>) -> Result<NativeWindowBounds, String> {
    Err("active window crop is only implemented on macOS right now".to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn screen_capture_access_status() -> Result<bool, String> {
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
                format!("native macOS Accessibility probe exited with {}", output.status)
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
fn prepare_macos_overlay_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use std::ffi::{c_char, c_void};

    extern "C" {
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };

    if ns_window_ptr.is_null() {
        return;
    }

    // Mirror Clicky's overlay contract: a non-activating utility layer that joins
    // fullscreen Spaces and never catches normal user clicks.
    unsafe {
        let set_level: extern "C" fn(*mut c_void, *mut c_void, isize) =
            std::mem::transmute(objc_msgSend as *const ());
        let set_collection_behavior: extern "C" fn(*mut c_void, *mut c_void, usize) =
            std::mem::transmute(objc_msgSend as *const ());
        let set_bool: extern "C" fn(*mut c_void, *mut c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        let send_void: extern "C" fn(*mut c_void, *mut c_void) =
            std::mem::transmute(objc_msgSend as *const ());

        let set_level_sel = sel_registerName(b"setLevel:\0".as_ptr().cast());
        let set_collection_behavior_sel =
            sel_registerName(b"setCollectionBehavior:\0".as_ptr().cast());
        let set_ignores_mouse_events_sel =
            sel_registerName(b"setIgnoresMouseEvents:\0".as_ptr().cast());
        let set_hides_on_deactivate_sel =
            sel_registerName(b"setHidesOnDeactivate:\0".as_ptr().cast());
        let set_can_hide_sel = sel_registerName(b"setCanHide:\0".as_ptr().cast());
        let set_opaque_sel = sel_registerName(b"setOpaque:\0".as_ptr().cast());
        let set_has_shadow_sel = sel_registerName(b"setHasShadow:\0".as_ptr().cast());
        let order_front_regardless_sel =
            sel_registerName(b"orderFrontRegardless\0".as_ptr().cast());

        let can_join_all_spaces = 1_usize << 0;
        let stationary = 1_usize << 4;
        let ignores_cycle = 1_usize << 6;
        let fullscreen_auxiliary = 1_usize << 8;
        let collection_behavior =
            can_join_all_spaces | stationary | ignores_cycle | fullscreen_auxiliary;

        set_level(ns_window_ptr, set_level_sel, 1000);
        set_collection_behavior(
            ns_window_ptr,
            set_collection_behavior_sel,
            collection_behavior,
        );
        set_bool(ns_window_ptr, set_ignores_mouse_events_sel, true);
        set_bool(ns_window_ptr, set_hides_on_deactivate_sel, false);
        set_bool(ns_window_ptr, set_can_hide_sel, false);
        set_bool(ns_window_ptr, set_opaque_sel, false);
        set_bool(ns_window_ptr, set_has_shadow_sel, false);
        send_void(ns_window_ptr, order_front_regardless_sel);
    }
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
    let top_gap = (30.0 * scale_factor).round() as i32;
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
            let _ = window.app_handle().emit_to(
                "overlay",
                "toki://top-utility-mode",
                payload,
            );
            return window.hide().map_err(|error| error.to_string());
        }
        "peek" => {
            position_top_utility(
                window,
                TOP_UTILITY_PEEK_WIDTH,
                TOP_UTILITY_PEEK_HEIGHT,
            )?;
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
    window
        .emit("toki://top-utility-mode", payload.clone())
        .map_err(|error| error.to_string())?;
    let _ = window.app_handle().emit_to(
        "overlay",
        "toki://top-utility-mode",
        payload,
    );

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

    let result = capture_primary_display().map_err(|error| {
        #[cfg(target_os = "macos")]
        {
            if !preflight_trusted {
                return format!(
                    "Screen capture failed after macOS preflight reported Screen Recording was not trusted for this Toki build. Grant Screen Recording permission to Toki, quit and relaunch it, then try again. Capture error: {error}"
                );
            }
        }

        error.to_string()
    });

    #[cfg(target_os = "macos")]
    if result.is_ok() && !preflight_trusted && auto_smoke_logs_enabled() {
        eprintln!(
            "toki auto real smoke: capture_screenshot succeeded even though macOS preflight returned false"
        );
    }

    result
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

#[tauri::command]
fn capture_active_window_snapshot(
    app_name: Option<String>,
) -> Result<ActiveWindowCaptureSnapshot, String> {
    let started_at_ms = now_ms();
    let snapshot_id = format!("active-window-{started_at_ms}");
    let window = frontmost_window_bounds(app_name)?;
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
    thread::spawn(move || {
        let mut was_down = false;

        loop {
            thread::sleep(Duration::from_millis(NATIVE_VOICE_KEY_POLL_MS));

            let is_down = native_cursor::option_down();

            if is_down && !was_down {
                if !VOICE_SHORTCUT_HELD.swap(true, Ordering::SeqCst) {
                    emit_overlay_command(
                        &app,
                        OverlayCommandPayload::StartVoiceListening { source: "hotkey" },
                    );
                }
            }

            if !is_down && was_down {
                VOICE_SHORTCUT_HELD.store(false, Ordering::SeqCst);
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
                Some((last_x, last_y)) => {
                    (x - last_x).abs() >= 1.5 || (y - last_y).abs() >= 1.5
                }
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

    VOICE_SHORTCUT_HELD.store(false, Ordering::SeqCst);
    Ok(())
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
            fit_overlay_to_monitor(&overlay);
            #[cfg(target_os = "macos")]
            prepare_macos_overlay_window(&overlay);
            let _ = overlay.show();
            Ok(())
        }
        "puck" => {
            OVERLAY_GUIDANCE_SURFACE.store(false, Ordering::SeqCst);
            fit_overlay_to_monitor(&overlay);
            #[cfg(target_os = "macos")]
            prepare_macos_overlay_window(&overlay);
            let _ = overlay.show();
            Ok(())
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
        .manage(Mutex::new(VoiceCaptureStore::default()))
        .manage(native_click_monitor_state.clone())
        .setup(|app| {
            start_native_voice_key_monitor(app.handle().clone());
            start_native_cursor_monitor(app.handle().clone());
            start_native_click_monitor(app.handle().clone(), native_click_monitor_state);

            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_title(" ");
                let _ = overlay.set_decorations(false);
                fit_overlay_to_monitor(&overlay);
                let _ = overlay.set_ignore_cursor_events(true);
                let _ = overlay.set_focusable(false);
                let _ = overlay.set_skip_taskbar(true);
                let _ = overlay.set_visible_on_all_workspaces(true);
                #[cfg(target_os = "macos")]
                prepare_macos_overlay_window(&overlay);
                #[cfg(windows)]
                prepare_windows_utility_window(&overlay, true);
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
            capture_active_window_snapshot,
            capture_metadata,
            capture_screenshot,
            collect_screen_candidates,
            frontmost_window_bounds,
            screen_capture_access_status,
            hide_settings_window,
            native_click_monitor_set_armed,
            native_cursor_position,
            native_voice_capture_status,
            native_voice_capture_reset,
            native_voice_capture_start,
            native_voice_capture_stop,
            set_overlay_surface_mode,
            set_top_utility_mode,
            transcribe_voice_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::metadata_from_screenshot;
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
}
