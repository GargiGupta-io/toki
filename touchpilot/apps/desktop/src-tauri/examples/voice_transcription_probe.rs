use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Default)]
struct AudioBuffer {
    samples: Vec<i16>,
    peak: f32,
}

#[derive(Deserialize)]
struct TranscriptionResponse {
    text: String,
}

fn push_sample(buffer: &Arc<Mutex<AudioBuffer>>, sample: f32) {
    if let Ok(mut buffer) = buffer.lock() {
        let clamped = sample.clamp(-1.0, 1.0);
        buffer.peak = buffer.peak.max(clamped.abs());
        buffer.samples.push((clamped * f32::from(i16::MAX)) as i16);
    }
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
    output.extend_from_slice(&16u16.to_le_bytes());
    output.extend_from_slice(b"data");
    output.extend_from_slice(&data_size.to_le_bytes());

    for sample in samples {
        output.extend_from_slice(&sample.to_le_bytes());
    }

    output
}

fn record_audio() -> Result<(Vec<u8>, u32, u16, String, usize, f32), String> {
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
    let buffer = Arc::new(Mutex::new(AudioBuffer::default()));
    let error_callback = |error| eprintln!("microphone stream error: {error}");

    println!(
        "[INFO] device - {device_name}, sample_rate={sample_rate}, channels={channels}, format={sample_format:?}"
    );
    println!("[INFO] recording - say: show me what to click next");

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let buffer = Arc::clone(&buffer);
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    for &sample in data {
                        push_sample(&buffer, sample);
                    }
                },
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let buffer = Arc::clone(&buffer);
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    for &sample in data {
                        push_sample(&buffer, f32::from(sample) / f32::from(i16::MAX));
                    }
                },
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let buffer = Arc::clone(&buffer);
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    for &sample in data {
                        let normalized =
                            (f32::from(sample) - f32::from(u16::MAX) / 2.0)
                                / (f32::from(u16::MAX) / 2.0);
                        push_sample(&buffer, normalized);
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
    thread::sleep(Duration::from_secs(4));
    drop(stream);

    let buffer = buffer
        .lock()
        .map_err(|_| "microphone probe state is poisoned".to_string())?;

    if buffer.samples.is_empty() {
        return Err(
            "microphone opened but returned no samples. Check macOS Microphone permission."
                .to_string(),
        );
    }

    let wav_bytes = encode_wav_i16(&buffer.samples, sample_rate, channels);

    Ok((
        wav_bytes,
        sample_rate,
        channels,
        device_name,
        buffer.samples.len(),
        buffer.peak,
    ))
}

fn transcribe_audio(wav_bytes: Vec<u8>) -> Result<(String, String), String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY is not set for transcription QA".to_string())?;
    let endpoint = std::env::var("TOUCHPILOT_TRANSCRIPTION_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1/audio/transcriptions".to_string());
    let model = std::env::var("TOUCHPILOT_TRANSCRIPTION_MODEL")
        .unwrap_or_else(|_| "gpt-4o-transcribe".to_string());
    let audio_part = reqwest::blocking::multipart::Part::bytes(wav_bytes)
        .file_name("touchpilot-qa-command.wav")
        .mime_str("audio/wav")
        .map_err(|error| format!("failed to prepare audio payload: {error}"))?;
    let form = reqwest::blocking::multipart::Form::new()
        .part("file", audio_part)
        .text("model", model.clone())
        .text("response_format", "json");
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("failed to create transcription client: {error}"))?
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

    let parsed: TranscriptionResponse = serde_json::from_str(&body)
        .map_err(|error| format!("failed to parse transcription response: {error}"))?;
    let text = parsed.text.trim().to_string();

    if text.is_empty() {
        return Err("transcription provider returned an empty transcript".to_string());
    }

    Ok((model, text))
}

fn main() -> Result<(), String> {
    println!("TouchPilot voice transcription probe");
    println!();

    let (wav_bytes, sample_rate, channels, device_name, samples, peak) = record_audio()?;

    println!(
        "[PASS] microphone captured - device={device_name}, samples={samples}, peak={peak:.4}, wav_bytes={}",
        wav_bytes.len()
    );

    let (model, text) = transcribe_audio(wav_bytes)?;

    println!("[PASS] transcription - model={model}, sample_rate={sample_rate}, channels={channels}");
    println!("Transcript: {text}");

    Ok(())
}
