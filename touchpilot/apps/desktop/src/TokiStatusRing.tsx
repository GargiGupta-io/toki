import type { CSSProperties } from "react";
import type { TokiCreatureState } from "./tokiCreatureState";
import "./TokiStatusRing.css";

type TokiStatusRingProps = {
  centerX: number;
  centerY: number;
  state: TokiCreatureState;
};

const ringPath = "M 26,26 m -19,0 a 19,19 0 1,1 38,0 a 19,19 0 1,1 -38,0";

export function TokiStatusRing({ centerX, centerY, state }: TokiStatusRingProps) {
  if (state.statusLabel == null) {
    return null;
  }

  const style = {
    "--toki-status-x": `${centerX}px`,
    "--toki-status-y": `${centerY}px`,
    "--toki-status-energy": state.energy,
  } as CSSProperties;

  return (
    <span
      className="toki-status-ring"
      data-mode={state.mode}
      data-tone={state.tone}
      data-gesture={state.gesture.label}
      data-gesture-phase={state.gesture.phase}
      style={style}
      aria-hidden="true"
    >
      <svg viewBox="0 0 52 52" focusable="false">
        <defs>
          <path id="toki-status-ring-path" d={ringPath} />
        </defs>
        <circle className="toki-status-ring__orbit-underlay" cx="26" cy="26" r="19" />
        <circle className="toki-status-ring__orbit" cx="26" cy="26" r="19" />
        <circle className="toki-status-ring__progress-underlay" cx="26" cy="26" r="19" />
        <circle className="toki-status-ring__progress" cx="26" cy="26" r="19" />
        <text className="toki-status-ring__label">
          <textPath href="#toki-status-ring-path" startOffset="8%">
            {state.statusLabel}
          </textPath>
        </text>
      </svg>
    </span>
  );
}
