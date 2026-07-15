import type { CSSProperties } from "react";
import type { TokiCreatureState } from "./tokiCreatureState";
import { getTargetCueGeometry } from "./targetCueGeometry";
import "./TokiStatusRing.css";

type TokiStatusRingProps = {
  centerX: number;
  centerY: number;
  targetWidth: number;
  targetHeight: number;
  state: TokiCreatureState;
};

const ringPath = "M 26,26 m -19,0 a 19,19 0 1,1 38,0 a 19,19 0 1,1 -38,0";

export function TokiStatusRing({
  centerX,
  centerY,
  targetWidth,
  targetHeight,
  state,
}: TokiStatusRingProps) {
  if (state.statusLabel == null) {
    return null;
  }

  const geometry = getTargetCueGeometry(targetWidth, targetHeight);
  const style = {
    "--toki-status-x": `${centerX}px`,
    "--toki-status-y": `${centerY}px`,
    "--toki-status-width": `${geometry.width}px`,
    "--toki-status-height": `${geometry.height}px`,
    "--toki-status-energy": state.energy,
  } as CSSProperties;

  return (
    <span
      className="toki-status-ring"
      data-mode={state.mode}
      data-tone={state.tone}
      data-shape={geometry.shape}
      data-gesture={state.gesture.label}
      data-gesture-phase={state.gesture.phase}
      style={style}
      aria-hidden="true"
    >
      {geometry.shape === "region" ? (
        <svg
          className="toki-status-ring__region-svg"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          focusable="false"
        >
          <rect
            className="toki-status-ring__region-underlay"
            x="2"
            y="2"
            width={geometry.width - 4}
            height={geometry.height - 4}
            rx={Math.max(6, geometry.cornerRadius - 2)}
            pathLength="100"
          />
          <rect
            className="toki-status-ring__region-orbit"
            x="2"
            y="2"
            width={geometry.width - 4}
            height={geometry.height - 4}
            rx={Math.max(6, geometry.cornerRadius - 2)}
            pathLength="100"
          />
          <rect
            className="toki-status-ring__region-progress"
            x="2"
            y="2"
            width={geometry.width - 4}
            height={geometry.height - 4}
            rx={Math.max(6, geometry.cornerRadius - 2)}
            pathLength="100"
          />
        </svg>
      ) : (
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
      )}
    </span>
  );
}
