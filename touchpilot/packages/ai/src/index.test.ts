import assert from "node:assert/strict";
import test from "node:test";
import type { GuidanceResult, RiskClass } from "@toki/shared";
import {
  createInvalidMockGuidance,
  createLowConfidenceMockGuidance,
  createMockGuidance,
  createRiskyMockGuidance,
  evaluateSafetyPolicy,
  fuseScreenCandidates,
  requestRealGuidance,
  validateGuidanceResult,
} from "./index";

const validResult: GuidanceResult = {
  mode: "guide",
  summary: "Guide the user to the next safe target.",
  step: {
    instruction: "Click the highlighted target.",
    target: {
      label: "Export",
      x: 120,
      y: 80,
      width: 96,
      height: 40,
    },
    confidence: 0.82,
    risk: "safe_navigation",
    requiresConfirmation: false,
  },
};

function cloneResult(overrides: Partial<GuidanceResult> = {}): GuidanceResult {
  return {
    ...validResult,
    step: validResult.step == null ? undefined : { ...validResult.step },
    ...overrides,
  };
}

test("fuseScreenCandidates converts candidates into ui elements", () => {
  const elements = fuseScreenCandidates([
    {
      id: "download-button",
      label: "Download",
      role: "dom_button",
      source: "dom",
      x: 100,
      y: 80,
      width: 120,
      height: 36,
    },
  ]);

  assert.equal(elements.length, 1);
  assert.equal(elements[0].primarySource, "browser-dom");
  assert.equal(elements[0].label, "Download");
  assert.equal(elements[0].interactable, true);
  assert.deepEqual(elements[0].sourceCandidateIds, ["download-button"]);
});

test("fuseScreenCandidates merges duplicate observations", () => {
  const elements = fuseScreenCandidates([
    {
      id: "dom-delete",
      label: "Delete",
      role: "dom_button",
      source: "dom",
      x: 240,
      y: 100,
      width: 96,
      height: 36,
    },
    {
      id: "ocr-delete",
      label: "Delete",
      role: "ocr_text",
      source: "ocr",
      x: 244,
      y: 104,
      width: 82,
      height: 24,
      metadata: {
        confidence: 0.72,
      },
    },
  ]);

  assert.equal(elements.length, 1);
  assert.equal(elements[0].primarySource, "browser-dom");
  assert.equal(elements[0].sources.length, 2);
  assert.deepEqual(elements[0].sourceCandidateIds, ["dom-delete", "ocr-delete"]);
  assert.equal(elements[0].risky, true);
});

test("fuseScreenCandidates ignores invalid candidates", () => {
  const elements = fuseScreenCandidates([
    {
      id: "broken",
      label: "",
      role: "manual",
      source: "manual",
      x: 0,
      y: 0,
      width: 0,
      height: 20,
    },
    {
      id: "valid",
      label: "Open settings",
      role: "manual",
      source: "manual",
      x: 10,
      y: 20,
      width: 120,
      height: 32,
    },
  ]);

  assert.equal(elements.length, 1);
  assert.equal(elements[0].id, "element-manual-valid");
});

test("createMockGuidance returns valid guidance centered on the display", () => {
  const result = createMockGuidance({
    goal: "Show me what to click next.",
    screen: {
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 1,
      },
    },
  });

  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
  assert.equal(result.step?.target?.x, 720);
  assert.equal(result.step?.target?.y, 450);
});

test("createRiskyMockGuidance returns valid confirmation-gated guidance", () => {
  const result = createRiskyMockGuidance({
    goal: "Help me understand the payment action.",
    screen: {
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 1,
      },
    },
  });

  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
  assert.equal(result.step?.target?.label, "Pay now");
  assert.equal(result.step?.risk, "payment");
  assert.equal(result.step?.requiresConfirmation, true);
});

test("createLowConfidenceMockGuidance returns valid uncertain guidance", () => {
  const result = createLowConfidenceMockGuidance({
    goal: "Force a low confidence policy path.",
    screen: {
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 1,
      },
    },
  });

  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
  assert.equal(result.step?.target?.label, "Maybe target");
  assert.equal(result.step?.confidence, 0.42);
});

test("createInvalidMockGuidance returns a rejected QA fixture", () => {
  const result = createInvalidMockGuidance({
    goal: "Force a rejected guidance state.",
    screen: {
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 1,
      },
    },
  });

  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, false);
  assert.deepEqual(
    validation.issues.map((issue) => issue.path),
    [
      "step.confidence",
      "step.requiresConfirmation",
      "step.target.x",
      "step.target",
    ],
  );
});

