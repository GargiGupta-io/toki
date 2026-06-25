use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Default)]
struct ProbeStats {
    sample_count: usize,
    peak: f32,
}

fn update_stats(stats: &Arc<Mutex<ProbeStats>>, sample: f32) {
    if let Ok(mut stats) = stats.lock() {
        stats.sample_count += 1;
        stats.peak = stats.peak.max(sample.abs());
    }
}

fn main() -> Result<(), String> {
    println!("Toki microphone capture probe");
    println!();

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "no default input microphone found".to_string())?;
    let device_name = device
        .name()
        .unwrap_or_else(|_| "Unknown microphone".to_string());
    let supported_config = device
        .default_input_config()
        .map_err(|error| format!("failed to read default microphone config: {error}"))?;
    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    let sample_format = supported_config.sample_format();
    let stream_config: cpal::StreamConfig = supported_config.into();
    let stats = Arc::new(Mutex::new(ProbeStats::default()));
    let error_callback = |error| eprintln!("microphone stream error: {error}");

    println!(
        "[INFO] device - {device_name}, sample_rate={sample_rate}, channels={channels}, format={sample_format:?}"
    );
    println!("[INFO] recording - listening for 2 seconds");

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let stats = Arc::clone(&stats);
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    for &sample in data {
                        update_stats(&stats, sample);
                    }
                },
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let stats = Arc::clone(&stats);
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    for &sample in data {
                        update_stats(&stats, f32::from(sample) / f32::from(i16::MAX));
                    }
                },
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let stats = Arc::clone(&stats);
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    for &sample in data {
                        let normalized =
                            (f32::from(sample) - f32::from(u16::MAX) / 2.0)
                                / (f32::from(u16::MAX) / 2.0);
                        update_stats(&stats, normalized);
                    }
                },
                error_callback,
                None,
            )
        }
        other => return Err(format!("unsupported microphone sample format: {other:?}")),
    }
    .map_err(|error| format!("failed to start microphone stream: {error}"))?;

    stream
        .play()
        .map_err(|error| format!("failed to play microphone stream: {error}"))?;
    thread::sleep(Duration::from_secs(2));
    drop(stream);

    let stats = stats
        .lock()
        .map_err(|_| "microphone probe state is poisoned".to_string())?;

    if stats.sample_count == 0 {
        return Err(
            "microphone opened but returned no samples. Check macOS Microphone permission."
                .to_string(),
        );
    }

    println!(
        "[PASS] microphone captured - samples={} peak={:.4}",
        stats.sample_count, stats.peak
    );

    Ok(())
}
