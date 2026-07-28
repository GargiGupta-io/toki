import type { CreatureSplitVisualState } from "./gestureTwoHand";

export type GestureLockValidation =
  | "idle"
  | "checking"
  | "locked"
  | "limited"
  | "invalidated";

export type GesturePuckLockState =
  | "none"
  | "checking"
  | "locked"
  | "limited";

export type GesturePuckPresentation = {
  lockState: GesturePuckLockState;
  splitVisual: CreatureSplitVisualState | null;
  splitSuppressedByLock: boolean;
};

export function createGesturePuckPresentation({
  hasPointerLock,
  lockValidation,
  splitVisual,
}: {
  hasPointerLock: boolean;
  lockValidation: GestureLockValidation;
  splitVisual: CreatureSplitVisualState | null;
}): GesturePuckPresentation {
  if (!hasPointerLock) {
    return {
      lockState: "none",
      splitVisual,
      splitSuppressedByLock: false,
    };
  }

  return {
    lockState:
      lockValidation === "checking"
        ? "checking"
        : lockValidation === "limited"
          ? "limited"
          : "locked",
    splitVisual: null,
    splitSuppressedByLock: splitVisual != null,
  };
}
