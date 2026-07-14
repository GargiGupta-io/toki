import assert from "node:assert/strict";
import test from "node:test";

import {
  createOllamaLocalizationPrompt,
  requestOllamaVisionGuidance,
  resolveOllamaTargetToDisplay,
} from "../apps/desktop/src/ollamaVisionProvider.ts";
import { verifyGuidanceTarget } from "../apps/desktop/src/targetVerification.ts";

function createRequest() {
  return {
    traceId: "candidate-selection-test",
    goal: "Create a new playlist",
    localization: {
      originalGoal: "Create a new playlist",
      objective: "Open the create playlist control",
      planId: "plan-1",
      stepIndex: 0,
      stepCount: 1,
    },
    screen: {
      display: { width: 1200, height: 800 },
      screenshot: {
        imageWidth: 2400,
        imageHeight: 1600,
      },
      screenshotPayload: {
        encoding: "base64",
        format: "jpeg",
        byteLength: 100,
        imageWidth: 1000,
        imageHeight: 700,
        imageBase64: "fixture",
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
          id: "ax-create-playlist",
          label: "Create playlist",
          role: "button",
          source: "accessibility",
          x: 120,
          y: 180,
          width: 40,
          height: 36,
          rank: {
            score: 96,
            reasons: ["intent-action-match:create"],
          },
        },
      ],
    },
  };
}

test("prompt exposes stable candidate ids and candidate-first rules", () => {
  const prompt = createOllamaLocalizationPrompt(createRequest());

  assert.match(prompt, /id "ax-create-playlist"/);
  assert.match(prompt, /copy its candidate id into target\.candidateId exactly/);
  assert.match(prompt, /Do not invent a candidate id/);
});

test("candidate-backed target keeps the verified candidate center", () => {
  const request = createRequest();
  const result = resolveOllamaTargetToDisplay(
    {
      candidateId: "ax-create-playlist",
      label: "plus icon",
    },
    request,
  );

  assert.equal(result.target.candidateId, "ax-create-playlist");
  assert.equal(result.target.x + result.target.width / 2, 140);
  assert.equal(result.target.y + result.target.height / 2, 198);
  assert.equal(result.debug.coordinateMode, "candidate");
  assert.deepEqual(result.debug.mappedBeforeTighten, {
    candidateId: "ax-create-playlist",
    label: "Create playlist",
    x: 120,
    y: 180,
    width: 40,
    height: 36,
  });
});

test("candidate-backed provider output survives target verification", () => {
  const request = createRequest();
  const mapped = resolveOllamaTargetToDisplay(
    {
      candidateId: "ax-create-playlist",
      label: "plus icon",
    },
    request,
  );
  const verified = verifyGuidanceTarget(
    {
      mode: "ollama-vision",
      providerName: "ollama-vision:test",
      result: {
        mode: "guide",
        summary: "Create a new playlist",
        step: {
          instruction: "Click Create playlist.",
          target: mapped.target,
          confidence: 0.9,
          risk: "safe_navigation",
          requiresConfirmation: false,
        },
      },
      validation: { valid: true, issues: [] },
      debug: { vision: mapped.debug },
    },
    request,
  );

  assert.equal(verified.mode, "ollama-vision");
  assert.equal(verified.result.step.target.candidateId, "ax-create-playlist");
  assert.equal(verified.result.step.target.x + verified.result.step.target.width / 2, 140);
  assert.equal(verified.result.step.target.y + verified.result.step.target.height / 2, 198);
  assert.equal(verified.debug.targetVerification.match, "candidate_id");
  assert.equal(verified.debug.targetVerification.source, "accessibility");
});

test("invented candidate ids are rejected", () => {
  assert.throws(
    () =>
      resolveOllamaTargetToDisplay(
        {
          candidateId: "invented-control",
          label: "Create playlist",
        },
        createRequest(),
      ),
    /not present in the current screen evidence/,
  );
});

test("visual-only targets retain coordinate mapping fallback", () => {
  const result = resolveOllamaTargetToDisplay(
    {
      centerX: 500,
      centerY: 350,
      width: 40,
      height: 40,
      label: "unlabeled icon",
    },
    createRequest(),
  );

  assert.equal(result.target.candidateId, "ollama-vision-target");
  assert.equal(result.debug.coordinateMode, "center");
  assert.equal(result.target.x + result.target.width / 2, 600);
  assert.equal(result.target.y + result.target.height / 2, 400);
});

test("Ollama requests reserve enough context for production-shaped prompts", async () => {
  let capturedBody;

  const result = await requestOllamaVisionGuidance(createRequest(), {
    model: "test-model",
    timeoutMs: 1_000,
    fetchImpl: async (_url, init) => {
      assert.ok(init?.body);
      capturedBody = JSON.parse(String(init.body));

      return new Response(
        JSON.stringify({
          response: JSON.stringify({
            target: {
              candidateId: "ax-create-playlist",
              centerX: 0,
              centerY: 0,
              width: 0,
              height: 0,
              label: "Create playlist",
            },
            confidence: 0.9,
            reason: "Create playlist control",
            risk: "safe_navigation",
          }),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.equal(capturedBody.options.num_ctx, 8_192);
  assert.equal(capturedBody.options.num_predict, 512);
  assert.equal(result.mode, "ollama-vision");
});

test("Ollama errors retain the provider response detail", async () => {
  const result = await requestOllamaVisionGuidance(createRequest(), {
    model: "test-model",
    timeoutMs: 1_000,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: JSON.stringify({
            error: {
              type: "exceed_context_size_error",
              message: "request exceeds the available context size",
            },
          }),
        }),
        { status: 400, statusText: "Bad Request" },
      ),
  });

  assert.equal(result.mode, "unavailable");
  assert.match(
    result.error,
    /exceed_context_size_error|exceeds the available context size/,
  );
  assert.doesNotMatch(result.error, /Install\/start Ollama/);
});
