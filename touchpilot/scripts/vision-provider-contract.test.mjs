import assert from "node:assert/strict";
import test from "node:test";
import { requestGeminiVisionGuidance } from "../apps/desktop/src/geminiVisionProvider.ts";
import {
  createVisionGuidanceResponse,
  createVisionLocalizationPrompt,
  parseVisionTargetResponse,
  resolveVisionTargetToDisplay,
  VISION_TARGET_OUTPUT_SCHEMA,
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
    "gemini:test",
    "gemini",
  );

  assert.equal(response.mode, "gemini");
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
    "gemini:test",
    "gemini",
  );

  assert.equal(response.mode, "gemini");
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
    "gemini:test",
    "gemini",
  );

  assert.equal(response.mode, "gemini");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.risk, "payment");
  assert.equal(response.result.step.requiresConfirmation, true);
});

test("Gemini adapter sends image, prompt, and strict output schema to native runtime", async () => {
  const calls = [];
  const response = await requestGeminiVisionGuidance(createRequest(), {
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
        providerName: "gemini:test-model",
        durationMs: 1200,
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "request_gemini_vision_guidance");
  assert.equal(calls[0].args.request.imageBase64, "aW1hZ2U=");
  assert.equal(calls[0].args.request.imageFormat, "png");
  assert.equal(calls[0].args.request.timeoutMs, 8_000);
  assert.equal(calls[0].args.request.model, "test-model");
  assert.equal(JSON.parse(calls[0].args.request.outputSchema).type, "object");
  assert.equal(response.mode, "gemini");
});

test("Gemini adapter fails closed when native execution fails", async () => {
  const response = await requestGeminiVisionGuidance(createRequest(), {
    invokeImpl: async () => {
      throw new Error("provider timed out");
    },
  });

  assert.equal(response.mode, "unavailable");
  assert.match(response.error, /timed out/);
  assert.equal(response.result, undefined);
});


test("a top-level reason is left alone", () => {
  const top = parseVisionTargetResponse(
    JSON.stringify({
      target: { candidateId: "c1", label: "Create playlist", centerX: 1, centerY: 2, width: 3, height: 4 },
      confidence: 0.9,
      reason: "The left sidebar shows a circular plus button.",
    }),
  );

  assert.match(top.reason, /left sidebar shows/);
});


test("a top-level confidence wins over a nested one", () => {
  // Hoisting only fills a gap; it never overrides what the model actually put
  // where the schema asked for it.
  const both = parseVisionTargetResponse(
    JSON.stringify({
      target: { candidateId: "c1", label: "Playlist", centerX: 1, centerY: 2, width: 3, height: 4, confidence: 0.1 },
      confidence: 0.9,
      reason: "Top level reason.",
    }),
  );

  assert.equal(both.confidence, 0.9);
});

/*
 * Every arrangement one provider actually returned in a single evening.
 *
 * These are copied from the logs, not invented. Each was a correct, confident
 * answer; each was thrown away by a different gate downstream, which made one
 * problem look like four unrelated ones and cost most of a night.
 */
const OBSERVED_SHAPES = [
  {
    name: "canonical: everything where the schema asks",
    json: {
      target: { candidateId: "ocr-candidate-38", label: "Create playlist (+) button in left sidebar", centerX: 62, centerY: 207, width: 44, height: 44 },
      confidence: 0.83,
      reason: "The left sidebar shows a circular + button under the library toggle.",
    },
  },
  {
    name: "reason nested inside the target",
    json: {
      target: { candidateId: "ocr-candidate-36", label: "Create playlist (+) button in left sidebar", centerX: 62, centerY: 207, width: 38, height: 38, reason: "The circular + button sits in the collapsed left sidebar." },
      confidence: 0.86,
    },
  },
  {
    name: "reason and confidence both nested",
    json: {
      target: { candidateId: "", label: "Playlist \u2014 Create a playlist with songs or episodes", centerX: 298, centerY: 294, width: 500, height: 72, reason: "The Create menu is open and its first item reads Playlist.", confidence: 0.88 },
    },
  },
  {
    name: "candidate id and label lifted out of the target",
    json: {
      target: { centerX: 62, centerY: 208, width: 40, height: 40 },
      candidateId: "ocr-candidate-37",
      label: "Create playlist (+) button in left sidebar",
      reason: "The circular + Create button is visible in the Spotify left sidebar.",
      confidence: 0.9,
    },
  },
];

for (const shape of OBSERVED_SHAPES) {
  test(`every field is found when ${shape.name}`, () => {
    const parsed = parseVisionTargetResponse(JSON.stringify(shape.json));

    assert.ok(Number.isFinite(parsed.confidence), "confidence is a number, never NaN");
    assert.ok(parsed.confidence > 0.5);
    assert.ok(
      typeof parsed.reason === "string" && parsed.reason.length > 8,
      "an icon-only control has no words of its own; the reason is its evidence",
    );
    assert.ok(
      typeof parsed.target.label === "string" && parsed.target.label.length > 0,
      "the target is named",
    );
    assert.ok(Number.isFinite(parsed.target.centerX));
    assert.ok(Number.isFinite(parsed.target.width));
    assert.equal(typeof parsed.target.candidateId, "string");
  });
}

test("nothing is invented for a field absent from both levels", () => {
  const parsed = parseVisionTargetResponse(
    JSON.stringify({ target: { centerX: 1, centerY: 2, width: 3, height: 4 } }),
  );

  assert.equal(parsed.confidence, undefined);
  assert.equal(parsed.reason, undefined);
  assert.equal(parsed.target.label, undefined);
});

test("a null target survives normalizing", () => {
  // "I could not find it" is a real answer and must not become a crash.
  const parsed = parseVisionTargetResponse(
    JSON.stringify({ target: null, confidence: 0.1, reason: "Not visible." }),
  );

  assert.equal(parsed.target, null);
  assert.equal(parsed.confidence, 0.1);
});

import { descaleGeminiAnswer } from "../apps/desktop/src/geminiVisionProvider.ts";

/*
 * Gemini answers in thousandths of the image, whatever it was asked for.
 *
 * Found by checking an answer against a screenshot whose button positions were
 * known. Every control was identified correctly at 0.95 confidence and every
 * coordinate was wrong by the same ratio; the app's own validator then threw
 * the lot away for being out of bounds, and the visible symptom was "vision
 * found nothing" -- three layers from the cause.
 */

test("a target on Gemini's 0-1000 grid becomes image pixels", () => {
  // These are real numbers from a 1440x900 screenshot: the model returned 385,
  // 206 for a button whose true centre was 553, 186.
  const descaled = JSON.parse(
    descaleGeminiAnswer(
      JSON.stringify({
        target: { candidateId: "", label: "Export CSV", centerX: 385, centerY: 206, width: 81, height: 38 },
        confidence: 0.95,
        reason: "visible in the toolbar",
        risk: "safe_navigation",
      }),
      { width: 1440, height: 900 },
    ),
  );

  assert.equal(descaled.target.centerX, 554);
  assert.equal(descaled.target.centerY, 185);
  assert.equal(descaled.target.width, 117);
  assert.equal(descaled.target.height, 34);

  // Everything that is not a coordinate is left exactly alone.
  assert.equal(descaled.confidence, 0.95);
  assert.equal(descaled.risk, "safe_navigation");
  assert.equal(descaled.target.label, "Export CSV");
});

test("a null target survives untouched", () => {
  // "I could not find it" is a real answer and must not be turned into a
  // target at the origin.
  const raw = JSON.stringify({ target: null, confidence: 0.1, reason: "not visible", risk: "safe_navigation" });

  assert.equal(JSON.parse(descaleGeminiAnswer(raw, { width: 1440, height: 900 })).target, null);
});

test("an answer that is not JSON is handed on unchanged", () => {
  // The shared parser reports that far better than a conversion step can.
  assert.equal(descaleGeminiAnswer("I could not read the image", { width: 1440, height: 900 }), "I could not read the image");
});

test("an unknown image size leaves coordinates alone", () => {
  // Scaling by zero would put every target in the top-left corner, which is a
  // plausible-looking answer and therefore worse than no answer.
  const raw = JSON.stringify({ target: { centerX: 385, centerY: 206 } });

  assert.equal(JSON.parse(descaleGeminiAnswer(raw, { width: 0, height: 0 })).target.centerX, 385);
});

/*
 * What a failed request tells the person who made it.
 *
 * Every one of these used to read "Vision confidence was too low (N%)", which
 * is Toki reporting an internal number for several unrelated situations. It
 * invites exactly one fix -- lower the number -- and that makes Toki point at
 * something random instead of admitting it cannot see.
 */

function lowConfidenceAnswer({ target = null, reason }) {
  return JSON.stringify({ target, confidence: 0.2, reason, risk: "safe_navigation" });
}

function requestFor(goal) {
  return {
    goal,
    screen: {
      display: { id: "d1", width: 1440, height: 900, scaleFactor: 1 },
      screenshot: {
        source: "full_screen",
        display: { id: "d1", width: 1440, height: 900, scaleFactor: 1 },
        capturedAt: "2026-08-09T00:00:00.000Z",
        format: "png",
        byteLength: 10,
        imageWidth: 1440,
        imageHeight: 900,
      },
      screenshotPayload: {
        encoding: "base64",
        format: "png",
        byteLength: 10,
        imageWidth: 1440,
        imageHeight: 900,
        imageBase64: "iVBORw0KGgo=",
      },
      calibration: {
        status: "aligned",
        overlayWidth: 1440,
        overlayHeight: 900,
        displayWidth: 1440,
        displayHeight: 900,
        scaleFactor: 1,
      },
    },
  };
}

test("a control that is not on screen is said to be not on screen", () => {
  // The commonest way a request fails, and not a fault in anything: Toki can
  // only see what is rendered when it looks. Behind a closed menu, a collapsed
  // section, or below the fold, it genuinely is not there.
  const response = createVisionGuidanceResponse(
    lowConfidenceAnswer({
      target: null,
      reason: "The quote reply option is not visible or expanded in the screenshot.",
    }),
    requestFor("find the quote reply option"),
    "gemini:test",
    "gemini",
  );

  assert.equal(response.mode, "unavailable");
  assert.match(response.error, /can't see/u);
  assert.match(response.error, /menu or section that isn't open/u);
  assert.doesNotMatch(response.error, /confidence/iu, "no internal numbers");
});

test("what Toki heard comes first, because it is often the whole answer", () => {
  // A request for the "quote reply" option was transcribed as "code reply".
  // The model then correctly reported that no such thing was on screen, and it
  // read as vision failing when nothing about vision had failed.
  const response = createVisionGuidanceResponse(
    lowConfidenceAnswer({ target: null, reason: "Not present." }),
    requestFor("find the code reply option"),
    "gemini:test",
    "gemini",
  );

  assert.match(response.error, /^I can't see "find the code reply option"/u);
});

test("an unsure answer reads differently from an absent one", () => {
  // Those are not the same situation and must not produce the same sentence.
  const unsure = createVisionGuidanceResponse(
    lowConfidenceAnswer({
      target: { candidateId: "", label: "Reply", centerX: 100, centerY: 100, width: 30, height: 12 },
      reason: "It might be this one.",
    }),
    requestFor("find the quote reply option"),
    "gemini:test",
    "gemini",
  );

  assert.match(unsure.error, /not sure enough/u);
  assert.doesNotMatch(unsure.error, /can't see/u);
});

/**
 * When the answer is no, what else is there.
 *
 * Somebody who has just opened an application does not know its words. They ask
 * for "dark mode" where the control is called Appearance, or for "sign out"
 * where the screen shows only the account menu that contains it. At the moment
 * Toki decides the asked-for thing is absent it is holding the screen that
 * would answer the question, and a bare refusal throws that away.
 */

function offeringAnswer({ alternatives, reason = "Not present." }) {
  return JSON.stringify({
    target: null,
    alternatives,
    confidence: 0.2,
    reason,
    risk: "safe_navigation",
  });
}

test("offers are turned into targets Toki can already point at", () => {
  const response = createVisionGuidanceResponse(
    offeringAnswer({
      alternatives: [
        {
          candidateId: "",
          label: "Appearance",
          centerX: 200,
          centerY: 300,
          width: 120,
          height: 30,
          reason: "Controls light and dark themes.",
        },
      ],
    }),
    requestFor("turn on dark mode"),
    "gemini:test",
    "gemini",
  );

  assert.equal(response.suggestions?.length, 1);
  assert.equal(response.suggestions[0].target.label, "Appearance");
  assert.equal(
    response.suggestions[0].reason,
    "Controls light and dark themes.",
  );

  // Located, not merely named -- accepting one must not cost another round trip.
  assert.ok(response.suggestions[0].target.width > 0);
  assert.ok(response.suggestions[0].target.height > 0);
});

test("the failure becomes a question when there is something to offer", () => {
  const response = createVisionGuidanceResponse(
    offeringAnswer({
      alternatives: [
        {
          candidateId: "",
          label: "Appearance",
          centerX: 200,
          centerY: 300,
          width: 120,
          height: 30,
          reason: "Controls light and dark themes.",
        },
      ],
    }),
    requestFor("turn on dark mode"),
    "gemini:test",
    "gemini",
  );

  assert.match(response.error, /Did you mean one of these\?/u);
  // The "it may be inside a closed menu" advice is for the case where there is
  // nothing else to say. Here there is.
  assert.doesNotMatch(response.error, /menu or section that isn't open/u);
});

test("no offers leaves the plain not-on-screen answer alone", () => {
  const response = createVisionGuidanceResponse(
    offeringAnswer({ alternatives: [] }),
    requestFor("turn on dark mode"),
    "gemini:test",
    "gemini",
  );

  assert.equal(response.suggestions, undefined);
  assert.match(response.error, /menu or section that isn't open/u);
});

test("at most three offers, and never the same one twice", () => {
  const many = Array.from({ length: 6 }, (_, index) => ({
    candidateId: "",
    label: index % 2 === 0 ? "Appearance" : `Option ${index}`,
    centerX: 200,
    centerY: 100 + index * 40,
    width: 120,
    height: 30,
    reason: "Might be it.",
  }));

  const response = createVisionGuidanceResponse(
    offeringAnswer({ alternatives: many }),
    requestFor("turn on dark mode"),
    "gemini:test",
    "gemini",
  );

  assert.ok(response.suggestions.length <= 3);

  const labels = response.suggestions.map((entry) => entry.target.label);
  assert.equal(new Set(labels).size, labels.length, "no repeats");
});

test("a found target is not given alternatives", () => {
  const response = createVisionGuidanceResponse(
    JSON.stringify({
      target: {
        candidateId: "",
        label: "Appearance",
        centerX: 200,
        centerY: 300,
        width: 120,
        height: 30,
      },
      alternatives: [
        {
          candidateId: "",
          label: "Notifications",
          centerX: 200,
          centerY: 400,
          width: 120,
          height: 30,
          reason: "Nearby.",
        },
      ],
      confidence: 0.93,
      reason: "Visible in the sidebar.",
      risk: "safe_navigation",
    }),
    requestFor("open appearance"),
    "gemini:test",
    "gemini",
  );

  assert.equal(response.suggestions, undefined);
});

test("the schema asks for alternatives, so a model cannot quietly skip them", () => {
  assert.ok(VISION_TARGET_OUTPUT_SCHEMA.required.includes("alternatives"));
  assert.equal(VISION_TARGET_OUTPUT_SCHEMA.properties.alternatives.type, "array");
});
