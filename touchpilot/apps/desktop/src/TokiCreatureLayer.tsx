import type { ReactNode } from "react";
import type { TargetBox } from "@toki/shared";
import type { TokiCreatureState } from "./tokiCreatureState";
import { TokiStatusRing } from "./TokiStatusRing";
import "./TokiCreatureLayer.css";

type TokiCreatureLayerProps = {
  state: TokiCreatureState;
  target: TargetBox | null;
  children: ReactNode;
};

export function TokiCreatureLayer({ state, target, children }: TokiCreatureLayerProps) {
  return (
    <div
      className="toki-creature-layer"
      data-mode={state.mode}
      data-anchor={state.anchor}
      data-tone={state.tone}
      data-energy={state.energy}
      data-pulse={state.shouldPulse ? "true" : "false"}
      data-stretch-target={state.shouldStretchTowardTarget ? "true" : "false"}
      data-aura={state.shouldShowAura ? "true" : "false"}
      data-gesture={state.gesture.label}
      data-gesture-phase={state.gesture.phase}
      data-gesture-active={state.gesture.active ? "true" : "false"}
      data-reason={state.reason}
      aria-hidden="true"
    >
      {target != null ? (
        <TokiStatusRing
          centerX={target.x + target.width / 2}
          centerY={target.y + target.height / 2}
          targetWidth={target.width}
          targetHeight={target.height}
          state={state}
        />
      ) : null}
      {children}
    </div>
  );
}
