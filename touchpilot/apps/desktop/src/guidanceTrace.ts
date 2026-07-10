import type {
  GuidanceProviderMode,
  GuidanceTrace,
  GuidanceTraceDetail,
  GuidanceTraceSource,
  GuidanceTraceStage,
  GuidanceTraceStageStatus,
} from "@toki/shared";

type CreateGuidanceTraceOptions = {
  id?: string;
  goal: string;
  providerMode: GuidanceProviderMode;
  source: GuidanceTraceSource;
  startedAt?: string;
};

type FinishGuidanceTraceStageOptions = {
  status?: Exclude<GuidanceTraceStageStatus, "pending">;
  summary?: string;
  details?: Record<string, GuidanceTraceDetail>;
  completedAt?: string;
};

function createFallbackTraceId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `guidance-${Date.now().toString(36)}-${randomPart}`;
}

export function createGuidanceTraceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? createFallbackTraceId();
}

export function createGuidanceTrace({
  id = createGuidanceTraceId(),
  goal,
  providerMode,
  source,
  startedAt = new Date().toISOString(),
}: CreateGuidanceTraceOptions): GuidanceTrace {
  return {
    schemaVersion: 1,
    id,
    goal,
    providerMode,
    source,
    startedAt,
    updatedAt: startedAt,
    events: [],
  };
}

export function beginGuidanceTraceStage(
  trace: GuidanceTrace,
  stage: GuidanceTraceStage,
  summary?: string,
): GuidanceTrace {
  const startedAt = new Date().toISOString();
  const existingIndex = trace.events.findIndex((event) => event.stage === stage);
  const event = {
    stage,
    status: "pending" as const,
    startedAt,
    summary,
  };
  const events = [...trace.events];

  if (existingIndex >= 0) {
    events[existingIndex] = event;
  } else {
    events.push(event);
  }

  return {
    ...trace,
    updatedAt: startedAt,
    events,
  };
}

export function finishGuidanceTraceStage(
  trace: GuidanceTrace,
  stage: GuidanceTraceStage,
  {
    status = "completed",
    summary,
    details,
    completedAt = new Date().toISOString(),
  }: FinishGuidanceTraceStageOptions = {},
): GuidanceTrace {
  const existingIndex = trace.events.findIndex((event) => event.stage === stage);
  const existingEvent = existingIndex >= 0 ? trace.events[existingIndex] : null;
  const startedAt = existingEvent?.startedAt ?? completedAt;
  const durationMs = Math.max(
    0,
    Date.parse(completedAt) - Date.parse(startedAt),
  );
  const event = {
    stage,
    status,
    startedAt,
    completedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    summary: summary ?? existingEvent?.summary,
    details,
  };
  const events = [...trace.events];

  if (existingIndex >= 0) {
    events[existingIndex] = event;
  } else {
    events.push(event);
  }

  return {
    ...trace,
    updatedAt: completedAt,
    events,
  };
}

export function getGuidanceTraceEvent(
  trace: GuidanceTrace | null | undefined,
  stage: GuidanceTraceStage,
) {
  return trace?.events.find((event) => event.stage === stage) ?? null;
}