test("validateGuidanceResult rejects missing guidance", () => {
  const validation = validateGuidanceResult(null);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.issues, [
    { path: "result", message: "Guidance result is missing." },
  ]);
});

test("validateGuidanceResult rejects guide mode without a step", () => {
  const validation = validateGuidanceResult(cloneResult({ step: undefined }));

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.issues, [
    { path: "step", message: "Guide mode requires a step." },
  ]);
});

test("validateGuidanceResult rejects empty summaries and unknown modes", () => {
  const result = cloneResult({
    mode: "move" as GuidanceResult["mode"],
    summary: " ",
  });
  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, false);
  assert.deepEqual(
    validation.issues.map((issue) => issue.path),
    ["mode", "summary"],
  );
});

test("validateGuidanceResult rejects confidence outside 0 to 1", () => {
  for (const confidence of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
    const result = cloneResult({
      step: {
        ...validResult.step!,
        confidence,
      },
    });
    const validation = validateGuidanceResult(result);

    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some((issue) => issue.path === "step.confidence"));
  }
});

test("validateGuidanceResult rejects unknown risk classes", () => {
  const result = cloneResult({
    step: {
      ...validResult.step!,
      risk: "mystery_action" as RiskClass,
    },
  });
  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.issues, [
    { path: "step.risk", message: "Risk class is not recognized." },
  ]);
});

test("validateGuidanceResult requires confirmation for risky guidance", () => {
  const riskyClasses: RiskClass[] = [
    "external_send",
    "delete",
    "payment",
    "security_change",
    "account_change",
    "permission_change",
    "unknown_risky",
  ];

  for (const risk of riskyClasses) {
    const result = cloneResult({
      step: {
        ...validResult.step!,
        risk,
        requiresConfirmation: false,
      },
    });
    const validation = validateGuidanceResult(result);

    assert.equal(validation.valid, false);
    assert.ok(
      validation.issues.some((issue) => issue.path === "step.requiresConfirmation"),
    );
  }
});

test("validateGuidanceResult accepts risky guidance when confirmation is required", () => {
  const result = cloneResult({
    step: {
      ...validResult.step!,
      risk: "payment",
      requiresConfirmation: true,
    },
  });
  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
});

test("validateGuidanceResult rejects non-finite target geometry", () => {
  const result = cloneResult({
    step: {
      ...validResult.step!,
      target: {
        label: "Export",
        x: Number.NaN,
        y: 80,
        width: 96,
        height: Number.POSITIVE_INFINITY,
      },
    },
  });
  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, false);
  assert.deepEqual(
    validation.issues.map((issue) => issue.path),
    ["step.target.x", "step.target.height"],
  );
});

test("validateGuidanceResult rejects zero or negative target size", () => {
  const result = cloneResult({
    step: {
      ...validResult.step!,
      target: {
        label: "Export",
        x: 120,
        y: 80,
        width: 0,
        height: -1,
      },
    },
  });
  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.issues, [
    {
      path: "step.target",
      message: "Target width and height must be positive.",
    },
  ]);
});

test("requestRealGuidance reports unavailable without endpoint", async () => {
  const response = await requestRealGuidance({
    goal: "Show me what to click next.",
    screen: {
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 1,
      },
    },
  });

  assert.equal(response.mode, "unavailable");
  assert.equal(response.providerName, "none");
  assert.match(response.error ?? "", /No real guidance provider endpoint/);
});

test("requestRealGuidance preserves unavailable provider response", async () => {
  const response = await requestRealGuidance(
    {
      goal: "Show me what to click next.",
      screen: {
        display: {
          id: "display-1",
          width: 1440,
          height: 900,
          scaleFactor: 1,
        },
      },
    },
    {
      endpoint: "http://127.0.0.1:8787/guidance",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            mode: "unavailable",
            error: "provider quota exceeded",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    },
  );

  assert.equal(response.mode, "unavailable");
  assert.equal(response.error, "provider quota exceeded");
  assert.equal(response.providerName, "http://127.0.0.1:8787/guidance");
});

