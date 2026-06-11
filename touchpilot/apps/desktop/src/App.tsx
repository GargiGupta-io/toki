import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import {
  createInvalidMockGuidance,
  createMockGuidance,
  createRiskyMockGuidance,
  validateGuidanceResult,
} from "@touchpilot/ai";
import type {
  CaptureMetadata,
  CoordinateCalibration,
  GuidanceRequest,
  GuidanceResult,
  GuidanceStep,
  GuidanceValidationIssue,
  ScreenshotCapture,
  ScreenshotMetadata,
  TargetBox,
} from "@touchpilot/shared";
import { getPuckMotionModel } from "./puckMotion";
import type { OverlayState, PuckMotionModel } from "./puckMotion";
import "./App.css";

type GuidanceFixture = "safe" | "risky" | "invalid";

type ViewportMetrics = {
  width: number;
  height: number;
  devicePixelRatio: number;
  updatedAt: string;
};

type PointerShadowPosition = {
  x: number;
  y: number;
};

type PuckTargetVector = {
  x: number;
  y: number;
};

type OverlayStateMeta = {
  label: string;
  title: string;
  description: string;
  tone: "neutral" | "active" | "paused" | "error";
};

type OverlaySnapshot = {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  isRefreshingCapture: boolean;
};

type DebugSnapshot = OverlaySnapshot & {
  guidanceFixture: GuidanceFixture;
  captureMetadata: CaptureMetadata | null;
  screenshotCapture: ScreenshotCapture | null;
  guidanceRequest: GuidanceRequest | null;
  guidanceResult: GuidanceResult | null;
  guidanceIssues: GuidanceValidationIssue[];
  captureError: string | null;
  viewport: ViewportMetrics;
  calibration: CoordinateCalibration;
};

type OverlayCommand =
  | { type: "refresh-capture" }
  | { type: "toggle-pause" }
  | { type: "request-state" }
  | { type: "set-state"; state: OverlayState }
  | { type: "set-guidance-fixture"; fixture: GuidanceFixture };

const overlayWindow = getCurrentWindow();
const currentWindowLabel = overlayWindow.label;

const testTarget = {
  label: "Export",
  x: 640,
  y: 360,
  width: 112,
  height: 48,
  instruction: "Click Export to continue this workflow.",
};

type RenderedGuidanceTarget = TargetBox & {
  instruction: string;
};

const stateMeta: Record<OverlayState, OverlayStateMeta> = {
  idle: {
    label: "Idle",
    title: "Ready to guide the current screen.",
    description:
      "The assistant is waiting for a prompt, voice command, or gesture trigger.",
    tone: "neutral",
  },
  listening: {
    label: "Listening",
    title: "Listening for the user's goal.",
    description: "Voice and gesture controls will connect to this state later.",
    tone: "active",
  },
  thinking: {
    label: "Thinking",
    title: "Reading the screen context.",
    description: "AI guidance will use this state while analyzing screenshots.",
    tone: "active",
  },
  guiding: {
    label: "Guiding",
    title: "Showing the next step.",
    description: "Pointer and step bubble guidance will connect to this state.",
    tone: "active",
  },
  paused: {
    label: "Paused",
    title: "Guidance is paused.",
    description: "The overlay stays visible, but active guidance is suspended.",
    tone: "paused",
  },
  error: {
    label: "Error",
    title: "The overlay needs attention.",
    description: "Errors will appear here when capture or guidance fails.",
    tone: "error",
  },
};

const debugOverlayStates: OverlayState[] = [
  "idle",
  "listening",
  "thinking",
  "guiding",
  "paused",
  "error",
];

const debugGuidanceFixtures: Array<{
  fixture: GuidanceFixture;
  label: string;
}> = [
  { fixture: "safe", label: "Safe" },
  { fixture: "risky", label: "Risky" },
  { fixture: "invalid", label: "Invalid" },
];

