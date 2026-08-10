import type { WorkflowRuntimeState } from "@toki/shared";
import "./TokiTaskProgress.css";

/**
 * What to do next, in one sentence.
 *
 * This used to be a panel: the goal, a status word, a progress bar, "step 1 of
 * 3", the step's title, its instruction, and a list of what had already been
 * done. All of it true, and all of it in the way -- a card that size sits over
 * the very application somebody is being guided through, and the one line that
 * tells them what to do had six other lines competing with it.
 *
 * Everything removed here is already answerable elsewhere. The panel under the
 * notch carries the goal and the run state; the spotlight names and rings the
 * control. What is left is the instruction, which is the only part that is an
 * instruction.
 */
export function TokiTaskProgress({ runtime }: { runtime: WorkflowRuntimeState }) {
  const plan = runtime.plan;
  if (plan == null || plan.steps.length <= 1 || runtime.status === "idle") {
    return null;
  }

  const currentStep =
    plan.steps[runtime.currentStepIndex] ?? plan.steps[plan.steps.length - 1] ?? null;

  // Nothing to say. A chip reading "Running" is a chip that could be absent.
  if (currentStep == null) {
    return null;
  }

  return (
    <aside
      className="toki-task-progress"
      data-status={runtime.status}
      aria-live="polite"
      // The step number stays here, where a screen reader can reach it, and off
      // the screen where it was only ever taking room.
      aria-label={`Step ${Math.min(
        runtime.currentStepIndex + 1,
        plan.steps.length,
      )} of ${plan.steps.length}: ${currentStep.instruction}`}
    >
      {currentStep.instruction}
    </aside>
  );
}
