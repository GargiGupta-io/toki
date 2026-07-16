import type { PointerExplanationState } from "./gesturePointerExplanation";
import type { ViewportMetrics } from "./overlayGeometry";
import "./TokiPointerExplanationCard.css";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function TokiPointerExplanationCard({
  explanation,
  viewport,
}: {
  explanation: PointerExplanationState | null;
  viewport: ViewportMetrics;
}) {
  const lock = explanation?.lock;
  if (explanation == null || lock == null) {
    return null;
  }

  const cardHalfWidth = 154;
  const left = clamp(
    lock.pointer.display.x,
    cardHalfWidth + 16,
    Math.max(cardHalfWidth + 16, viewport.width - cardHalfWidth - 16),
  );
  const preferredTop =
    lock.pointer.display.y > viewport.height * 0.68
      ? lock.pointer.display.y - 142
      : lock.pointer.display.y + 30;
  const top = clamp(preferredTop, 70, Math.max(70, viewport.height - 132));

  return (
    <aside
      className="toki-pointer-explanation"
      data-status={explanation.status}
      style={{ left: `${left}px`, top: `${top}px` }}
      role="status"
      aria-live="polite"
    >
      <span className="toki-pointer-explanation__eyebrow">
        {explanation.status === "processing"
          ? "Reading locked point"
          : explanation.status === "grounded"
            ? "Locked control"
            : "Lock needs attention"}
      </span>
      <strong>{explanation.label}</strong>
      <p>{explanation.message}</p>
      {explanation.riskWarning && (
        <small>{explanation.riskWarning}</small>
      )}
    </aside>
  );
}
