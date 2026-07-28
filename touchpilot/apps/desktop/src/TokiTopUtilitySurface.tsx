import { useState } from "react";
import type {
  CameraPermissionState,
  CameraStreamStatus,
} from "@toki/shared";
import type {
  TokiTopStatusModel,
  TopUtilityMode,
} from "./topUtility";
import "./TokiTopUtilitySurface.css";

type UtilityTab = "voice" | "controls";

export function TokiTopUtilitySurface({
  mode,
  status,
  isPaused,
  isBusy,
  voiceActive,
  voiceLabel,
  voiceMessage,
  pointerExplanationSpeechMuted,
  cameraGesturesEnabled,
  cameraStatus,
  cameraPermission,
  cameraError,
  idleStatusText,
  onVoicePressStart,
  onVoicePressEnd,
  onRefreshCapture,
  onPauseToggle,
  onCameraGesturesToggle,
  onPointerExplanationSpeechMuteToggle,
  onRevealTarget,
  onStartDrag,
  onClose,
}: {
  mode: Exclude<TopUtilityMode, "hidden">;
  status: TokiTopStatusModel | null;
  isPaused: boolean;
  isBusy: boolean;
  voiceActive: boolean;
  voiceLabel: string;
  voiceMessage: string;
  pointerExplanationSpeechMuted: boolean;
  cameraGesturesEnabled: boolean;
  cameraStatus: CameraStreamStatus;
  cameraPermission: CameraPermissionState;
  cameraError: string | null;
  idleStatusText: string;
  onVoicePressStart: () => void;
  onVoicePressEnd: () => void;
  onRefreshCapture: () => void;
  onPauseToggle: () => void;
  onCameraGesturesToggle: () => void;
  onPointerExplanationSpeechMuteToggle: () => void;
  onRevealTarget: () => void;
  onStartDrag: () => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<UtilityTab>("voice");
  const expanded = mode === "expanded";
  const visibleStatus =
    status ??
    ({
      mode: isPaused ? "paused" : "ready",
      label: isPaused ? "Toki paused" : "Toki",
      message: idleStatusText,
    } satisfies TokiTopStatusModel);
  const cameraControlMessage = getCameraControlMessage({
    enabled: cameraGesturesEnabled,
    status: cameraStatus,
    permission: cameraPermission,
    error: cameraError,
  });

  return (
    <section
      className="toki-top-utility"
      data-mode={mode}
      data-status={visibleStatus.mode}
      aria-label="Toki top utility"
    >
      <header
        className="toki-top-utility__header"
        onPointerDown={(event) => {
          const target = event.target;
          if (
            expanded &&
            event.button === 0 &&
            target instanceof HTMLElement &&
            !target.closest("button")
          ) {
            onStartDrag();
          }
        }}
      >
        <span className="toki-top-utility__identity" aria-hidden="true">
          <span className="toki-top-utility__signal">
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="toki-top-utility__status-copy" aria-live="polite">
          <strong>{visibleStatus.label}</strong>
          <small><span>Toki</span> · {visibleStatus.message}</small>
        </span>
        <span className="toki-top-utility__window-actions">
            <span className="toki-top-utility__activity" data-paused={isPaused}>
              {isPaused ? "Paused" : "Active"}
            </span>
          {expanded && (
            <button type="button" onClick={onClose} aria-label="Close Toki controls">
              &times;
            </button>
          )}
        </span>
      </header>

      {expanded && visibleStatus.mode === "confirming" ? (
        <div className="toki-top-utility__expanded">
          <div className="toki-top-utility__reveal-panel">
            <p>
              Review the warning above. Toki will only reveal the guidance marker;
              it will not click or change anything.
            </p>
            <button type="button" onClick={onRevealTarget} autoFocus>
              Show target
            </button>
          </div>
        </div>
      ) : expanded ? (
        <div className="toki-top-utility__expanded">
          <nav className="toki-top-utility__tabs" role="tablist" aria-label="Toki controls">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "voice"}
              data-active={activeTab === "voice"}
              onClick={() => setActiveTab("voice")}
            >
              Voice
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "controls"}
              data-active={activeTab === "controls"}
              onClick={() => setActiveTab("controls")}
            >
              Controls
            </button>
          </nav>

          {activeTab === "voice" ? (
            <div className="toki-top-utility__tab-panel" role="tabpanel">
              <p className="toki-top-utility__hint">Hold Option anywhere.</p>
              <button
                className="toki-top-utility__talk"
                type="button"
                data-active={voiceActive}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onVoicePressStart();
                }}
                onPointerUp={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  onVoicePressEnd();
                }}
                onPointerCancel={onVoicePressEnd}
                onKeyDown={(event) => {
                  if (
                    !event.repeat &&
                    (event.key === " " || event.key === "Enter")
                  ) {
                    event.preventDefault();
                    onVoicePressStart();
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    onVoicePressEnd();
                  }
                }}
              >
                <span className="toki-top-utility__mini-signal" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>{voiceLabel}</strong>
                  <small>{voiceMessage}</small>
                </span>
              </button>
              <button
                className="toki-top-utility__speech-toggle"
                type="button"
                aria-pressed={pointerExplanationSpeechMuted}
                onClick={onPointerExplanationSpeechMuteToggle}
              >
                {pointerExplanationSpeechMuted
                  ? "Pointer explanations muted"
                  : "Pointer explanations spoken"}
              </button>
            </div>
          ) : (
            <div className="toki-top-utility__tab-panel" role="tabpanel">
              <button
                className="toki-top-utility__camera-toggle"
                type="button"
                aria-pressed={cameraGesturesEnabled}
                data-state={cameraStatus}
                onClick={onCameraGesturesToggle}
              >
                <span className="toki-top-utility__camera-indicator" aria-hidden="true" />
                <span>
                  <strong>
                    {getCameraControlLabel({
                      enabled: cameraGesturesEnabled,
                      status: cameraStatus,
                    })}
                  </strong>
                  <small>{cameraControlMessage}</small>
                </span>
              </button>
              <div className="toki-top-utility__commands">
                <button type="button" onClick={onRefreshCapture} disabled={isBusy}>
                  {isBusy ? "Updating..." : "Update screen"}
                </button>
                <button type="button" onClick={onPauseToggle}>
                  {isPaused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function getCameraControlMessage({
  enabled,
  status,
  permission,
  error,
}: {
  enabled: boolean;
  status: CameraStreamStatus;
  permission: CameraPermissionState;
  error: string | null;
}): string {
  if (!enabled || status === "disabled") {
    return "Camera is off. No hand frames are processed.";
  }

  if (status === "requesting_permission" || permission === "prompt") {
    return "Approve the macOS camera prompt to continue.";
  }

  if (status === "permission_denied" || permission === "denied") {
    return "Camera access is blocked in macOS System Settings.";
  }

  if (status === "no_camera") {
    return "No available camera was found.";
  }

  if (status === "error") {
    return error ?? "Camera + gestures could not start.";
  }

  if (status === "active") {
    return "On-device tracking active. Hold two fists for 2s to turn off.";
  }

  return "Preparing local hand tracking…";
}

function getCameraControlLabel({
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