test("requestRealGuidance accepts valid provider envelope", async () => {
  const response = await requestRealGuidance(
    {
      goal: "Show me what to click next.",
      screen: {
        display: {
          id: "display-1",
          width: 1440,
          height: 900,
          scaleFactor: 1,
        },
      },
    },
    {
      endpoint: "http://127.0.0.1:8787/guidance",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            mode: "real",
            result: validResult,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    },
  );

  assert.equal(response.mode, "real");
  assert.equal(response.result?.step?.target?.label, "Export");
  assert.equal(response.validation?.valid, true);
});

test("evaluateSafetyPolicy allows safe navigation", () => {
  const decision = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: validResult,
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(decision.action, "allow");
  assert.equal(decision.reason, "safe_navigation");
  assert.equal(decision.requiresConfirmation, false);
});

test("evaluateSafetyPolicy allows form entry with a notice", () => {
  const decision = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: cloneResult({
        step: {
          ...validResult.step!,
          risk: "form_entry",
        },
      }),
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(decision.action, "allow");
  assert.equal(decision.reason, "form_entry_notice");
});

test("evaluateSafetyPolicy requires confirmation for risky actions", () => {
  const riskyClasses: RiskClass[] = [
    "external_send",
    "delete",
    "payment",
    "security_change",
    "account_change",
    "permission_change",
  ];

  for (const risk of riskyClasses) {
    const decision = evaluateSafetyPolicy({
      provider: {
        mode: "real",
        result: cloneResult({
          step: {
            ...validResult.step!,
            risk,
            requiresConfirmation: true,
          },
        }),
        validation: { valid: true, issues: [] },
      },
      minConfidence: 0.7,
    });

    assert.equal(decision.action, "confirm");
    assert.equal(decision.reason, "risky_action");
    assert.equal(decision.risk, risk);
    assert.equal(decision.requiresConfirmation, true);
  }
});

test("evaluateSafetyPolicy treats unknown risk as confirmation required", () => {
  const decision = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: cloneResult({
        step: {
          ...validResult.step!,
          risk: "unknown_risky",
          requiresConfirmation: true,
        },
      }),
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(decision.action, "confirm");
  assert.equal(decision.reason, "unknown_risk");
});

test("evaluateSafetyPolicy clarifies low-confidence guidance", () => {
  const decision = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: cloneResult({
        step: {
          ...validResult.step!,
          confidence: 0.42,
        },
      }),
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(decision.action, "clarify");
  assert.equal(decision.reason, "low_confidence");
  assert.deepEqual(decision.details, ["confidence=0.42", "minimum=0.7"]);
});

test("evaluateSafetyPolicy blocks unavailable and validation-failed providers", () => {
  const unavailable = evaluateSafetyPolicy({
    provider: {
      mode: "unavailable",
      error: "provider quota exceeded",
    },
    minConfidence: 0.7,
  });

  assert.equal(unavailable.action, "block");
  assert.equal(unavailable.reason, "provider_unavailable");

  const validationFailed = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: validResult,
      validation: {
        valid: false,
        issues: [{ path: "step.target", message: "Target is offscreen." }],
      },
    },
    minConfidence: 0.7,
  });

  assert.equal(validationFailed.action, "block");
  assert.equal(validationFailed.reason, "validation_failed");
  assert.deepEqual(validationFailed.details, [
    "step.target: Target is offscreen.",
  ]);
});

test("evaluateSafetyPolicy clarifies missing targets and blocks invalid targets", () => {
  const missingTarget = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: cloneResult({
        step: {
          ...validResult.step!,
          target: undefined,
        },
      }),
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(missingTarget.action, "clarify");
  assert.equal(missingTarget.reason, "missing_target");

  const invalidTarget = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: cloneResult({
        step: {
          ...validResult.step!,
          target: {
            label: " ",
            x: 120,
            y: 80,
            width: 0,
            height: 40,
          },
        },
      }),
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(invalidTarget.action, "block");
  assert.equal(invalidTarget.reason, "invalid_target");
});

test("evaluateSafetyPolicy blocks missing guide steps but clarifies clarify results", () => {
  const missingStep = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: cloneResult({ step: undefined }),
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(missingStep.action, "block");
  assert.equal(missingStep.reason, "missing_step");

  const clarify = evaluateSafetyPolicy({
    provider: {
      mode: "real",
      result: {
        mode: "clarify",
        summary: "Which settings page do you mean?",
      },
      validation: { valid: true, issues: [] },
    },
    minConfidence: 0.7,
  });

  assert.equal(clarify.action, "clarify");
  assert.equal(clarify.reason, "missing_step");
});
