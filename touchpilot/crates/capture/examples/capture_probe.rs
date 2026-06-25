use touchpilot_capture::{capture_primary_display, capture_primary_display_metadata};

fn main() {
    println!("TouchPilot capture probe");
    println!();

    match capture_primary_display_metadata() {
        Ok(metadata) => {
            println!(
                "[PASS] metadata - display={} {}x{} scale={}",
                metadata.display.id,
                metadata.display.width,
                metadata.display.height,
                metadata.display.scale_factor
            );
        }
        Err(error) => {
            eprintln!("[FAIL] metadata - {error}");
            std::process::exit(1);
        }
    }

    match capture_primary_display() {
        Ok(capture) => {
            println!(
                "[PASS] screenshot - image={}x{} bytes={} base64_chars={}",
                capture.image_width,
                capture.image_height,
                capture.byte_length,
                capture.image_base64.len()
            );
        }
        Err(error) => {
            eprintln!("[FAIL] screenshot - {error}");
            eprintln!(
                "On macOS, grant Screen Recording permission to the terminal app and rerun npm run qa:mac:capture."
            );
            std::process::exit(1);
        }
    }
}
