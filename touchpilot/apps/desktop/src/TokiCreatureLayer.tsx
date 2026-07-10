import type { CSSProperties, ReactNode } from "react";
import type { TargetBox } from "@toki/shared";
import type { TokiCreatureState } from "./tokiCreatureState";
import "./TokiCreatureLayer.css";

type TokiCreatureLayerProps = {
  state: TokiCreatureState;
  target: TargetBox | null;
  children: ReactNode;
};

export function TokiCreatureLayer({ state, target, children }: TokiCreatureLayerProps) {
  const targetStyle =
    target != null
      ? ({
          "--toki-target-x": `${target.x + target.width / 2}px`,
          "--toki-target-y": `${target.y + target.height / 2}px`,
          "--toki-target-width": `${Math.max(target.width, 30)}px`,
          "--toki-target-height": `${Math.max(target.height, 30)}px`,
        } as CSSProperties)
      : undefined;

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
      {target != null && state.shouldStretchTowardTarget ? (
        <span className="toki-target-travel" style={targetStyle}>
          <span className="toki-target-travel__ring" />
          <span className="toki-target-travel__glint toki-target-travel__glint--one" />
          <span className="toki-target-travel__glint toki-target-travel__glint--two" />
        </span>
      ) : null}
      {children}
    </div>
  );
}
