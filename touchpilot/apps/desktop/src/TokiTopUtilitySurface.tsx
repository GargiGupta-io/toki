import { useState } from "react";
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
  idleStatusText,
  onVoicePressStart,
  onVoicePressEnd,
  onRefreshCapture,
  onPauseToggle,
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
  idleStatusText: string;
  onVoicePressStart: () => void;
  onVoicePressEnd: () => void;
  onRefreshCapture: () => void;
  onPauseToggle: () => void;
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
        <span className="toki-top-utility__signal" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="toki-top-utility__status-copy" aria-live="polite">
          <strong>{visibleStatus.label}</strong>
          <small>{visibleStatus.message}</small>
        </span>
        {expanded && (
          <span className="toki-top-utility__window-actions">
            <span>{isPaused ? "Paused" : "Active"}</span>
            <button type="button" onClick={onClose} aria-label="Close Toki controls">
              &times;
            </button>
          </span>
        )}
      </header>

      {expanded && (
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
            </div>
          ) : (
            <div className="toki-top-utility__tab-panel" role="tabpanel">
              <p className="toki-top-utility__hint">
                Screen context and assistant state.
              </p>
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
      )}
    </section>
  );
}
