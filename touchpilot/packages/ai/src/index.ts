import type {
  GuidanceProviderRequest,
  GuidanceRequest,
  GuidanceProviderResponse,
  GuidanceResult,
  GuidanceValidationIssue,
  GuidanceValidationResult,
  RiskClass,
  SafetyPolicyDecision,
  SafetyPolicyInput,
  ScreenCandidate,
  TargetBox,
  UiElement,
  UiElementProvenance,
  UiElementRole,
  UiElementSource,
  WorkflowPlan,
  WorkflowStep,
  WorkflowStepKind,
} from "@toki/shared";

const validRiskClasses: RiskClass[] = [
  "safe_navigation",
  "form_entry",
  "external_send",
  "delete",
  "payment",
  "security_change",
  "account_change",
  "permission_change",
  "unknown_risky",
];

const confirmationRequiredRisks: RiskClass[] = [
  "external_send",
  "delete",
  "payment",
  "security_change",
  "account_change",
  "permission_change",
  "unknown_risky",
];

const sourceTrust: Record<UiElementSource, number> = {
  "browser-dom": 6,
  manual: 5,
  accessibility: 4,
  ocr: 3,
  vision: 2,
  screenshot: 1,
};

const riskyTargetWords = new Set([
  "delete",
  "remove",
  "revoke",
  "pay",
  "send",
  "transfer",
  "password",
  "secret",
  "token",
  "billing",
  "admin",
  "permission",
]);

export type CandidateFusionOptions = {
  capturedAt?: string;
  mergeDistance?: number;
};

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function candidateSource(candidate: ScreenCandidate): UiElementSource {
  if (candidate.source === "dom" || candidate.role.startsWith("dom_")) {
    return "browser-dom";
  }

  if (candidate.source === "ocr" || candidate.role === "ocr_text") {
    return "ocr";
  }

  if (candidate.source === "accessibility") {
    return "accessibility";
  }

  if (candidate.source === "manual" || candidate.role === "manual") {
    return "manual";
  }

  return "screenshot";
}

function candidateConfidence(candidate: ScreenCandidate, source: UiElementSource): number {
  const metadataConfidence = Number(candidate.metadata?.confidence);

  if (Number.isFinite(metadataConfidence)) {
    return Math.max(0, Math.min(1, metadataConfidence));
  }

  if (source === "browser-dom") {
    return 0.9;
  }

  if (source === "manual") {
    return 1;
  }

  if (source === "accessibility") {
    return 0.78;
  }

  if (source === "ocr") {
    return 0.66;
  }

  return 0.5;
}

function isValidCandidate(candidate: ScreenCandidate): boolean {
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.width) &&
    Number.isFinite(candidate.height) &&
    candidate.width > 0 &&
    candidate.height > 0
  );
}

function isInteractableRole(role: UiElementRole): boolean {
  return /button|link|input|select|textarea|checkbox|radio|tab|manual|accessibility/.test(
    role,
  );
}

function hasRiskyText(label: string): boolean {
  return normalizeText(label)
    .split(/[^a-z0-9]+/g)
    .some((token) => riskyTargetWords.has(token));
}

function candidateToElement(
  candidate: ScreenCandidate,
  options: CandidateFusionOptions,
): UiElement {
  const source = candidateSource(candidate);
  const confidence = candidateConfidence(candidate, source);
  const provenance: UiElementProvenance = {
    source,
    sourceId: candidate.id,
    capturedAt: options.capturedAt,
    confidence,
  };

  return {
    id: `element-${source}-${candidate.id}`,
    primarySource: source,
    sources: [provenance],
    role: candidate.role,
    label: candidate.label.trim(),
    bounds: {
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
    },
    confidence,
    visible: true,
    interactable: isInteractableRole(candidate.role),
    risky: hasRiskyText(candidate.label),
    sourceCandidateIds: [candidate.id],
    metadata: candidate.metadata,
  };
}

function centerDistance(a: UiElement, b: UiElement): number {
  const ax = a.bounds.x + a.bounds.width / 2;
  const ay = a.bounds.y + a.bounds.height / 2;
  const bx = b.bounds.x + b.bounds.width / 2;
  const by = b.bounds.y + b.bounds.height / 2;

  return Math.hypot(ax - bx, ay - by);
}

