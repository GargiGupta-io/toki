export type VoiceHoldPhase = "idle" | "starting" | "capturing" | "submitting";

export type VoiceHoldState = {
  phase: VoiceHoldPhase;
  held: boolean;
  releasePending: boolean;
};

export type VoiceHoldEvent =
  | "press"
  | "release"
  | "capture_started"
  | "capture_aborted"
  | "capture_failed"
  | "submission_finished"
  | "cancel";

export type VoiceHoldEffect = "none" | "start_capture" | "submit_capture";

export type VoiceHoldTransition = {
  state: VoiceHoldState;
  effect: VoiceHoldEffect;
};

export function createIdleVoiceHoldState(): VoiceHoldState {
  return {
    phase: "idle",
    held: false,
    releasePending: false,
  };
}

export function transitionVoiceHold(
  state: VoiceHoldState,
  event: VoiceHoldEvent,
): VoiceHoldTransition {
  if (event === "press") {
    if (state.phase !== "idle") {
      return { state, effect: "none" };
    }

    return {
      state: {
        phase: "starting",
        held: true,
        releasePending: false,
      },
      effect: "start_capture",
    };
  }

  if (event === "release") {
    if (state.phase === "starting") {
      return {
        state: {
          ...state,
          held: false,
          releasePending: true,
        },
        effect: "none",
      };
    }

    if (state.phase === "capturing") {
      return {
        state: {
          phase: "submitting",
          held: false,
          releasePending: false,
        },
        effect: "submit_capture",
      };
    }

    return {
      state: {
        ...state,
        held: false,
      },
      effect: "none",
    };
  }

  if (event === "capture_started") {
    if (state.phase !== "starting") {
      return { state, effect: "none" };
    }

    if (!state.held || state.releasePending) {
      return {
        state: {
          phase: "submitting",
          held: false,
          releasePending: false,
        },
        effect: "submit_capture",
      };
    }

    return {
      state: {
        phase: "capturing",
        held: true,
        releasePending: false,
      },
      effect: "none",
    };
  }

  if (
    event === "capture_aborted" ||
    event === "capture_failed" ||
    event === "submission_finished" ||
    event === "cancel"
  ) {
    return {
      state: createIdleVoiceHoldState(),
      effect: "none",
    };
  }

  return { state, effect: "none" };
}
