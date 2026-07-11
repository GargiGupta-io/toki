import type {
  GuidanceLocalizationContext,
  GuidanceRequest,
  GuidanceTaskPlan,
  GuidanceTaskPlanSource,
} from "@toki/shared";

type GuidanceTaskPlanInput = {
  id: string;
  originalGoal: string;
  objectives: string[];
  source: GuidanceTaskPlanSource;
  createdAt?: string;
};

function requireText(value: string, field: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`);
  }

  return normalized;
}

export function createGuidanceTaskPlan({
  id,
  originalGoal,
  objectives,
  source,
  createdAt = new Date().toISOString(),
}: GuidanceTaskPlanInput): GuidanceTaskPlan {
  const planId = requireText(id, "id");
  const goal = requireText(originalGoal, "originalGoal");

  if (objectives.length === 0) {
    throw new Error("objectives must contain at least one step");
  }

  return {
    id: planId,
    originalGoal: goal,
    source,
    createdAt,
    steps: objectives.map((objective, index) => ({
      id: `${planId}-step-${index + 1}`,
      index,
      objective: requireText(objective, `objectives[${index}]`),
    })),
  };
}

export function createSingleStepGuidanceTaskPlan(
  id: string,
  goal: string,
  createdAt?: string,
): GuidanceTaskPlan {
  return createGuidanceTaskPlan({
    id,
    originalGoal: goal,
    objectives: [goal],
    source: "single_step_fallback",
    createdAt,
  });
}

export function getGuidanceLocalizationContext(
  plan: GuidanceTaskPlan,
  currentStepIndex: number,
): GuidanceLocalizationContext | null {
  const step = plan.steps[currentStepIndex];

  if (step == null) {
    return null;
  }

  return {
    planId: plan.id,
    originalGoal: plan.originalGoal,
    currentStepId: step.id,
    currentStepIndex: step.index,
    totalSteps: plan.steps.length,
    objective: step.objective,
  };
}

export function getGuidanceLocalizationObjective(request: GuidanceRequest): string {
  return request.localization?.objective.trim() || request.goal.trim();
}
