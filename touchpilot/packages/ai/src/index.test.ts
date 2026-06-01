import assert from "node:assert/strict";
import test from "node:test";
import type { GuidanceResult, RiskClass } from "@touchpilot/shared";
import {
  createInvalidMockGuidance,
  createMockGuidance,
  createRiskyMockGuidance,
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
