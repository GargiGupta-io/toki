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
  TargetBox,
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
    ["mock", "real", "unavailable"].includes(
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
