import assert from "node:assert/strict";
import test from "node:test";
import { requestCodexVisionGuidance } from "../apps/desktop/src/codexVisionProvider.ts";
import {
  createVisionGuidanceResponse,
  createVisionLocalizationPrompt,
  parseVisionTargetResponse,
  resolveVisionTargetToDisplay,
} from "../apps/desktop/src/visionGuidanceContract.ts";

function createRequest() {
  return {
    goal: "Create a playlist",
    localization: {
      planId: "plan-1",
      originalGoal: "Create a playlist and add a song",
      currentStepId: "step-1",
      currentStepIndex: 0,
      totalSteps: 2,
      objective: "Create a playlist",
    },
    screen: {
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 2,
      },
      screenshot: {
        source: "full_screen",
        display: {
          id: "display-1",
          width: 1440,
          height: 900,
          scaleFactor: 2,
        },
        capturedAt: "2026-07-15T00:00:00.000Z",
        format: "png",
        byteLength: 100,
        imageWidth: 2880,
        imageHeight: 1800,
      },
      screenshotPayload: {
        encoding: "base64",
        format: "png",
        byteLength: 100,
        imageWidth: 1000,
        imageHeight: 700,
        imageBase64: "aW1hZ2U=",
        crop: {
          source: "active_window",
          appName: "Spotify",
          title: "Spotify",
          x: 200,
          y: 100,
          width: 2000,
          height: 1400,
        },
      },
      candidates: [
        {
          id: "create-playlist",
          label: "Create playlist",
          role: "accessibility_element",
          source: "accessibility",
          x: 260,
          y: 180,
          width: 120,
          height: 44,
          rank: {
            score: 95,
            reasons: ["goal object match"],
          },
        },
      ],
    },
  };
}

test("vision prompt keeps the current step and candidate evidence explicit", () => {
  const prompt = createVisionLocalizationPrompt(createRequest());

  assert.match(prompt, /Original task: Create a playlist and add a song/);
  assert.match(prompt, /Current step objective: Create a playlist/);
  assert.match(prompt, /create-playlist/);
  assert.match(prompt, /Do not invent candidate ids/);
  assert.match(prompt, /Do not use tools/);
  assert.match(prompt, /candidates are optional supporting evidence, not a requirement/);
  assert.match(prompt, /use an empty candidate id/);
  assert.match(prompt, /confidence at or above 0\.72/);
  assert.doesNotMatch(prompt, /must still be spatially supported by a current candidate/);
});

test("vision response parser accepts plain and fenced JSON", () => {
  const expected = {
    target: null,
    confidence: 0.1,
    reason: "No supported control",
    risk: "safe_navigation",
  };

  assert.deepEqual(parseVisionTargetResponse(JSON.stringify(expected)), expected);
  assert.deepEqual(
    parseVisionTargetResponse(`\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``),
    expected,
  );
});

test("candidate-backed targets use current verified geometry", () => {
  const request = createRequest();
  const mapped = resolveVisionTargetToDisplay(
    {
      candidateId: "create-playlist",
      centerX: 10,
      centerY: 20,
      width: 1,
      height: 1,
      label: "Create playlist",
    },
    request,
  );

  assert.equal(mapped.debug.coordinateMode, "candidate");
  assert.deepEqual(mapped.target, {
    candidateId: "create-playlist",
    label: "Create playlist",
    x: 260,
    y: 180,
    width: 120,
    height: 44,
  });
});

test("normalized provider response preserves raw output and the common mode", () => {
  const rawAnswer = JSON.stringify({
    target: {
      candidateId: "create-playlist",
      centerX: 90,
      centerY: 90,
      width: 60,
      height: 30,
      label: "Create playlist",
    },
    confidence: 0.94,
    reason: "Matches the requested action and object.",
    risk: "safe_navigation",
  });
  const response = createVisionGuidanceResponse(
    rawAnswer,
    createRequest(),
    "codex-subscription:test",
    "codex-subscription",
  );

  assert.equal(response.mode, "codex-subscription");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.target.candidateId, "create-playlist");
  assert.equal(response.debug.providerOutput.rawAnswer, rawAnswer);
});

test("permission-change guidance remains valid and shows without a confirmation gate", () => {
  const rawAnswer = JSON.stringify({
    target: {
      candidateId: "",
      centerX: 524,
      centerY: 483,
      width: 46,
      height: 45,
      label: "Invite collaborators",
    },
    confidence: 0.96,
    reason: "The visible person-with-plus icon invites collaborators.",
    risk: "permission_change",
  });
  const response = createVisionGuidanceResponse(
    rawAnswer,
    createRequest(),
    "codex-subscription:test",
    "codex-subscription",
  );

  assert.equal(response.mode, "codex-subscription");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.risk, "permission_change");
  assert.equal(response.result.step.requiresConfirmation, false);
});

test("payment guidance is normalized behind a target-reveal acknowledgment", () => {
  const rawAnswer = JSON.stringify({
    target: {
      candidateId: "",
      centerX: 524,
      centerY: 483,
      width: 90,
      height: 45,
      label: "Pay now",
    },
    confidence: 0.96,
    reason: "The visible Pay now button submits payment.",
    risk: "payment",
  });
  const response = createVisionGuidanceResponse(
    rawAnswer,
    createRequest(),
    "codex-subscription:test",
    "codex-subscription",
  );

  assert.equal(response.mode, "codex-subscription");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.risk, "payment");
  assert.equal(response.result.step.requiresConfirmation, true);
});

test("Codex adapter sends image, prompt, and strict output schema to native runtime", async () => {
  const calls = [];
  const response = await requestCodexVisionGuidance(createRequest(), {
    model: "test-model",
    timeoutMs: 8_000,
    invokeImpl: async (command, args) => {
      calls.push({ command, args });
      return {
        rawAnswer: JSON.stringify({
          target: {
            candidateId: "create-playlist",
            centerX: 90,
            centerY: 90,
            width: 60,
            height: 30,
            label: "Create playlist",
          },
          confidence: 0.91,
          reason: "Exact candidate match.",
          risk: "safe_navigation",
        }),
        providerName: "codex-subscription:test-model",
        durationMs: 1200,
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "request_codex_vision_guidance");
  assert.equal(calls[0].args.request.imageBase64, "aW1hZ2U=");
  assert.equal(calls[0].args.request.imageFormat, "png");
  assert.equal(calls[0].args.request.timeoutMs, 8_000);
  assert.equal(calls[0].args.request.model, "test-model");
  assert.equal(JSON.parse(calls[0].args.request.outputSchema).type, "object");
  assert.equal(response.mode, "codex-subscription");
});

test("Codex adapter fails closed when native execution fails", async () => {
  const response = await requestCodexVisionGuidance(createRequest(), {
    invokeImpl: async () => {
      throw new Error("provider timed out");
    },
  });

  assert.equal(response.mode, "unavailable");
  assert.match(response.error, /timed out/);
  assert.equal(response.result, undefined);
});
