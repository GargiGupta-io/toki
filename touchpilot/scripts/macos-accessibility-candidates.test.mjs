import assert from "node:assert/strict";
import test from "node:test";
import {
  collectMacAccessibilityCandidates,
  normalizeAccessibilityCandidate,
  parseMacAccessibilityOutput,
} from "./macos-accessibility-candidates.mjs";

test("normalizeAccessibilityCandidate keeps valid UI boxes", () => {
  assert.deepEqual(
    normalizeAccessibilityCandidate(
      {
        label: "Search",
        role: "AXTextField",
        x: 120,
        y: 80,
        width: 240,
        height: 40,
      },
      0,
      { displayWidth: 1440, displayHeight: 900 },
    ),
    {
      id: "ax-search-1",
      label: "Search",
      role: "AXTextField",
      x: 120,
      y: 80,
      width: 240,
      height: 40,
    },
  );
});

test("normalizeAccessibilityCandidate rejects unlabeled and offscreen boxes", () => {
  assert.equal(
    normalizeAccessibilityCandidate(
      { x: 120, y: 80, width: 240, height: 40 },
      0,
      { displayWidth: 1440, displayHeight: 900 },
    ),
    null,
  );
  assert.equal(
    normalizeAccessibilityCandidate(
      {
        label: "Search",
        x: 1400,
        y: 80,
        width: 240,
        height: 40,
      },
      0,
      { displayWidth: 1440, displayHeight: 900 },
    ),
    null,
  );
});

test("parseMacAccessibilityOutput normalizes candidate output", () => {
  const candidates = parseMacAccessibilityOutput(
    JSON.stringify({
      appName: "Safari",
      candidates: [
        {
          label: "Manage",
          role: "AXButton",
          x: 400,
          y: 300,
          width: 120,
          height: 44,
        },
        {
          label: "",
          role: "AXGroup",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    }),
    { displayWidth: 1440, displayHeight: 900 },
  );

  assert.deepEqual(candidates, [
    {
      id: "ax-manage-1",
      label: "Manage",
      role: "AXButton",
      x: 400,
      y: 300,
      width: 120,
      height: 44,
    },
  ]);
});

test("collectMacAccessibilityCandidates calls osascript on macOS", async () => {
  const calls = [];
  const result = await collectMacAccessibilityCandidates({
    platform: "darwin",
    appName: "Safari",
    displayWidth: 1440,
    displayHeight: 900,
    execFileImpl: async (command, args) => {
      calls.push({ command, args });

      return {
        stdout: JSON.stringify({
          appName: "Safari",
          candidates: [
            {
              label: "Search",
              role: "AXTextField",
              x: 120,
              y: 80,
              width: 240,
              height: 40,
            },
          ],
        }),
      };
    },
  });

  assert.equal(calls[0].command, "osascript");
  assert.deepEqual(calls[0].args.slice(0, 2), ["-l", "JavaScript"]);
  assert.equal(result.source, "macos-accessibility");
  assert.equal(result.candidates[0].label, "Search");
});

test("collectMacAccessibilityCandidates returns empty on non-Mac platforms", async () => {
  const result = await collectMacAccessibilityCandidates({ platform: "linux" });

  assert.equal(result.source, "unsupported");
  assert.deepEqual(result.candidates, []);
  assert.match(result.error, /darwin/);
});
