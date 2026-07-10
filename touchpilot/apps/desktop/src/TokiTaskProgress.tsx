import type { WorkflowRuntimeState, WorkflowStep } from "@toki/shared";
import "./TokiTaskProgress.css";

const statusLabels: Record<WorkflowRuntimeState["status"], string> = {
  idle: "Idle",
  planning: "Planning",
  active: "Running",
  paused: "Paused",
  blocked: "Needs attention",
  completed: "Complete",
  cancelled: "Stopped",
  error: "Error",
};

function getCompletedSteps(runtime: WorkflowRuntimeState): WorkflowStep[] {
  if (runtime.plan == null) {
    return [];
  }

  return runtime.plan.steps.filter(
    (step) => step.status === "completed" || step.index < runtime.currentStepIndex,
  );
}

export function TokiTaskProgress({ runtime }: { runtime: WorkflowRuntimeState }) {
  const plan = runtime.plan;
  if (plan == null || plan.steps.length <= 1 || runtime.status === "idle") {
    return null;
  }

  const currentStep =
    plan.steps[runtime.currentStepIndex] ?? plan.steps[plan.steps.length - 1] ?? null;
  const completedSteps = getCompletedSteps(runtime);
  const completedCount =
    runtime.status === "completed"
      ? plan.steps.length
      : Math.min(completedSteps.length, plan.steps.length);
  const progress = Math.max(
    0,
    Math.min(100, Math.round((completedCount / plan.steps.length) * 100)),
  );
  const recentHistory = completedSteps.slice(-2);

  return (
    <aside
      className="toki-task-progress"
      data-status={runtime.status}
      aria-live="polite"
      aria-label={`${plan.title}: ${statusLabels[runtime.status]}`}
    >
      <header className="toki-task-progress__header">
        <span className="toki-task-progress__title">{plan.title}</span>
        <span className="toki-task-progress__status">{statusLabels[runtime.status]}</span>
      </header>

      <div className="toki-task-progress__bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      {currentStep != null ? (
        <div className="toki-task-progress__current">
          <span>
            Step {Math.min(runtime.currentStepIndex + 1, plan.steps.length)} of {plan.steps.length}
          </span>
          <strong>{currentStep.title}</strong>
          <small>{currentStep.instruction}</small>
        </div>
      ) : null}

      {recentHistory.length > 0 ? (
        <div className="toki-task-progress__history" aria-label="Completed steps">
          {recentHistory.map((step) => (
            <span key={step.id}>
              <i aria-hidden="true" />
              {step.title}
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
