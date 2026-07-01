import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_OCR_CANDIDATES = 40;
const MIN_OCR_CANDIDATE_SIZE = 4;
const DEFAULT_SWIFT_PATH = "/usr/bin/swift";

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function slugCandidateId(label, index) {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug.length > 0 ? `ocr-${slug}-${index + 1}` : `ocr-candidate-${index + 1}`;
}

function createVisionOcrSwiftSource() {
  return `
import AppKit
import ImageIO
import Foundation
import Vision

struct OcrItem: Encodable {
  let text: String
  let confidence: Float
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
  fputs("image path is required\\n", stderr)
  exit(2)
}

let imagePath = arguments[1]
let imageUrl = URL(fileURLWithPath: imagePath)

guard let imageSource = CGImageSourceCreateWithURL(imageUrl as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
  fputs("could not decode image\\n", stderr)
  exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])

do {
  try handler.perform([request])
} catch {
  fputs("vision text recognition failed: \\(error)\\n", stderr)
  exit(2)
}

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
    confidence: candidate.confidence,
    x: box.origin.x,
    y: box.origin.y,
    width: box.size.width,
    height: box.size.height
  )
}

let payload = OcrPayload(
  imageWidth: cgImage.width,
  imageHeight: cgImage.height,
  items: items
)
let data = try JSONEncoder().encode(payload)
print(String(data: data, encoding: .utf8)!)
`;
}

export function normalizeVisionOcrCandidate(item, index, options = {}) {
  if (item == null || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const label = normalizeText(item.text ?? item.label);

  if (label.length === 0) {
    return null;
  }

  const imageWidth = Number(options.imageWidth);
  const imageHeight = Number(options.imageHeight);
  const scaleFactor = Number(options.scaleFactor ?? 1);

  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !Number.isFinite(scaleFactor) ||
    scaleFactor <= 0
  ) {
    return null;
  }

  const normalizedX = Number(item.x);
  const normalizedY = Number(item.y);
  const normalizedWidth = Number(item.width);
  const normalizedHeight = Number(item.height);

  if (
    !Number.isFinite(normalizedX) ||
    !Number.isFinite(normalizedY) ||
    !Number.isFinite(normalizedWidth) ||
    !Number.isFinite(normalizedHeight) ||
    normalizedWidth <= 0 ||
    normalizedHeight <= 0
  ) {
    return null;
  }

  const x = (normalizedX * imageWidth) / scaleFactor;
  const y = ((1 - normalizedY - normalizedHeight) * imageHeight) / scaleFactor;
  const width = (normalizedWidth * imageWidth) / scaleFactor;
  const height = (normalizedHeight * imageHeight) / scaleFactor;

  if (
    width < MIN_OCR_CANDIDATE_SIZE ||
    height < MIN_OCR_CANDIDATE_SIZE ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }

  const displayWidth = Number(options.displayWidth);
  const displayHeight = Number(options.displayHeight);

  if (
    Number.isFinite(displayWidth) &&
    Number.isFinite(displayHeight) &&
    (x < 0 || y < 0 || x + width > displayWidth || y + height > displayHeight)
  ) {
    return null;
  }

  return {
    id: slugCandidateId(label, index),
    label,
    role: "ocr_text",
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function parseVisionOcrOutput(stdout, options = {}) {
  const parsed = JSON.parse(stdout);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const imageWidth = Number(options.imageWidth ?? parsed.imageWidth);
  const imageHeight = Number(options.imageHeight ?? parsed.imageHeight);

  return items
    .map((item, index) =>
      normalizeVisionOcrCandidate(item, index, {
        ...options,
        imageWidth,
        imageHeight,
      }),
    )
    .filter(Boolean)
    .slice(0, MAX_OCR_CANDIDATES);
}

export async function collectMacVisionOcrCandidates(options = {}) {
  const platform = options.platform ?? process.platform;

  if (platform !== "darwin") {
    return {
      source: "unsupported",
      candidates: [],
      error: "macOS Vision OCR candidates are only available on darwin",
    };
  }

  const imagePath = normalizeText(options.imagePath);

  if (imagePath.length === 0) {
    return {
      source: "macos-vision-ocr",
      candidates: [],
      error: "imagePath is required for macOS Vision OCR candidates",
    };
  }

  const execFileImpl = options.execFileImpl ?? execFileAsync;
  const swiftPath = options.swiftPath ?? DEFAULT_SWIFT_PATH;
  const tempRoot = await mkdtemp(join(tmpdir(), "toki-vision-ocr-"));
  const scriptPath = join(tempRoot, "VisionOcr.swift");

  try {
    await writeFile(scriptPath, createVisionOcrSwiftSource(), "utf8");

    const result = await execFileImpl(swiftPath, [scriptPath, imagePath], {
      timeout: options.timeoutMs ?? 20000,
      maxBuffer: 1024 * 1024,
    });
    const stdout = typeof result === "string" ? result : result.stdout;
    const candidates = parseVisionOcrOutput(stdout, options);

    return {
      source: "macos-vision-ocr",
      candidates,
      error: candidates.length === 0 ? "macOS Vision OCR returned no candidates" : undefined,
    };
  } catch (error) {
    const stderr =
      error != null && typeof error === "object" && typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    const message = error instanceof Error ? error.message : String(error);

    return {
      source: "macos-vision-ocr",
      candidates: [],
      error: stderr.length > 0 ? `${message}: ${stderr}` : message,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
