import { fuseScreenCandidates } from "@toki/ai";
import type {
  GuidanceScreenContext,
  ScreenCandidate,
  ScreenCandidateEvidence,
  UiElement,
  UiElementSource,
} from "@toki/shared";

type CandidateSource = NonNullable<GuidanceScreenContext["candidateSource"]>;
type EvidenceSource = keyof ScreenCandidateEvidence["sourceCounts"];

export type FusedCandidateEvidence = {
  candidates: ScreenCandidate[];
  candidateSource: CandidateSource;
  candidateEvidence: ScreenCandidateEvidence;
};

function getEvidenceSource(source: UiElementSource): EvidenceSource {
  if (source === "accessibility") {
    return "accessibility";
  }

  if (source === "ocr") {
    return "ocr";
  }

  if (source === "browser-dom") {
    return "dom";
  }

  if (source === "manual") {
    return "manual";
  }

  return "unknown";
}

function getCandidateSource(
  sourceCounts: ScreenCandidateEvidence["sourceCounts"],
  fallback: CandidateSource,
): CandidateSource {
  const activeSources = (Object.entries(sourceCounts) as Array<[EvidenceSource, number]>)
    .filter(([source, count]) => source !== "unknown" && count > 0)
    .map(([source]) => source);

  if (activeSources.length > 1) {
    return "fused";
  }

  switch (activeSources[0]) {
    case "accessibility":
      return "macos-accessibility";
    case "ocr":
      return "macos-vision-ocr";
    case "dom":
      return "browser-extension";
    case "manual":
      return "manual";
    default:
      return fallback;
  }
}

function toCandidateSource(source: UiElementSource): ScreenCandidate["source"] {
  switch (source) {
    case "accessibility":
      return "accessibility";
    case "ocr":
      return "ocr";
    case "browser-dom":
      return "dom";
    case "manual":
      return "manual";
    default:
      return undefined;
  }
}

function toScreenCandidate(element: UiElement): ScreenCandidate {
  const primarySource = element.sources.find(
    (source) => source.source === element.primarySource,
  );
  const sourceIds = element.sourceCandidateIds ??
    element.sources.flatMap((source) => (source.sourceId ? [source.sourceId] : []));
  const sources = [...new Set(element.sources.map((source) => source.source))];

  return {
    id: primarySource?.sourceId ?? sourceIds[0] ?? element.id,
    label: element.label,
    role: element.role as ScreenCandidate["role"],
    source: toCandidateSource(element.primarySource),
    x: element.bounds.x,
    y: element.bounds.y,
    width: element.bounds.width,
    height: element.bounds.height,
    rank: element.rank,
    metadata: {
      ...(element.metadata ?? {}),
      fusionConfidence: element.confidence,
      fusionEvidenceCount: element.sources.length,
      fusionSources: sources.join(","),
      fusionSourceIds: sourceIds.join(","),
    },
  };
}

export function fuseCandidateEvidence(
  candidates: ScreenCandidate[] | undefined,
  fallbackSource: CandidateSource,
  capturedAt?: string,
): FusedCandidateEvidence {
  const rawCandidates = Array.isArray(candidates) ? candidates : [];
  const sourceCounts: ScreenCandidateEvidence["sourceCounts"] = {
    accessibility: 0,
    ocr: 0,
    dom: 0,
    manual: 0,
    unknown: 0,
  };

  const elements = fuseScreenCandidates(rawCandidates, { capturedAt });
  const fusedCandidates = elements.map(toScreenCandidate);

  for (const element of elements) {
    for (const source of element.sources) {
      sourceCounts[getEvidenceSource(source.source)] += 1;
    }
  }

  const validCount = elements.reduce(
    (count, element) => count + (element.sourceCandidateIds?.length ?? element.sources.length),
    0,
  );

  return {
    candidates: fusedCandidates,
    candidateSource: getCandidateSource(sourceCounts, fallbackSource),
    candidateEvidence: {
      rawCount: rawCandidates.length,
      validCount,
      fusedCount: fusedCandidates.length,
      returnedCount: fusedCandidates.length,
      sourceCounts,
    },
  };
}
