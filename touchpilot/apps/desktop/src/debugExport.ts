import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScreenshotCapture } from "@toki/shared";

const DEBUG_EXPORT_INTERVAL_MS = 500;
const MAX_PENDING_HISTORY_ENTRIES = 80;

const omittedPayloadKeys = new Set(["imageBase64", "audioBase64"]);
const secretKeyPattern =
  /^(?:authorization|apiKey|api_key|accessToken|access_token|refreshToken|refresh_token|bearer|secret)$/i;

export type TokiDebugExportStatus = {
  directory: string;
  snapshotPath: string;
  historyPath: string;
  capturePath: string | null;
  snapshotExists: boolean;
  historyExists: boolean;
  lastSnapshotModifiedMs: number | null;
};

type DebugExportHistoryEntry = {
  sequence: number;
  recordedAt: string;
  state: unknown;
  /**
   * Everything the Guidance tab shows, kept only for the entries that failed.
   *
   * The history has always held a compact summary per transition, and the full
   * picture -- the per-stage trace, the provider's raw answer, the ranked
   * candidates, the payload gate -- lived only in `latest.json`, which is
   * overwritten every half second. So the one moment worth reading was gone
   * before anyone could read it, and the file that survived said `null` where
   * the answer had been.
   *
   * That is not a small inconvenience. It is the difference between diagnosing
   * a failure from the record and asking somebody to photograph a window.
   *
   * Attached only on failure, so an ordinary session does not carry a full
   * snapshot per transition. Image and audio payloads are stripped by the same
   * sanitiser as everything else.
   */
  detail?: unknown;
};

/**
 * The parts of a snapshot that explain a guidance failure.
 *
 * Named explicitly rather than taking the whole snapshot: the rest is gesture
 * and camera state that says nothing about why a request failed, and this is
 * written to disk on somebody's machine.
 */
const GUIDANCE_DETAIL_KEYS = [
  "guidanceTrace",
  "guidanceProviderDebug",
  "guidanceProviderError",
  "guidanceProviderName",
  "guidanceRequest",
  "guidanceResult",
  "guidanceIssues",
  "guidanceSession",
  "captureMetadata",
  "captureError",
  "calibration",
  "safetyDecision",
  "voiceRuntime",
] as const;

function readGuidanceFailureDetail(snapshot: unknown): unknown {
  if (snapshot == null || typeof snapshot !== "object") {
    return undefined;
  }

  const source = snapshot as Record<string, unknown>;
  const failed =
    source.guidanceProviderError != null || source.captureError != null;

  if (!failed) {
    return undefined;
  }

  const detail: Record<string, unknown> = {};

  for (const key of GUIDANCE_DETAIL_KEYS) {
    if (source[key] !== undefined) {
      detail[key] = source[key];
    }
  }

  return Object.keys(detail).length > 0 ? detail : undefined;
}

type DebugExportEnvelope = {
  schemaVersion: 1;
  sequence: number;
  exportedAt: string;
  snapshot: unknown;
};

type DebugExportCapture = {
  format: ScreenshotCapture["format"];
  imageBase64: string;
  byteLength: number;
  capturedAt: string;
};

type DebugExportRequest = {
  snapshot: DebugExportEnvelope;
  historyEntries: DebugExportHistoryEntry[];
  capture: DebugExportCapture | null;
};

type PendingDebugExport = DebugExportRequest;

export function sanitizeDebugExportValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugExportValue(item, seen));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[circular reference omitted]";
  }
  seen.add(value);

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (omittedPayloadKeys.has(key)) {
      sanitized[key] = {
        omitted: true,
        encodedLength: typeof item === "string" ? item.length : 0,
      };
      continue;
    }

    if (secretKeyPattern.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }

    sanitized[key] = sanitizeDebugExportValue(item, seen);
  }

  seen.delete(value);
  return sanitized;
}

export function getTokiDebugExportStatus(): Promise<TokiDebugExportStatus> {
  return invoke<TokiDebugExportStatus>("toki_debug_export_status");
}

export function clearTokiDebugExport(): Promise<void> {
  return invoke<void>("clear_toki_debug_export");
}

