import type { ReactNode } from "react";
import type { TargetBox } from "@toki/shared";
import type { TokiCreatureState } from "./tokiCreatureState";
import "./TokiCreatureLayer.css";

/*
 * No ring at the target any more.
 *
 * A rotating circle with the mode written around it -- "Guiding" -- sat on top
 * of the control being pointed at, moved, and said the same thing as the notch
 * and the dotted outline. Three things narrating one step, and the one drawn
 * over the target was the one covering it.
 *
 * `target` stays in the signature because every caller passes it and the layer
 * is the natural place for anything that needs to be drawn at the target again.
 * Nothing is drawn from it today.
 */
type TokiCreatureLayerProps = {
  state: TokiCreatureState;
  target: TargetBox | null;
  children: ReactNode;
};

export function TokiCreatureLayer({ state, children }: TokiCreatureLayerProps) {
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
      {children}
    </div>
  );
}
