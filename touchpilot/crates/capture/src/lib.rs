use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayContext {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorContext {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowContext {
    pub title: Option<String>,
    pub app_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureSource {
    FullScreen,
    ActiveDisplay,
    ActiveWindow,
    Region,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureMetadata {
    pub source: CaptureSource,
    pub display: DisplayContext,
    pub cursor: Option<CursorContext>,
    pub active_window: Option<ActiveWindowContext>,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScreenshotFormat {
    Png,
    Jpeg,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotCapture {
    pub source: CaptureSource,
    pub display: DisplayContext,
    pub cursor: Option<CursorContext>,
    pub active_window: Option<ActiveWindowContext>,
    pub captured_at: String,
    pub format: ScreenshotFormat,
    pub byte_length: u32,
    pub image_width: u32,
    pub image_height: u32,
    pub image_base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CalibrationStatus {
    Unknown,
    NeedsCheck,
    Aligned,
    ScaleMismatch,
    OriginMismatch,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinateCalibration {
    pub status: CalibrationStatus,
    pub overlay_width: u32,
    pub overlay_height: u32,
    pub display_width: u32,
    pub display_height: u32,
    pub scale_factor: f64,
    pub checked_at: Option<String>,
    pub notes: Option<String>,
}

pub fn module_name() -> &'static str {
    "capture"
}
