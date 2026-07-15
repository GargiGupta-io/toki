import type { PointerLockSnapshot } from "@toki/shared";
import "./TokiPointerLockCue.css";

export function TokiPointerLockCue({
  lock,
  validation,
}: {
  lock: PointerLockSnapshot | null;
  validation: "checking" | "locked" | null;
}) {
  if (lock == null) {
    return null;
  }

  return (
    <span
      className="toki-pointer-lock-cue"
      data-validation={validation ?? "locked"}
      style={{
        left: `${lock.pointer.display.x}px`,
        top: `${lock.pointer.display.y}px`,
      }}
      aria-hidden="true"
    >
      <span className="toki-pointer-lock-cue__drop" />
      <span className="toki-pointer-lock-cue__label">
        {validation === "checking" ? "locking" : "locked"}
      </span>
    </span>
  );
}