function overlapRatio(a: UiElement, b: UiElement): number {
  const left = Math.max(a.bounds.x, b.bounds.x);
  const top = Math.max(a.bounds.y, b.bounds.y);
  const right = Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width);
  const bottom = Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(
    a.bounds.width * a.bounds.height,
    b.bounds.width * b.bounds.height,
  );

  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function shouldMergeElements(
  existing: UiElement,
  incoming: UiElement,
  mergeDistance: number,
): boolean {
  return (
    normalizeText(existing.label) === normalizeText(incoming.label) &&
    (centerDistance(existing, incoming) <= mergeDistance ||
      overlapRatio(existing, incoming) >= 0.65)
  );
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function mergeElements(existing: UiElement, incoming: UiElement): UiElement {
  const incomingIsBetterSource =
    sourceTrust[incoming.primarySource] > sourceTrust[existing.primarySource];
  const incomingIsMoreConfident = incoming.confidence > existing.confidence;
  const preferred = incomingIsBetterSource || incomingIsMoreConfident ? incoming : existing;
  const other = preferred === incoming ? existing : incoming;

  return {
    ...preferred,
    alternateLabels: uniqueValues([
      ...(preferred.alternateLabels ?? []),
      ...(other.alternateLabels ?? []),
      preferred.label,
      other.label,
    ]).filter((label) => normalizeText(label) !== normalizeText(preferred.label)),
    sources: [...existing.sources, ...incoming.sources],
    confidence: Math.max(existing.confidence, incoming.confidence),
    visible: existing.visible || incoming.visible,
    interactable: Boolean(existing.interactable || incoming.interactable),
    risky: Boolean(existing.risky || incoming.risky),
    sourceCandidateIds: uniqueValues([
      ...(existing.sourceCandidateIds ?? []),
      ...(incoming.sourceCandidateIds ?? []),
    ]),
    metadata: {
      ...(other.metadata ?? {}),
      ...(preferred.metadata ?? {}),
    },
  };
}

export function fuseScreenCandidates(
  candidates: ScreenCandidate[] | undefined,
  options: CandidateFusionOptions = {},
): UiElement[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const mergeDistance = options.mergeDistance ?? 12;
  const elements: UiElement[] = [];

  for (const candidate of candidates) {
    if (!isValidCandidate(candidate)) {
      continue;
    }

    const incoming = candidateToElement(candidate, options);
    const matchIndex = elements.findIndex((existing) =>
      shouldMergeElements(existing, incoming, mergeDistance),
    );

    if (matchIndex >= 0) {
      elements[matchIndex] = mergeElements(elements[matchIndex], incoming);
    } else {
      elements.push(incoming);
    }
  }

  return elements;
}

export function createMockGuidance(request: GuidanceRequest): GuidanceResult {
  const targetWidth = 112;
  const targetHeight = 48;
  const x = Math.round(request.screen.display.width / 2);
  const y = Math.round(request.screen.display.height / 2);

  return {
    mode: "guide",
    summary: `Mock guidance for: ${request.goal}`,
    step: {
      instruction: "Click the highlighted target to continue.",
      target: {
        label: "Mock target",
        x,
        y,
        width: targetWidth,
        height: targetHeight,
      },
      confidence: 0.82,
      risk: "safe_navigation",
      requiresConfirmation: false,
    },
  };
}

export function createRiskyMockGuidance(request: GuidanceRequest): GuidanceResult {
  const targetWidth = 138;
  const targetHeight = 44;
  const x = Math.round(request.screen.display.width / 2);
  const y = Math.round(request.screen.display.height / 2 + 86);

  return {
    mode: "guide",
    summary: `Risky mock guidance for: ${request.goal}`,
    step: {
      instruction: "Review this payment action, then confirm before continuing.",
      target: {
        label: "Pay now",
        x,
        y,
        width: targetWidth,
        height: targetHeight,
      },
      confidence: 0.76,
      risk: "payment",
      requiresConfirmation: true,
    },
  };
}

export function createLowConfidenceMockGuidance(
  request: GuidanceRequest,
): GuidanceResult {
  const targetWidth = 118;
  const targetHeight = 42;
  const x = Math.round(request.screen.display.width / 2 - 140);
  const y = Math.round(request.screen.display.height / 2 + 54);

  return {
    mode: "guide",
    summary: `Low-confidence mock guidance for: ${request.goal}`,
    step: {
      instruction: "This target is intentionally uncertain for safety QA.",
      target: {
        label: "Maybe target",
        x,
        y,
        width: targetWidth,
        height: targetHeight,
      },
      confidence: 0.42,
      risk: "safe_navigation",
      requiresConfirmation: false,
    },
  };
}

export function createInvalidMockGuidance(request: GuidanceRequest): GuidanceResult {
  return {
    mode: "guide",
    summary: `Invalid mock guidance for: ${request.goal}`,
    step: {
      instruction: "This intentionally invalid fixture should be rejected.",
      target: {
        label: "Broken target",
        x: Number.NaN,
        y: Math.round(request.screen.display.height / 2),
        width: 0,
        height: 44,
      },
      confidence: 1.4,
      risk: "payment",
      requiresConfirmation: false,
    },
  };
}

export type RealGuidanceProviderOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

export async function requestRealGuidance(
  request: GuidanceProviderRequest,
  options: RealGuidanceProviderOptions = {},
): Promise<GuidanceProviderResponse> {
  const endpoint = options.endpoint?.trim();

  if (!endpoint) {
    return {
      mode: "unavailable",
      error:
        "No real guidance provider endpoint is configured. Set VITE_TOKI_GUIDANCE_ENDPOINT for local smoke tests.",
      providerName: "none",
    };
  }

  const fetcher = options.fetchImpl ?? fetch;

  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return {
        mode: "unavailable",
        error: `Guidance provider returned ${response.status} ${response.statusText}`,
        providerName: endpoint,
      };
    }

    const body = (await response.json()) as GuidanceProviderResponse | GuidanceResult;

    if (isProviderResponse(body)) {
      if (body.mode === "unavailable") {
        return {
          ...body,
          providerName: body.providerName ?? endpoint,
        };
      }

      const validation = validateGuidanceResult(body.result);

      if (!validation.valid || body.result == null) {
        return {
          mode: "unavailable",
          error: body.error ?? "Guidance provider returned an invalid result.",
          validation,
          providerName: body.providerName ?? endpoint,
        };
      }

      return {
        ...body,
        mode: "real",
        validation,
        providerName: body.providerName ?? endpoint,
      };
    }

    const result = body as GuidanceResult;
    const validation = validateGuidanceResult(result);

    if (!validation.valid || result == null) {
      return {
        mode: "unavailable",
        error: "Guidance provider returned an invalid result.",
        validation,
        providerName: endpoint,
      };
    }

    return {
      mode: "real",
      result,
      validation,
      providerName: endpoint,
    };
  } catch (error) {
    return {
      mode: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      providerName: endpoint,
    };
  }
}