function AssistantPuck({
  state,
  motion,
  pointerShadow,
  targetVector,
}: {
  state: OverlayState;
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
  targetVector: PuckTargetVector | null;
}) {
  const meta = stateMeta[state];
  const puckStyle = {
    ...(pointerShadow == null
      ? {}
      : {
          "--puck-shadow-x": `${pointerShadow.x}px`,
          "--puck-shadow-y": `${pointerShadow.y}px`,
        }),
    ...(targetVector == null
      ? {}
      : {
          "--puck-target-x": `${targetVector.x}px`,
          "--puck-target-y": `${targetVector.y}px`,
        }),
  } as CSSProperties;

  return (
    <div
      className={`assistant-puck is-${meta.tone}`}
      data-motion={motion.state}
      data-pointer-shadow={motion.state === "shadow" && pointerShadow ? "active" : "idle"}
      data-target-droplets={motion.canSendTargetDroplets ? "enabled" : "disabled"}
      style={puckStyle}
      aria-label={`TouchPilot is ${meta.label.toLowerCase()}`}
    >
      <span className="puck-orbit" aria-hidden="true" />
      <span className="puck-droplets" aria-hidden="true">
        <span className="puck-droplet puck-droplet-a" />
        <span className="puck-droplet puck-droplet-b" />
        <span className="puck-droplet puck-droplet-c" />
        <span className="puck-droplet puck-droplet-d" />
      </span>
      <span className="puck-core" aria-hidden="true">
        <span className="puck-shadow-form" />
        <span className="puck-shadow-tail" />
      </span>
    </div>
  );
}

function PointerRing({ target }: { target: TargetBox }) {
  return (
    <div
      className="pointer-target"
      style={{
        left: target.x,
        top: target.y,
        width: target.width,
        height: target.height,
      }}
      aria-label={`Target marker for ${target.label}`}
    >
      <span className="pointer-pulse" aria-hidden="true" />
      <span className="pointer-crosshair" aria-hidden="true" />
    </div>
  );
}

function StepBubble({
  step,
  target,
  guidance,
}: {
  step: GuidanceStep | null;
  target: RenderedGuidanceTarget;
  guidance: GuidanceResult | null;
}) {
  const risk = guidance?.step?.risk ?? "safe_navigation";
  const requiresConfirmation = guidance?.step?.requiresConfirmation ?? false;

  return (
    <aside
      className="step-bubble"
      style={{
        left: target.x + target.width / 2 + 22,
        top: target.y - target.height / 2,
      }}
      aria-label={`Guidance step for ${target.label}`}
    >
      <span className="bubble-anchor" aria-hidden="true" />
      <p className="eyebrow">Step 1</p>
      <h3>{target.label}</h3>
      <p>{step?.instruction ?? target.instruction}</p>
      <div
        className="risk-strip"
        data-confirmation={requiresConfirmation ? "required" : "not-required"}
      >
        <span>{risk}</span>
        <strong>{requiresConfirmation ? "Confirm first" : "No confirmation"}</strong>
      </div>
    </aside>
  );
}

function SettingsPopup({
  overlayState,
  hasAcceptedGuidance,
  isRefreshingCapture,
  onRefreshCapture,
  onPauseToggle,
  onClose,
}: {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  isRefreshingCapture: boolean;
  onRefreshCapture: () => void;
  onPauseToggle: () => void;
  onClose: () => void;
}) {
  const isPaused = overlayState === "paused";

  return (
    <section className="settings-popup" aria-label="TouchPilot settings">
      <div className="settings-popup-header">
        <div>
          <p className="settings-popup-brand">TouchPilot</p>
          <h2>{isPaused ? "Paused" : "Active"}</h2>
        </div>
        <button
          className="settings-close-button"
          type="button"
          onClick={onClose}
          aria-label="Close settings"
        >
          x
        </button>
      </div>

      <div className="settings-chip-row" aria-label="Current runtime status">
        <span className="settings-chip">{stateMeta[overlayState].label}</span>
        <span className="settings-chip settings-chip-muted">
          {hasAcceptedGuidance ? "Target locked" : "Waiting"}
        </span>
      </div>

      <div className="settings-copy">
        <p className="settings-headline">Cursor assistant</p>
      </div>

      <div className="settings-actions" aria-label="Settings actions">
        <button
          className="settings-action-button settings-action-button-primary"
          type="button"
          onClick={onRefreshCapture}
          disabled={isRefreshingCapture}
        >
          {isRefreshingCapture ? "Refreshing" : "Refresh screen"}
        </button>
        <button
          className="settings-action-button"
          type="button"
          onClick={onPauseToggle}
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
      </div>
    </section>
  );
}

