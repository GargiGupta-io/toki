import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { collectMacAccessibilityCandidates } from "./macos-accessibility-candidates.mjs";

const DEFAULT_ENDPOINT = "http://127.0.0.1:8787/api/guidance/smoke";
const DEFAULT_GOAL = "Show me what to click next.";

function getRequiredEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function getNumberEnv(name, fallback) {
  const raw = process.env[name];

  if (raw == null || raw.trim().length === 0) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

function getPngSize(buffer) {
  const signature = "89504e470d0a1a0a";

  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    return null;
  }

  return {
    format: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getJpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof) {
      return {
        format: "jpeg",
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function getImageSize(buffer) {
  const size = getPngSize(buffer) ?? getJpegSize(buffer);

  if (size == null) {
    throw new Error("known-screen image must be a PNG or JPEG");
  }

  return size;
}

function parseKnownScreenCandidates() {
  const raw = process.env.TOKI_KNOWN_SCREEN_CANDIDATES?.trim();

  if (raw == null || raw.length === 0) {
    return [];
  }

  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("TOKI_KNOWN_SCREEN_CANDIDATES must be a JSON array");
  }

  return parsed.map((candidate, index) => ({
    id:
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id.trim()
        : `candidate-${index + 1}`,
    label:
      typeof candidate.label === "string" && candidate.label.trim().length > 0
        ? candidate.label.trim()
        : `Candidate ${index + 1}`,
    role:
      typeof candidate.role === "string" && candidate.role.trim().length > 0
        ? candidate.role.trim()
        : "unknown",
    x: Number(candidate.x),
    y: Number(candidate.y),
    width: Number(candidate.width),
    height: Number(candidate.height),
  }));
}

async function resolveKnownScreenCandidates({ displayWidth, displayHeight }) {
  const explicitCandidates = parseKnownScreenCandidates();

  if (explicitCandidates.length > 0) {
    return {
      source: "env",
      candidates: explicitCandidates,
    };
  }

  if (process.env.TOKI_KNOWN_SCREEN_AUTO_CANDIDATES === "0") {
    return {
      source: "disabled",
      candidates: [],
    };
  }

  return collectMacAccessibilityCandidates({
    appName:
      process.env.TOKI_KNOWN_SCREEN_APP_NAME ??
      process.env.TOKI_ACCESSIBILITY_APP_NAME,
    displayWidth,
    displayHeight,
  });
}

async function createGuidanceRequest({ imagePath, image, size }) {
  const scaleFactor = getNumberEnv("TOKI_KNOWN_SCREEN_SCALE", 1);
  const displayWidth = getNumberEnv(
    "TOKI_KNOWN_SCREEN_DISPLAY_WIDTH",
    Math.round(size.width / scaleFactor),
  );
  const displayHeight = getNumberEnv(
    "TOKI_KNOWN_SCREEN_DISPLAY_HEIGHT",
    Math.round(size.height / scaleFactor),
  );
  const candidateResult = await resolveKnownScreenCandidates({
    displayWidth,
    displayHeight,
  });

  const request = {
    goal: process.env.TOKI_KNOWN_SCREEN_GOAL?.trim() || DEFAULT_GOAL,
    screen: {
      display: {
        id: process.env.TOKI_KNOWN_SCREEN_DISPLAY_ID ?? "known-screen",
        width: displayWidth,
        height: displayHeight,
        scaleFactor,
      },
      screenshot: {
        source: `known_screen:${basename(imagePath)}`,
        display: {
          id: process.env.TOKI_KNOWN_SCREEN_DISPLAY_ID ?? "known-screen",
          width: displayWidth,
          height: displayHeight,
          scaleFactor,
        },
        capturedAt: new Date().toISOString(),
        format: size.format === "jpeg" ? "jpg" : "png",
        byteLength: image.byteLength,
        imageWidth: size.width,
        imageHeight: size.height,
      },
      screenshotPayload: {
        encoding: "base64",
        format: size.format === "jpeg" ? "jpg" : "png",
        byteLength: image.byteLength,
        imageWidth: size.width,
        imageHeight: size.height,
        imageBase64: image.toString("base64"),
      },
      calibration: {
        status: "aligned",
        overlayWidth: displayWidth,
        overlayHeight: displayHeight,
        displayWidth,
        displayHeight,
        scaleFactor,
        notes:
          "Known-screen smoke fixture. Display coordinates are derived from image size and scale env.",
      },
    },
  };

  if (candidateResult.candidates.length > 0) {
    request.screen.candidates = candidateResult.candidates;
  }

  return {
    request,
    candidateResult,
  };
}

function printGuidanceResponse(response) {
  console.log("Toki known-screen guidance smoke");
  console.log("");
  console.log(`Provider mode: ${response.mode}`);
  console.log(`Provider: ${response.providerName ?? "unknown"}`);

  if (response.mode !== "real") {
    console.log(`Error: ${response.error ?? "provider did not return real guidance"}`);

    if (Array.isArray(response.validation?.issues) && response.validation.issues.length > 0) {
      console.log("");
      console.log("Validation issues:");

      for (const issue of response.validation.issues) {
        console.log(`- ${issue.path}: ${issue.message}`);
      }
    }

    if (typeof response.providerRawText === "string" && response.providerRawText.length > 0) {
      console.log("");
      console.log("Provider raw output:");
      console.log(response.providerRawText);
    }

    process.exitCode = 2;
    return;
  }

  const step = response.result?.step;
  const target = step?.target;

  console.log(`Summary: ${response.result?.summary ?? "None"}`);
  console.log(`Instruction: ${step?.instruction ?? "None"}`);
  console.log(`Confidence: ${step?.confidence ?? "None"}`);
  console.log(`Risk: ${step?.risk ?? "None"}`);
  console.log(`Requires confirmation: ${step?.requiresConfirmation ?? "None"}`);

  if (target != null) {
    console.log(
      `Target: ${target.label} at ${target.x},${target.y} ${target.width}x${target.height}`,
    );
  } else {
    console.log("Target: None");
  }

  console.log("");
  console.log("Manual verdict: compare the target with the known screen and mark useful or wrong in Debug.");
}

async function main() {
  const endpoint =
    process.env.TOKI_GUIDANCE_ENDPOINT?.trim() ||
    process.env.VITE_TOKI_GUIDANCE_ENDPOINT?.trim() ||
    DEFAULT_ENDPOINT;
  const imagePath = getRequiredEnv("TOKI_KNOWN_SCREEN_IMAGE");
  const image = await readFile(imagePath);
  const size = getImageSize(image);
  const { request, candidateResult } = await createGuidanceRequest({
    imagePath,
    image,
    size,
  });

  if (candidateResult.source !== "disabled") {
    console.log(`Candidate source: ${candidateResult.source}`);
  }

  if (typeof candidateResult.error === "string" && candidateResult.error.length > 0) {
    console.log(`Candidate warning: ${candidateResult.error}`);
  }

  if (Array.isArray(request.screen.candidates)) {
    console.log(`Known-screen candidates: ${request.screen.candidates.length}`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`guidance endpoint returned ${response.status}: ${JSON.stringify(body)}`);
  }

  printGuidanceResponse(body);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