export function useTokiDebugExport({
  snapshot,
  transitionState,
  screenshot,
  diagnosticsEnabled,
  screenCapturesEnabled,
}: {
  snapshot: unknown;
  transitionState: unknown;
  screenshot: ScreenshotCapture | null;
  diagnosticsEnabled: boolean;
  screenCapturesEnabled: boolean;
}) {
  const sequenceRef = useRef(0);
  const lastTransitionSignatureRef = useRef<string | null>(null);
  const lastCaptureSignatureRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingDebugExport | null>(null);
  const pendingHistoryRef = useRef<DebugExportHistoryEntry[]>([]);
  const timerRef = useRef<number | null>(null);
  const writeInFlightRef = useRef(false);
  const lastWriteAtRef = useRef(0);
  const mountedRef = useRef(true);
  // A write can already be scheduled when consent is withdrawn. flush() runs
  // from a timer rather than from the effect, so it needs its own view of the
  // current setting instead of the value captured when it was scheduled.
  const diagnosticsEnabledRef = useRef(diagnosticsEnabled);
  diagnosticsEnabledRef.current = diagnosticsEnabled;

  async function flush() {
    if (
      !mountedRef.current ||
      !diagnosticsEnabledRef.current ||
      writeInFlightRef.current ||
      pendingRef.current == null
    ) {
      return;
    }

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingRef.current;
    pendingRef.current = null;
    writeInFlightRef.current = true;
    lastWriteAtRef.current = Date.now();

    try {
      await invoke("write_toki_debug_export", {
        request: {
          ...pending,
          snapshot: {
            ...pending.snapshot,
            snapshot: sanitizeDebugExportValue(pending.snapshot.snapshot),
          },
        },
      });
    } catch {
      const current = pendingRef.current as PendingDebugExport | null;
      pendingRef.current = current == null
        ? pending
        : {
            ...current,
            historyEntries: [
              ...pending.historyEntries,
              ...current.historyEntries,
            ].slice(-MAX_PENDING_HISTORY_ENTRIES),
            capture: current.capture ?? pending.capture,
          };
    } finally {
      writeInFlightRef.current = false;
    }

    if (
      mountedRef.current &&
      pendingRef.current != null &&
      timerRef.current == null
    ) {
      const remaining = Math.max(
        0,
        DEBUG_EXPORT_INTERVAL_MS - (Date.now() - lastWriteAtRef.current),
      );
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, remaining);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Nothing is queued and nothing already queued survives. Without dropping
    // the pending payload here, whatever was captured before consent was
    // withdrawn would still be sitting in memory waiting to be written the
    // moment diagnostics were switched back on.
    if (!diagnosticsEnabled) {
      pendingRef.current = null;
      pendingHistoryRef.current = [];
      lastTransitionSignatureRef.current = null;
      lastCaptureSignatureRef.current = null;
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    const exportedAt = new Date().toISOString();
    const transitionSignature = JSON.stringify(transitionState);

    if (transitionSignature !== lastTransitionSignatureRef.current) {
      lastTransitionSignatureRef.current = transitionSignature;
      const detail = readGuidanceFailureDetail(snapshot);

      pendingHistoryRef.current.push({
        sequence,
        recordedAt: exportedAt,
        state: sanitizeDebugExportValue(transitionState),
        ...(detail === undefined
          ? {}
          : { detail: sanitizeDebugExportValue(detail) }),
      });
      pendingHistoryRef.current = pendingHistoryRef.current.slice(
        -MAX_PENDING_HISTORY_ENTRIES,
      );
    }

    const captureSignature =
      screenCapturesEnabled && screenshot
        ? `${screenshot.format}:${screenshot.capturedAt}:${screenshot.byteLength}`
        : null;
    const capture =
      screenCapturesEnabled &&
      screenshot != null &&
      captureSignature !== lastCaptureSignatureRef.current
        ? {
            format: screenshot.format,
            imageBase64: screenshot.imageBase64,
            byteLength: screenshot.byteLength,
            capturedAt: screenshot.capturedAt,
          }
        : null;

    if (capture != null) {
      lastCaptureSignatureRef.current = captureSignature;
    }

    const previousPending = pendingRef.current;
    pendingRef.current = {
      snapshot: {
        schemaVersion: 1,
        sequence,
        exportedAt,
        snapshot,
      },
      historyEntries: [
        ...(previousPending?.historyEntries ?? []),
        ...pendingHistoryRef.current,
      ].slice(-MAX_PENDING_HISTORY_ENTRIES),
      // Carrying a previously queued image forward would let a screenshot
      // taken while captures were enabled land on disk after they were turned
      // off, so the switch discards it rather than merely stopping new ones.
      capture: screenCapturesEnabled
        ? (capture ?? previousPending?.capture ?? null)
        : null,
    };
    pendingHistoryRef.current = [];

    if (!writeInFlightRef.current && timerRef.current == null) {
      const remaining = Math.max(
        0,
        DEBUG_EXPORT_INTERVAL_MS - (Date.now() - lastWriteAtRef.current),
      );
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, remaining);
    }

  }, [
    diagnosticsEnabled,
    screenCapturesEnabled,
    screenshot,
    snapshot,
    transitionState,
  ]);
}
