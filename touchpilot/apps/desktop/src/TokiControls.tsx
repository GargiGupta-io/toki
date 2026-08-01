/**
 * The two control shapes both surfaces share.
 *
 * They live here rather than inside either window because the panel and the
 * settings window have to look like the same application. Two copies drift:
 * one gains a hover state, the other a different corner radius, and the app
 * quietly stops feeling like one thing.
 */

import type { CameraStreamStatus } from "@toki/shared";

export function Row({
  label,
  detail,
  onClick,
  disabled,
}: {
  label: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="toki-row"
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="toki-row__text">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="toki-row__value" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function Toggle({
  label,
  detail,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  detail: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="toki-row"
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="toki-row__text">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="toki-switch" aria-hidden="true" />
    </button>
  );
}

export function getCameraControlLabel({
  enabled,
  status,
}: {
  enabled: boolean;
  status: CameraStreamStatus;
}): string {
  if (!enabled || status === "disabled") {
    return "Turn camera + gestures on";
  }

  if (status === "idle" || status === "requesting_permission") {
    return "Starting camera + gestures";
  }

  if (
    status === "permission_denied" ||
    status === "no_camera" ||
    status === "error"
  ) {
    return "Camera + gestures need attention";
  }

  return "Camera + gestures on";
}
