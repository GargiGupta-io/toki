import assert from "node:assert/strict";
import test from "node:test";
import {
  collectMacVisionOcrCandidates,
  normalizeVisionOcrCandidate,
  parseVisionOcrOutput,
} from "./macos-vision-ocr-candidates.mjs";

test("normalizeVisionOcrCandidate converts Vision boxes to CSS pixels", () => {
  assert.deepEqual(
    normalizeVisionOcrCandidate(
      {
        text: "Manage",
        x: 0.5,
        y: 0.1,
        width: 0.2,
        height: 0.05,
      },
      0,
      {
        imageWidth: 2880,
        imageHeight: 1800,
        displayWidth: 1440,
        displayHeight: 900,
        scaleFactor: 2,
      },
    ),
    {
      id: "ocr-manage-1",
      label: "Manage",
      role: "ocr_text",
      x: 720,
      y: 765,
      width: 288,
      height: 45,
    },
  );
});

test("normalizeVisionOcrCandidate rejects invalid text and offscreen boxes", () => {
  assert.equal(
    normalizeVisionOcrCandidate(
      { text: "", x: 0.5, y: 0.5, width: 0.2, height: 0.05 },
      0,
      { imageWidth: 2880, imageHeight: 1800, scaleFactor: 2 },
    ),
    null,
  );
  assert.equal(
    normalizeVisionOcrCandidate(
      { text: "Offscreen", x: 0.95, y: 0.5, width: 0.2, height: 0.05 },
      0,
      {
        imageWidth: 2880,
        imageHeight: 1800,
        displayWidth: 1440,
        displayHeight: 900,
        scaleFactor: 2,
      },
    ),
    null,
  );
});

test("parseVisionOcrOutput normalizes OCR items", () => {
  const candidates = parseVisionOcrOutput(
    JSON.stringify({
      imageWidth: 2880,
      imageHeight: 1800,
      items: [
        {
          text: "Search",
          x: 0.1,
          y: 0.8,
          width: 0.2,
          height: 0.05,
        },
        {
          text: "",
          x: 0.2,
          y: 0.2,
          width: 0.1,
          height: 0.04,
        },
      ],
    }),
    {
      displayWidth: 1440,
      displayHeight: 900,
      scaleFactor: 2,
    },
  );

  assert.deepEqual(candidates, [
    {
      id: "ocr-search-1",
      label: "Search",
      role: "ocr_text",
      x: 144,
      y: 135,
      width: 288,
      height: 45,
    },
  ]);
});

test("collectMacVisionOcrCandidates calls swift on macOS", async () => {
  const calls = [];
  const result = await collectMacVisionOcrCandidates({
    platform: "darwin",
    imagePath: "/tmp/screen.png",
    displayWidth: 1440,
    displayHeight: 900,
    scaleFactor: 2,
    execFileImpl: async (command, args) => {
      calls.push({ command, args });

      return {
        stdout: JSON.stringify({
          imageWidth: 2880,
          imageHeight: 1800,
          items: [
            {
              text: "Download",
              x: 0.7,
              y: 0.2,
              width: 0.1,
              height: 0.05,
            },
          ],
        }),
      };
    },
  });

  assert.equal(calls[0].command, "/usr/bin/swift");
  assert.match(calls[0].args[0], /VisionOcr\.swift$/);
  assert.equal(calls[0].args[1], "/tmp/screen.png");
  assert.equal(result.source, "macos-vision-ocr");
  assert.equal(result.candidates[0].label, "Download");
});

test("collectMacVisionOcrCandidates returns empty on non-Mac platforms", async () => {
  const result = await collectMacVisionOcrCandidates({
    platform: "linux",
    imagePath: "/tmp/screen.png",
  });

  assert.equal(result.source, "unsupported");
  assert.deepEqual(result.candidates, []);
  assert.match(result.error, /darwin/);
});
