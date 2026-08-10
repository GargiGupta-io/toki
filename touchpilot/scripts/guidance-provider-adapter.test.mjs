import assert from "node:assert/strict";
import test from "node:test";

import { createGuidanceProviderAdapter } from "../apps/desktop/src/guidanceProvider.ts";

// Enough of a request for the hosted path to actually run: without a
// screenshot payload it declines before sending anything, and a test asserting
// "the model was asked" would pass or fail for the wrong reason.
const request = {
  goal: "create a playlist",
  screen: {
    display: { id: "d1", width: 1440, height: 900, scaleFactor: 2 },
    screenshot: {
      source: "full_screen",
      display: { id: "d1", width: 1440, height: 900, scaleFactor: 2 },
      capturedAt: "2026-08-05T00:00:00.000Z",
      format: "png",
      byteLength: 1024,
      imageWidth: 2880,
      imageHeight: 1800,
    },
    screenshotPayload: {
      encoding: "base64",
      format: "png",
      byteLength: 1024,
      imageWidth: 2880,
      imageHeight: 1800,
      imageBase64: "iVBORw0KGgo=",
    },
    calibration: {
      status: "aligned",
      overlayWidth: 1440,
      overlayHeight: 900,
      displayWidth: 1440,
      displayHeight: 900,
      scaleFactor: 2,
    },
  },
};

function unavailable(error = "no confident local match") {
  return { mode: "unavailable", error, providerName: "local-candidates" };
}

function answered(label, providerName = "local-candidates") {
  return {
    mode: "real",
    providerName,
    result: {
      mode: "guide",
      summary: `Selected ${label}.`,
      step: {
        instruction: `Click ${label}.`,
        target: { label, x: 10, y: 10, width: 20, height: 20 },
        confidence: 0.9,
        risk: "safe_navigation",
        requiresConfirmation: false,
      },
    },
  };
}

test("a local answer that verifies is used, and no screenshot is sent", async () => {
  // The whole point of the local pass: when it is right, it costs nothing and
  // nothing leaves the machine.
  let visionCalls = 0;
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => answered("Create playlist"),
    verify: (response) => response,
    hostedVision: {
      send: async () => {
        visionCalls += 1;
        return { kind: "ok", rawAnswer: "{}" };
      },
    },
  });

  const response = await adapter.request(request);

  assert.equal(response.providerName, "local-candidates");
  assert.equal(visionCalls, 0);
});

test("a local answer that fails verification falls through to vision", async () => {
  // This is the one that bit. Verification ran only after the adapter returned,
  // so a rejected local answer ended the request outright -- guidance blocked in
  // about a second, having never asked the one thing that can see the screen.
  let visionCalls = 0;
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => answered("+"),
    verify: (response) =>
      response.providerName === "local-candidates"
        ? {
            ...response,
            mode: "unavailable",
            result: undefined,
            error:
              "Target verification failed: current evidence does not match the requested object collection",
          }
        : response,
    hostedVision: {
      send: async () => {
        visionCalls += 1;
        return {
          kind: "ok",
          providerName: "claude-cli-dev",
          rawAnswer: JSON.stringify({
            target: {
              candidateId: "",
              label: "Playlist",
              centerX: 60,
              centerY: 200,
              width: 40,
              height: 40,
            },
            confidence: 0.9,
            reason: "The Playlist row in the menu that just opened.",
          }),
        };
      },
    },
  });

  const response = await adapter.request(request);

  assert.equal(visionCalls, 1, "the model is asked when the local pass is refused");
  assert.notEqual(
    response.error,
    "Target verification failed: current evidence does not match the requested object collection",
    "the local pass's rejection is not returned as the answer",
  );
});

test("without a verifier the local answer is still used", async () => {
  // Callers that do not verify keep the behaviour they had.
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => answered("Create playlist"),
    hostedVision: {
      send: async () => assert.fail("must not be reached"),
    },
  });

  const response = await adapter.request(request);

  assert.equal(response.providerName, "local-candidates");
});

test("an unavailable local pass is never handed to the verifier", async () => {
  // There is nothing to verify, and running the check on an empty response
  // would only invent a second reason for the same absence.
  let verifierCalls = 0;
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    verify: (response) => {
      verifierCalls += 1;
      return response;
    },
    hostedVision: {
      send: async () => ({
        kind: "ok",
        providerName: "claude-cli-dev",
        rawAnswer: JSON.stringify({
          target: {
            candidateId: "",
            label: "Playlist",
            centerX: 60,
            centerY: 200,
            width: 40,
            height: 40,
          },
          confidence: 0.9,
          reason: "The Playlist row in the menu.",
        }),
      }),
    },
  });

  await adapter.request(request);

  assert.equal(verifierCalls, 0);
});

/*
 * The order the three routes are tried in.
 *
 * There used to be a developer CLI here, which skipped both the free local
 * pass and the hosted service and went straight to a tool no user had
 * installed. These tests pin the replacement order so the same class of
 * mistake cannot come back quietly.
 */

test("a configured service is preferred over asking the model directly", async () => {
  // A shipping build must never bypass its own service: the service is what
  // holds the entitlement check, and what keeps the key off the user's machine.
  let hostedAsked = false;

  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    hostedVision: {
      send: async () => {
        hostedAsked = true;
        return { kind: "error", error: "service said no" };
      },
    },
    gemini: {
      invokeImpl: () => assert.fail("the model must not be asked directly"),
    },
  });

  await adapter.request(request);

  assert.equal(hostedAsked, true);
});