function isProviderResponse(value: unknown): value is GuidanceProviderResponse {
  return (
    value != null &&
    typeof value === "object" &&
    "mode" in value &&
      ["mock", "real", "ollama-vision", "unavailable"].includes(
      String((value as GuidanceProviderResponse).mode),
    )
  );
}

export function validateGuidanceResult(
  result: GuidanceResult | null | undefined,
): GuidanceValidationResult {
  const issues: GuidanceValidationIssue[] = [];

  if (result == null) {
    return {
      valid: false,
      issues: [{ path: "result", message: "Guidance result is missing." }],
    };
  }

  if (!["guide", "answer", "clarify"].includes(result.mode)) {
    issues.push({ path: "mode", message: "Guidance mode is not recognized." });
  }

  if (result.summary.trim().length === 0) {
    issues.push({ path: "summary", message: "Guidance summary is required." });
  }

  if (result.mode === "guide" && result.step == null) {
    issues.push({ path: "step", message: "Guide mode requires a step." });
  }

  if (result.step != null) {
    const { confidence, requiresConfirmation, risk, target } = result.step;

    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      issues.push({
        path: "step.confidence",
        message: "Confidence must be a number from 0 to 1.",
      });
    }

    if (!validRiskClasses.includes(risk)) {
      issues.push({ path: "step.risk", message: "Risk class is not recognized." });
    }

    if (confirmationRequiredRisks.includes(risk) && !requiresConfirmation) {
      issues.push({
        path: "step.requiresConfirmation",
        message: "Risky guidance must require confirmation.",
      });
    }

    if (target != null) {
      const fields = ["x", "y", "width", "height"] as const;

      for (const field of fields) {
        if (!Number.isFinite(target[field])) {
          issues.push({
            path: `step.target.${field}`,
            message: "Target coordinates and size must be finite numbers.",
          });
        }
      }

      if (target.width <= 0 || target.height <= 0) {
        issues.push({
          path: "step.target",
          message: "Target width and height must be positive.",
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

const riskyRisks = new Set<RiskClass>(confirmationRequiredRisks);

export function evaluateSafetyPolicy(input: SafetyPolicyInput): SafetyPolicyDecision {
  const { provider, minConfidence } = input;

  if (provider.mode === "unavailable") {
    return {
      action: "block",
      reason: "provider_unavailable",
      risk: "unknown_risky",
      requiresConfirmation: false,
      message: provider.error ?? "Guidance provider is unavailable.",
    };
  }

  if (provider.validation != null && !provider.validation.valid) {
    return {
      action: "block",
      reason: "validation_failed",
      risk: "unknown_risky",
      requiresConfirmation: false,
      message: "Guidance failed validation and will not be shown.",
      details: provider.validation.issues.map(
        (issue) => `${issue.path}: ${issue.message}`,
      ),
    };
  }

  const result = provider.result;

  if (result == null || result.step == null) {
    return {
      action: result?.mode === "clarify" ? "clarify" : "block",
      reason: "missing_step",
      risk: "unknown_risky",
      requiresConfirmation: false,
      message:
        result?.summary?.trim() ||
        "Toki needs a clearer instruction before showing guidance.",
    };
  }

  const { step } = result;

  if (step.target == null) {
    return {
      action: "clarify",
      reason: "missing_target",
      risk: step.risk,
      requiresConfirmation: false,
      message: "Toki could not identify a specific target to point at.",
    };
  }

  if (!isValidTargetBox(step.target)) {
    return {
      action: "block",
      reason: "invalid_target",
      risk: step.risk,
      requiresConfirmation: false,
      message: "Toki refused guidance because the target box is invalid.",
    };
  }

  if (step.confidence < minConfidence) {
    return {
      action: "clarify",
      reason: "low_confidence",
      risk: step.risk,
      requiresConfirmation: false,
      message: "Toki is not confident enough to point at this target yet.",
      details: [`confidence=${step.confidence}`, `minimum=${minConfidence}`],
    };
  }

  if (riskyRisks.has(step.risk) || step.requiresConfirmation) {
    return {
      action: "confirm",
      reason: step.risk === "unknown_risky" ? "unknown_risk" : "risky_action",
      risk: step.risk,
      requiresConfirmation: true,
      message: `Confirm before Toki guides you to "${step.target.label}".`,
    };
  }

  if (step.risk === "form_entry") {
    return {
      action: "allow",
      reason: "form_entry_notice",
      risk: step.risk,
      requiresConfirmation: false,
      message: "Form guidance is allowed, but review what will change.",
    };
  }

  return {
    action: "allow",
    reason: "safe_navigation",
    risk: step.risk,
    requiresConfirmation: false,
    message: "Safe guidance can be shown.",
  };
}

function isValidTargetBox(target: TargetBox): boolean {
  return (
    target.label.trim().length > 0 &&
    Number.isFinite(target.x) &&
    Number.isFinite(target.y) &&
    Number.isFinite(target.width) &&
    Number.isFinite(target.height) &&
    target.width > 0 &&
    target.height > 0
  );
}

function createWorkflowStep(input: {
  id: string;
  index: number;
  title: string;
  instruction: string;
  kind: WorkflowStepKind;
  risk?: RiskClass;
  requiresConfirmation?: boolean;
  expectedLabel?: string;
  expectedRole?: string;
}): WorkflowStep {
  const risk = input.risk ?? "safe_navigation";

  return {
    id: input.id,
    index: input.index,
    title: input.title,
    instruction: input.instruction,
    kind: input.kind,
    status: input.index === 0 ? "active" : "pending",
    risk,
    requiresConfirmation:
      input.requiresConfirmation ?? confirmationRequiredRisks.includes(risk),
    expected: input.expectedLabel
      ? [
          {
            type: "candidate_visible",
            label: input.expectedLabel,
            role: input.expectedRole,
          },
        ]
      : undefined,
  };
}

function createWorkflowPlan(input: {
  id: string;
  goal: string;
  title: string;
  steps: Omit<Parameters<typeof createWorkflowStep>[0], "index">[];
  createdAt?: string;
}): WorkflowPlan {
  return {
    id: input.id,
    goal: input.goal,
    title: input.title,
    createdAt: input.createdAt ?? new Date(0).toISOString(),
    steps: input.steps.map((step, index) =>
      createWorkflowStep({
        ...step,
        index,
      }),
    ),
  };
}

export function createMockWorkflowPlan(
  goal: string,
  options: { createdAt?: string } = {},
): WorkflowPlan | null {
  const normalizedGoal = normalizeText(goal);

  if (normalizedGoal.includes("create") && normalizedGoal.includes("project")) {
    return createWorkflowPlan({
      id: "workflow-create-project",
      goal,
      title: "Create project",
      createdAt: options.createdAt,
      steps: [
        {
          id: "create-project-open",
          title: "Open project dialog",
          instruction: "Click Create project.",
          kind: "click",
          expectedLabel: "Project name",
          expectedRole: "dom_textbox",
        },
        {
          id: "create-project-name",
          title: "Enter project name",
          instruction: "Enter the project name.",
          kind: "type",
          risk: "form_entry",
          expectedLabel: "Environment selector",
          expectedRole: "dom_select",
        },
        {
          id: "create-project-save",
          title: "Save project",
          instruction: "Click Save project.",
          kind: "click",
          expectedLabel: "Project created",
        },
      ],
    });
  }

  if (normalizedGoal.includes("open") && normalizedGoal.includes("settings")) {
    return createWorkflowPlan({
      id: "workflow-open-settings",
      goal,
      title: "Open settings",
      createdAt: options.createdAt,
      steps: [
        {
          id: "open-settings",
          title: "Open settings",
          instruction: "Click Open settings.",
          kind: "click",
          expectedLabel: "Settings",
        },
      ],
    });
  }

  if (normalizedGoal.includes("delete") && normalizedGoal.includes("project")) {
    return createWorkflowPlan({
      id: "workflow-delete-project",
      goal,
      title: "Delete project",
      createdAt: options.createdAt,
      steps: [
        {
          id: "delete-project-open",
          title: "Open delete action",
          instruction: "Click Delete project.",
          kind: "click",
          risk: "delete",
          expectedLabel: "Delete project",
          expectedRole: "dom_button",
        },
        {
          id: "delete-project-confirm",
          title: "Confirm deletion",
          instruction: "Confirm the delete action only if you are sure.",
          kind: "confirm",
          risk: "delete",
          expectedLabel: "Project deleted",
        },
      ],
    });
  }

  if (normalizedGoal.includes("export") || normalizedGoal.includes("download")) {
    return createWorkflowPlan({
      id: "workflow-export-report",
      goal,
      title: "Export report",
      createdAt: options.createdAt,
      steps: [
        {
          id: "export-open-menu",
          title: "Open export menu",
          instruction: "Click Export.",
          kind: "click",
          expectedLabel: "Download",
        },
        {
          id: "export-download",
          title: "Download report",
          instruction: "Click Download.",
          kind: "click",
          expectedLabel: "Download complete",
        },
      ],
    });
  }

  return null;
}
