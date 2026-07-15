use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use screenshots::Screen;
use serde::Serialize;
use std::{error::Error, fmt, fs, io::Cursor};

#[cfg(target_os = "macos")]
use std::{path::PathBuf, process::Command};

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

#[derive(Debug)]
pub enum CaptureError {
    NoDisplay,
    CaptureFailed(String),
    InvalidBuffer,
    EncodeFailed(String),
    LengthOverflow,
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CaptureError::NoDisplay => write!(f, "no display available for capture"),
            CaptureError::CaptureFailed(message) => write!(f, "screen capture failed: {message}"),
            CaptureError::InvalidBuffer => write!(f, "captured image buffer was invalid"),
            CaptureError::EncodeFailed(message) => {
                write!(f, "screenshot encoding failed: {message}")
            }
            CaptureError::LengthOverflow => write!(f, "encoded screenshot was too large"),
        }
    }
}

impl Error for CaptureError {}

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

pub fn capture_primary_display_metadata() -> Result<CaptureMetadata, CaptureError> {
    let screens = match Screen::all() {
        Ok(screens) => screens,
        Err(_error) => {
            #[cfg(target_os = "macos")]
            {
                let capture = capture_primary_display_macos_fallback()?;
                return Ok(CaptureMetadata {
                    source: capture.source,
                    display: capture.display,
                    cursor: capture.cursor,
                    active_window: capture.active_window,
                    captured_at: capture.captured_at,
                });
            }

            #[cfg(not(target_os = "macos"))]
            {
                return Err(CaptureError::CaptureFailed(_error.to_string()));
            }
        }
    };
    let screen = match screens.into_iter().next() {
        Some(screen) => screen,
        None => {
            #[cfg(target_os = "macos")]
            {
                let capture = capture_primary_display_macos_fallback()?;
                return Ok(CaptureMetadata {
                    source: capture.source,
                    display: capture.display,
                    cursor: capture.cursor,
                    active_window: capture.active_window,
                    captured_at: capture.captured_at,
                });
            }

            #[cfg(not(target_os = "macos"))]
            {
                return Err(CaptureError::NoDisplay);
            }
        }
    };
    let display_info = screen.display_info;

    Ok(CaptureMetadata {
        source: CaptureSource::ActiveDisplay,
        display: DisplayContext {
            id: display_info.id.to_string(),
            width: display_info.width,
            height: display_info.height,
            scale_factor: f64::from(display_info.scale_factor),
        },
        cursor: None,
        active_window: None,
        captured_at: Utc::now().to_rfc3339(),
    })
}

pub fn capture_primary_display() -> Result<ScreenshotCapture, CaptureError> {
    let screens = match Screen::all() {
        Ok(screens) => screens,
        Err(_error) => {
            #[cfg(target_os = "macos")]
            {
                return capture_primary_display_macos_fallback();
            }

            #[cfg(not(target_os = "macos"))]
            {
                return Err(CaptureError::CaptureFailed(_error.to_string()));
            }
        }
    };
    let screen = match screens.into_iter().next() {
        Some(screen) => screen,
        None => {
            #[cfg(target_os = "macos")]
            {
                return capture_primary_display_macos_fallback();
            }

            #[cfg(not(target_os = "macos"))]
            {
                return Err(CaptureError::NoDisplay);
            }
        }
    };
    let image = screen
        .capture()
        .map_err(|error| CaptureError::CaptureFailed(error.to_string()))?;
    let display_info = screen.display_info;

    let width = image.width();
    let height = image.height();
    let rgba = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width, height, image.into_raw())
        .ok_or(CaptureError::InvalidBuffer)?;
    let dynamic_image = DynamicImage::ImageRgba8(rgba);
    let mut png_bytes = Vec::new();

    dynamic_image
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|error| CaptureError::EncodeFailed(error.to_string()))?;

    let byte_length = u32::try_from(png_bytes.len()).map_err(|_| CaptureError::LengthOverflow)?;
    let image_base64 = general_purpose::STANDARD.encode(&png_bytes);

    Ok(ScreenshotCapture {
        source: CaptureSource::ActiveDisplay,
        display: DisplayContext {
            id: display_info.id.to_string(),
            width: display_info.width,
            height: display_info.height,
            scale_factor: f64::from(display_info.scale_factor),
        },
        cursor: None,
        active_window: None,
        captured_at: Utc::now().to_rfc3339(),
        format: ScreenshotFormat::Png,
        byte_length,
        image_width: width,
        image_height: height,
        image_base64,
    })
}

#[cfg(target_os = "macos")]
fn capture_primary_display_macos_fallback() -> Result<ScreenshotCapture, CaptureError> {
    let captured_at = Utc::now();
    let mut path = std::env::temp_dir();
    path.push(format!(
        "toki-screencapture-{}-{}.png",
        std::process::id(),
        captured_at.timestamp_millis()
    ));

    let output = Command::new("/usr/sbin/screencapture")
        .args(["-x", "-t", "png"])
        .arg(&path)
        .output()
        .map_err(|error| CaptureError::CaptureFailed(error.to_string()))?;

    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = fs::remove_file(&path);
        return Err(CaptureError::CaptureFailed(if message.is_empty() {
            format!("screencapture exited with status {}", output.status)
        } else {
            message
        }));
    }

    read_macos_screencapture_file(path, captured_at.to_rfc3339())
}

#[cfg(target_os = "macos")]
fn read_macos_screencapture_file(
    path: PathBuf,
    captured_at: String,
) -> Result<ScreenshotCapture, CaptureError> {
    let png_bytes =
        fs::read(&path).map_err(|error| CaptureError::CaptureFailed(error.to_string()))?;
    let _ = fs::remove_file(&path);
    let image = image::load_from_memory_with_format(&png_bytes, ImageFormat::Png)
        .map_err(|error| CaptureError::EncodeFailed(error.to_string()))?;
    let width = image.width();
    let height = image.height();
    let byte_length = u32::try_from(png_bytes.len()).map_err(|_| CaptureError::LengthOverflow)?;
    let image_base64 = general_purpose::STANDARD.encode(&png_bytes);

    Ok(ScreenshotCapture {
        source: CaptureSource::ActiveDisplay,
        display: DisplayContext {
            id: "macos-screencapture".to_string(),
            width,
            height,
            scale_factor: 1.0,
        },
        cursor: None,
        active_window: None,
        captured_at,
        format: ScreenshotFormat::Png,
        byte_length,
        image_width: width,
        image_height: height,
        image_base64,
    })
}