function getViewportMetrics(): ViewportMetrics {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    updatedAt: new Date().toISOString(),
  };
}

function getPointerShadowPosition(
  pointerX: number,
  pointerY: number,
  viewport: ViewportMetrics,
): PointerShadowPosition {
  const offsetX = 28;
  const offsetY = 30;
  const margin = 56;

  return {
    x: Math.min(Math.max(pointerX - offsetX, margin), viewport.width - margin),
    y: Math.min(Math.max(pointerY + offsetY, margin), viewport.height - margin),
  };
}

function getPuckTargetVector(
  target: TargetBox,
  viewport: ViewportMetrics,
): PuckTargetVector {
  const puckCenterX = viewport.width - 80;
  const puckCenterY = viewport.height - 140;

  return {
    x: target.x - puckCenterX,
    y: target.y - puckCenterY,
  };
}

function getCalibration(
  captureMetadata: CaptureMetadata | null,
  viewport: ViewportMetrics,
): CoordinateCalibration {
  const overlayWidth = viewport.width;
  const overlayHeight = viewport.height;
  const displayWidth = captureMetadata?.display.width ?? 0;
  const displayHeight = captureMetadata?.display.height ?? 0;
  const scaleFactor = captureMetadata?.display.scaleFactor ?? 1;

  if (!captureMetadata) {
    return {
      status: "unknown",
      overlayWidth,
      overlayHeight,
      displayWidth,
      displayHeight,
      scaleFactor,
      notes: "Waiting for capture metadata.",
    };
  }

  const sizeMatches = overlayWidth === displayWidth && overlayHeight === displayHeight;
  const scaleMatches = Math.abs(viewport.devicePixelRatio - scaleFactor) < 0.01;

  return {
    status: sizeMatches && scaleMatches ? "aligned" : "needs_check",
    overlayWidth,
    overlayHeight,
    displayWidth,
    displayHeight,
    scaleFactor,
    checkedAt: new Date().toISOString(),
    notes:
      sizeMatches && scaleMatches
        ? "Overlay viewport matches captured display dimensions and scale."
        : `Overlay/display mismatch. Delta ${overlayWidth - displayWidth}, ${
            overlayHeight - displayHeight
          }; DPR ${viewport.devicePixelRatio} vs capture scale ${scaleFactor}.`,
  };
}

function getScreenshotMetadata(screenshot: ScreenshotCapture): ScreenshotMetadata {
  return {
    source: screenshot.source,
    display: screenshot.display,
    cursor: screenshot.cursor,
    activeWindow: screenshot.activeWindow,
    capturedAt: screenshot.capturedAt,
    format: screenshot.format,
    byteLength: screenshot.byteLength,
    imageWidth: screenshot.imageWidth,
    imageHeight: screenshot.imageHeight,
  };
}

function createEmptyDebugSnapshot(): DebugSnapshot {
  const viewport = getViewportMetrics();

  return {
    overlayState: "idle",
    hasAcceptedGuidance: false,
    isRefreshingCapture: false,
    guidanceFixture: "safe",
    captureMetadata: null,
    screenshotCapture: null,
    guidanceRequest: null,
    guidanceResult: null,
    guidanceIssues: [],
    captureError: null,
    viewport,
    calibration: getCalibration(null, viewport),
  };
}

