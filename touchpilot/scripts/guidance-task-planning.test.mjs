import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuidanceTaskPlan,
  createSingleStepGuidanceTaskPlan,
  getGuidanceLocalizationContext,
  getGuidanceLocalizationObjective,
} from "../apps/desktop/src/guidanceTaskPlanning.ts";
import { createOllamaLocalizationPrompt } from "../apps/desktop/src/ollamaVisionProvider.ts";

const createdAt = "2026-07-11T00:00:00.000Z";

test("single-step fallback preserves the original task", () => {
  const plan = createSingleStepGuidanceTaskPlan(
    "plan-1",
    "  Download   the report  ",
    createdAt,
  );

  assert.equal(plan.originalGoal, "Download the report");
  assert.equal(plan.source, "single_step_fallback");
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].objective, "Download the report");
});

test("localization context exposes only the selected planned step", () => {
  const plan = createGuidanceTaskPlan({
    id: "plan-2",
    originalGoal: "Create and share a report",
    objectives: ["Open the create menu", "Choose report", "Share the report"],
    source: "planner",
    createdAt,
  });
  const localization = getGuidanceLocalizationContext(plan, 1);

  assert.deepEqual(localization, {
    planId: "plan-2",
    originalGoal: "Create and share a report",
    currentStepId: "plan-2-step-2",
    currentStepIndex: 1,
    totalSteps: 3,
    objective: "Choose report",
  });
});

test("localization objective falls back for older requests", () => {
  const request = {
    goal: "Open settings",
    screen: { display: { width: 1440, height: 900, scaleFactor: 2 } },
  };

  assert.equal(getGuidanceLocalizationObjective(request), "Open settings");
});

test("Ollama prompt separates the original task from localization", () => {
  const request = {
    goal: "Create and share a report",
    localization: {
      planId: "plan-2",
      originalGoal: "Create and share a report",
      currentStepId: "plan-2-step-2",
      currentStepIndex: 1,
      totalSteps: 3,
      objective: "Choose report",
    },
    screen: {
      display: { width: 1440, height: 900, scaleFactor: 2 },
      screenshotPayload: {
        encoding: "base64",
        format: "jpeg",
        byteLength: 4,
        imageWidth: 1000,
        imageHeight: 700,
        imageBase64: "test",
      },
    },
  };
  const prompt = createOllamaLocalizationPrompt(request);

  assert.match(prompt, /Original task: Create and share a report/);
  assert.match(prompt, /Current step objective: Choose report/);
  assert.match(prompt, /target localizer, not a task planner/);
  assert.doesNotMatch(prompt, /Current step objective: Create and share a report/);
});

test("task plans reject empty steps", () => {
  assert.throws(
    () =>
      createGuidanceTaskPlan({
        id: "plan-3",
        originalGoal: "Create report",
        objectives: [],
        source: "planner",
        createdAt,
      }),
    /objectives must contain at least one step/,
  );
});

test("task plans use the normalized plan id for step ids", () => {
  const plan = createGuidanceTaskPlan({
    id: "  plan-4  ",
    originalGoal: "Open settings",
    objectives: ["Choose preferences"],
    source: "planner",
    createdAt,
  });

  assert.equal(plan.id, "plan-4");
  assert.equal(plan.steps[0].id, "plan-4-step-1");
});