test("with nothing configured the model is asked directly", async () => {
  // The local development path now that the CLI is gone. Same model, same
  // schema, billed to the person's own free key.
  const calls = [];

  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    gemini: {
      invokeImpl: async (command, args) => {
        calls.push({ command, args });
        return {
          rawAnswer: JSON.stringify({
            target: { label: "Create playlist", x: 700, y: 300, width: 120, height: 32 },
            confidence: 0.9,
            reason: "the button says so",
            risk: "safe_navigation",
          }),
          providerName: "gemini:test",
          durationMs: 12,
        };
      },
    },
  });

  const response = await adapter.request(request);

  assert.equal(calls[0].command, "request_gemini_vision_guidance");
  assert.equal(response.mode, "gemini");

  // The schema travels with it. Every guidance failure worth debugging in this
  // app came from a model answering correctly in the wrong shape.
  assert.match(calls[0].args.request.outputSchema, /"required"/u);
});

test("the local pass still runs before anything is sent anywhere", async () => {
  // Free, offline, and usually right. Sending a screenshot for something that
  // could be answered on this machine is the expensive mistake.
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => answered("Create playlist"),
    verify: (response) => response,
    gemini: {
      invokeImpl: () => assert.fail("nothing should have been sent"),
    },
  });

  const response = await adapter.request(request);

  assert.equal(response.result.step.target.label, "Create playlist");
});

/*
 * A service that cannot answer, versus one that will not.
 *
 * The router used to stop at the service whatever it said, on the reasoning
 * that a shipping build must never bypass its own service. That is right about
 * refusals and wrong about failures: a deployed service with no vision
 * credentials configured reported "Toki has no vision credentials" to somebody
 * with a perfectly good key sitting in their Keychain, unused.
 */

function hostedSaying(reply) {
  return { send: async () => reply };
}

function geminiAnswering(calls) {
  return {
    invokeImpl: async (command, args) => {
      calls.push({ command, args });
      return {
        rawAnswer: JSON.stringify({
          target: { label: "Export CSV", x: 700, y: 300, width: 120, height: 32 },
          confidence: 0.9,
          reason: "visible in the toolbar",
          risk: "safe_navigation",
        }),
        providerName: "gemini:test",
        durationMs: 8,
      };
    },
  };
}

test("a service that cannot answer falls through to the model", async () => {
  const calls = [];
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    hostedVision: hostedSaying({
      kind: "error",
      error: "This Toki service has no vision credentials configured.",
    }),
    gemini: geminiAnswering(calls),
  });

  const response = await adapter.request(request);

  assert.equal(calls.length, 1, "the model was asked");
  assert.equal(response.mode, "gemini");
});

test("a service that is unreachable falls through too", async () => {
  const calls = [];
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    hostedVision: {
      send: async () => {
        throw new Error("network is down");
      },
    },
    gemini: geminiAnswering(calls),
  });

  await adapter.request(request);

  assert.equal(calls.length, 1, "nothing was refused, so try elsewhere");
});

test("being signed out is a refusal, and is final", async () => {
  // Routing around this would hand out what somebody has not signed in for.
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    hostedVision: hostedSaying({
      kind: "signed_out",
      error: "Sign in to use live guidance.",
    }),
    gemini: {
      invokeImpl: () => assert.fail("a refusal must not be routed around"),
    },
  });

  const response = await adapter.request(request);

  assert.match(response.error, /Sign in/u);
});

test("needing an upgrade is a refusal, and is final", async () => {
  // The same, for the paid tier. This is the one that costs money if it leaks.
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    hostedVision: hostedSaying({
      kind: "upgrade_required",
      error: "Live guidance is part of Toki Pro.",
    }),
    gemini: {
      invokeImpl: () => assert.fail("a refusal must not be routed around"),
    },
  });

  const response = await adapter.request(request);

  assert.match(response.error, /Toki Pro/u);
});

test("a working service is still preferred over the model", async () => {
  const adapter = createGuidanceProviderAdapter("real", {
    localCandidateProvider: () => unavailable(),
    hostedVision: hostedSaying({
      kind: "ok",
      rawAnswer: JSON.stringify({
        target: { label: "Export CSV", x: 700, y: 300, width: 120, height: 32 },
        confidence: 0.9,
        reason: "the service found it",
        risk: "safe_navigation",
      }),
      providerName: "toki-api",
    }),
    gemini: {
      invokeImpl: () => assert.fail("the service answered; nothing else runs"),
    },
  });

  const response = await adapter.request(request);

  assert.equal(response.mode, "real");
});

test("nothing in the guidance path sends a request from the window", async () => {
  // The window is forbidden to reach any remote origin -- that ban is why
  // every other call goes through Rust. A route that used `fetch` failed with
  // WebKit's "Load failed" and stopped there, which left the model unreachable
  // whenever an endpoint was configured, and said nothing about either cause.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("../apps/desktop/src/guidanceProvider.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /requestRealGuidance/u);
  assert.doesNotMatch(source, /fetch\(/u);
});

test("a configured endpoint no longer stands between the service and the model", async () => {
  // This is the exact shape that broke: an endpoint set, the service unable to
  // answer, and the model never asked.
  const calls = [];
  const adapter = createGuidanceProviderAdapter("real", {
    endpoint: "https://toki.example/api",
    localCandidateProvider: () => unavailable(),
    hostedVision: hostedSaying({
      kind: "error",
      error: "This Toki service has no vision credentials configured.",
    }),
    gemini: geminiAnswering(calls),
  });

  const response = await adapter.request(request);

  assert.equal(calls.length, 1, "the model was asked");
  assert.equal(response.mode, "gemini");
});