function OverlayWindowApp() {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [guidanceFixture, setGuidanceFixture] = useState<GuidanceFixture>("safe");
  const [captureMetadata, setCaptureMetadata] = useState<CaptureMetadata | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCapture | null>(null);
  const [guidanceRequest, setGuidanceRequest] = useState<GuidanceRequest | null>(null);
  const [guidanceResult, setGuidanceResult] = useState<GuidanceResult | null>(null);
  const [guidanceIssues, setGuidanceIssues] = useState<GuidanceValidationIssue[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [viewport, setViewport] = useState<ViewportMetrics>(() => getViewportMetrics());
  const [pointerShadow, setPointerShadow] = useState<PointerShadowPosition | null>(null);

  const activeStep = guidanceResult?.step ?? null;
  const acceptedStep = activeStep?.target != null ? activeStep : null;
  const acceptedTarget = acceptedStep?.target ?? null;
  const hasAcceptedGuidance = acceptedTarget != null;
  const activeTarget: RenderedGuidanceTarget =
    acceptedTarget != null && acceptedStep != null
      ? {
          ...acceptedTarget,
          instruction: acceptedStep.instruction,
        }
      : testTarget;
  const puckMotion = getPuckMotionModel({
    overlayState,
    hasAcceptedGuidance,
    hasActiveTarget: acceptedTarget != null,
    isRefreshingCapture,
    hasCaptureError: captureError != null,
    guidanceIssueCount: guidanceIssues.length,
  });
  const puckTargetVector =
    puckMotion.canSendTargetDroplets && acceptedTarget != null
      ? getPuckTargetVector(acceptedTarget, viewport)
      : null;
  const calibration = useMemo(
    () => getCalibration(captureMetadata, viewport),
    [captureMetadata, viewport],
  );

  const overlaySnapshot = useMemo<OverlaySnapshot>(
    () => ({
      overlayState,
      hasAcceptedGuidance,
      isRefreshingCapture,
    }),
    [overlayState, hasAcceptedGuidance, isRefreshingCapture],
  );

  const debugSnapshot = useMemo<DebugSnapshot>(
    () => ({
      ...overlaySnapshot,
      guidanceFixture,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceIssues,
      captureError,
      viewport,
      calibration,
    }),
    [
      overlaySnapshot,
      guidanceFixture,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceIssues,
      captureError,
      viewport,
      calibration,
    ],
  );

  async function publishRuntimeSnapshots() {
    await emitTo("settings", "touchpilot://overlay-state", overlaySnapshot).catch(
      () => undefined,
    );
    await emitTo("debug", "touchpilot://debug-state", debugSnapshot).catch(
      () => undefined,
    );
  }

  async function refreshCaptureMetadata() {
    setIsRefreshingCapture(true);
    setCaptureError(null);
    setGuidanceIssues([]);
    setGuidanceRequest(null);
    setGuidanceResult(null);
    setCaptureMetadata(null);
    setScreenshotCapture(null);
    setOverlayState("thinking");

    try {
      const [metadata, screenshot] = await Promise.all([
        invoke<CaptureMetadata>("capture_metadata"),
        invoke<ScreenshotCapture>("capture_screenshot"),
      ]);

      setCaptureMetadata(metadata);
      setScreenshotCapture(screenshot);
      const nextGuidanceRequest: GuidanceRequest = {
        goal: "Show me what to click next.",
        screen: {
          display: metadata.display,
          capture: metadata,
          screenshot: getScreenshotMetadata(screenshot),
          calibration: getCalibration(metadata, viewport),
        },
        previousStep: guidanceResult?.step ?? null,
      };
      const nextGuidance =
        guidanceFixture === "invalid"
          ? createInvalidMockGuidance(nextGuidanceRequest)
          : guidanceFixture === "risky"
            ? createRiskyMockGuidance(nextGuidanceRequest)
            : createMockGuidance(nextGuidanceRequest);
      const validation = validateGuidanceResult(nextGuidance);

      setGuidanceRequest(nextGuidanceRequest);
      setGuidanceIssues(validation.issues);
      setGuidanceResult(validation.valid ? nextGuidance : null);
      setOverlayState(validation.valid ? "guiding" : "error");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCaptureError(message);
      setGuidanceRequest(null);
      setGuidanceIssues([]);
      setGuidanceResult(null);
      setOverlayState("error");
    } finally {
      setIsRefreshingCapture(false);
    }
  }

  useEffect(() => {
    overlayWindow.setIgnoreCursorEvents(true).catch(() => undefined);
    overlayWindow.setFocusable(false).catch(() => undefined);
  }, []);

  useEffect(() => {
    function handleResize() {
      setViewport(getViewportMetrics());
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function syncCursorShadow() {
      try {
        const position = await cursorPosition();

        if (!disposed) {
          setPointerShadow(getPointerShadowPosition(position.x, position.y, viewport));
        }
      } catch {
        return;
      }
    }

    void syncCursorShadow();
    const timer = window.setInterval(() => {
      void syncCursorShadow();
    }, 32);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [viewport]);

  useEffect(() => {
    void publishRuntimeSnapshots();
  }, [overlaySnapshot, debugSnapshot]);

  useEffect(() => {
    let unlistenCommand: (() => void) | undefined;

    listen<OverlayCommand>("touchpilot://overlay-command", async (event) => {
      if (event.payload.type === "refresh-capture") {
        await refreshCaptureMetadata();
        return;
      }

      if (event.payload.type === "toggle-pause") {
        setOverlayState((currentState) =>
          currentState === "paused" ? "guiding" : "paused",
        );
        return;
      }

      if (event.payload.type === "request-state") {
        await publishRuntimeSnapshots();
      }

      if (event.payload.type === "set-state") {
        setOverlayState(event.payload.state);
        return;
      }

      if (event.payload.type === "set-guidance-fixture") {
        setGuidanceFixture(event.payload.fixture);
        return;
      }
    })
      .then((cleanup) => {
        unlistenCommand = cleanup;
      })
      .catch(() => {
        unlistenCommand = undefined;
      });

    return () => {
      unlistenCommand?.();
    };
  }, [overlaySnapshot, debugSnapshot, viewport, guidanceResult]);

  return (
    <main
      className={`overlay-shell is-${stateMeta[overlayState].tone}`}
      aria-label="TouchPilot overlay"
    >
      {overlayState !== "idle" && hasAcceptedGuidance && (
        <>
          <PointerRing target={activeTarget} />
          <StepBubble step={activeStep} target={activeTarget} guidance={guidanceResult} />
        </>
      )}
      <AssistantPuck
        state={overlayState}
        motion={puckMotion}
        pointerShadow={pointerShadow}
        targetVector={puckTargetVector}
      />
    </main>
  );
}

function SettingsWindowApp() {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [hasAcceptedGuidance, setHasAcceptedGuidance] = useState(false);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);

  function hideSettings() {
    overlayWindow.hide().catch(() => undefined);
  }

  useEffect(() => {
    let unlistenState: (() => void) | undefined;

    listen<OverlaySnapshot>("touchpilot://overlay-state", (event) => {
      setOverlayState(event.payload.overlayState);
      setHasAcceptedGuidance(event.payload.hasAcceptedGuidance);
      setIsRefreshingCapture(event.payload.isRefreshingCapture);
    })
      .then((cleanup) => {
        unlistenState = cleanup;
      })
      .catch(() => {
        unlistenState = undefined;
      });

    emitTo("overlay", "touchpilot://overlay-command", {
      type: "request-state",
    } satisfies OverlayCommand).catch(() => undefined);

    return () => {
      unlistenState?.();
    };
  }, []);

  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;

    overlayWindow
      .onFocusChanged((event) => {
        if (!event.payload) {
          hideSettings();
        }
      })
      .then((cleanup) => {
        unlistenFocus = cleanup;
      })
      .catch(() => {
        unlistenFocus = undefined;
      });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hideSettings();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlistenFocus?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <main className="settings-shell" aria-label="TouchPilot settings window">
      <SettingsPopup
        overlayState={overlayState}
        hasAcceptedGuidance={hasAcceptedGuidance}
        isRefreshingCapture={isRefreshingCapture}
        onRefreshCapture={() => {
          emitTo("overlay", "touchpilot://overlay-command", {
            type: "refresh-capture",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onPauseToggle={() => {
          emitTo("overlay", "touchpilot://overlay-command", {
            type: "toggle-pause",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onClose={() => {
          hideSettings();
        }}
      />
    </main>
  );
}

function DebugWindowApp() {
  const [snapshot, setSnapshot] = useState<DebugSnapshot>(() =>
    createEmptyDebugSnapshot(),
  );
  const screenshot = snapshot.screenshotCapture;
  const guidanceStep = snapshot.guidanceResult?.step ?? null;
  const target = guidanceStep?.target ?? null;

  function sendOverlayCommand(command: OverlayCommand) {
    emitTo("overlay", "touchpilot://overlay-command", command).catch(() => undefined);
  }

  useEffect(() => {
    let unlistenState: (() => void) | undefined;

    listen<DebugSnapshot>("touchpilot://debug-state", (event) => {
      setSnapshot(event.payload);
    })
      .then((cleanup) => {
        unlistenState = cleanup;
      })
      .catch(() => {
        unlistenState = undefined;
      });

    emitTo("overlay", "touchpilot://overlay-command", {
      type: "request-state",
    } satisfies OverlayCommand).catch(() => undefined);

    return () => {
      unlistenState?.();
    };
  }, []);

  return (
    <main className="debug-shell" aria-label="TouchPilot debug window">
      <section className="debug-window">
        <header className="debug-window-header">
          <div>
            <p>Internal</p>
            <h1>TouchPilot Debug</h1>
          </div>
          <button
            className="debug-close-button"
            type="button"
            onClick={() => {
              overlayWindow.hide().catch(() => undefined);
            }}
          >
            Close
          </button>
        </header>

        <div className="debug-actions">
          <button
            type="button"
            onClick={() => {
              sendOverlayCommand({ type: "refresh-capture" });
            }}
            disabled={snapshot.isRefreshingCapture}
          >
            {snapshot.isRefreshingCapture ? "Refreshing" : "Refresh capture"}
          </button>
          <button
            type="button"
            onClick={() => {
              sendOverlayCommand({ type: "toggle-pause" });
            }}
          >
            {snapshot.overlayState === "paused" ? "Resume overlay" : "Pause overlay"}
          </button>
          <button
            type="button"
            onClick={() => {
              sendOverlayCommand({ type: "request-state" });
            }}
          >
            Sync state
          </button>
        </div>

        <div className="debug-window-grid">
          <section className="debug-section">
            <h2>State Controls</h2>
            <div className="debug-toggle-grid">
              {debugOverlayStates.map((state) => (
                <button
                  key={state}
                  type="button"
                  data-active={snapshot.overlayState === state}
                  onClick={() => {
                    sendOverlayCommand({ type: "set-state", state });
                  }}
                >
                  {stateMeta[state].label}
                </button>
              ))}
            </div>
          </section>

          <section className="debug-section">
            <h2>Fixture Controls</h2>
            <div className="debug-toggle-grid">
              {debugGuidanceFixtures.map((option) => (
                <button
                  key={option.fixture}
                  type="button"
                  data-active={snapshot.guidanceFixture === option.fixture}
                  onClick={() => {
                    sendOverlayCommand({
                      type: "set-guidance-fixture",
                      fixture: option.fixture,
                    });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="debug-section">
            <h2>Runtime</h2>
            <dl>
              <div>
                <dt>State</dt>
                <dd>{stateMeta[snapshot.overlayState].label}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{snapshot.hasAcceptedGuidance ? "Accepted" : "None"}</dd>
              </div>
              <div>
                <dt>Viewport</dt>
                <dd>
                  {snapshot.viewport.width} x {snapshot.viewport.height}
                </dd>
              </div>
              <div>
                <dt>DPR</dt>
                <dd>{snapshot.viewport.devicePixelRatio}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{snapshot.viewport.updatedAt}</dd>
              </div>
              <div>
                <dt>Fixture</dt>
                <dd>{snapshot.guidanceFixture}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Capture</h2>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{snapshot.captureError ?? (screenshot ? "Ready" : "Waiting")}</dd>
              </div>
              <div>
                <dt>Display</dt>
                <dd>
                  {snapshot.captureMetadata
                    ? `${snapshot.captureMetadata.display.width} x ${snapshot.captureMetadata.display.height}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Image</dt>
                <dd>
                  {screenshot
                    ? `${screenshot.imageWidth} x ${screenshot.imageHeight}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Bytes</dt>
                <dd>{screenshot ? screenshot.byteLength : "None"}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{screenshot?.format ?? "None"}</dd>
              </div>
              <div>
                <dt>Cursor</dt>
                <dd>
                  {snapshot.captureMetadata?.cursor
                    ? `${snapshot.captureMetadata.cursor.x}, ${snapshot.captureMetadata.cursor.y}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Active app</dt>
                <dd>{snapshot.captureMetadata?.activeWindow?.appName ?? "None"}</dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>{snapshot.captureMetadata?.activeWindow?.title ?? "None"}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Guidance</h2>
            <dl>
              <div>
                <dt>Request</dt>
                <dd>{snapshot.guidanceRequest ? "Present" : "None"}</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd>{guidanceStep?.risk ?? "None"}</dd>
              </div>
              <div>
                <dt>Confirm</dt>
                <dd>{guidanceStep?.requiresConfirmation ? "Required" : "Not required"}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{snapshot.guidanceResult?.mode ?? "None"}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {guidanceStep ? `${Math.round(guidanceStep.confidence * 100)}%` : "None"}
                </dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>
                  {snapshot.guidanceIssues.length === 0
                    ? "No issues"
                    : `${snapshot.guidanceIssues.length} issue(s)`}
                </dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{target?.label ?? "None"}</dd>
              </div>
              <div>
                <dt>Box</dt>
                <dd>
                  {target
                    ? `${target.x}, ${target.y}, ${target.width} x ${target.height}`
                    : "None"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Calibration</h2>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{snapshot.calibration.status}</dd>
              </div>
              <div>
                <dt>Overlay</dt>
                <dd>
                  {snapshot.calibration.overlayWidth} x{" "}
                  {snapshot.calibration.overlayHeight}
                </dd>
              </div>
              <div>
                <dt>Display</dt>
                <dd>
                  {snapshot.calibration.displayWidth} x{" "}
                  {snapshot.calibration.displayHeight}
                </dd>
              </div>
              <div>
                <dt>Scale</dt>
                <dd>{snapshot.calibration.scaleFactor}</dd>
              </div>
            </dl>
            <p>{snapshot.calibration.notes}</p>
          </section>
        </div>

        {snapshot.guidanceIssues.length > 0 && (
          <section className="debug-section debug-section-wide">
            <h2>Validation Issues</h2>
            <ul>
              {snapshot.guidanceIssues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <strong>{issue.path}</strong>: {issue.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {screenshot && (
          <figure className="debug-screenshot-preview">
            <img
              src={`data:image/${screenshot.format};base64,${screenshot.imageBase64}`}
              alt="Latest screen capture preview"
            />
            <figcaption>Latest capture preview</figcaption>
          </figure>
        )}
      </section>
    </main>
  );
}

function App() {
  if (currentWindowLabel === "settings") {
    return <SettingsWindowApp />;
  }

  if (currentWindowLabel === "debug") {
    return <DebugWindowApp />;
  }

  return <OverlayWindowApp />;
}

export default App;
