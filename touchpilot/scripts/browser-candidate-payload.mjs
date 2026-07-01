import { readFile } from "node:fs/promises";

export function normalizeBrowserCandidatePayload(payload) {
  if (
    payload == null ||
    typeof payload !== "object" ||
    payload.schemaVersion !== 1 ||
    payload.source !== "browser-extension" ||
    !Array.isArray(payload.candidates)
  ) {
    throw new Error("browser candidate payload must use schemaVersion 1");
  }

  return {
    source: "browser-extension",
    candidates: payload.candidates.map((candidate, index) => ({
      id:
        typeof candidate.id === "string" && candidate.id.trim().length > 0
          ? candidate.id.trim()
          : `dom-candidate-${index + 1}`,
      label:
        typeof candidate.label === "string" && candidate.label.trim().length > 0
          ? candidate.label.trim()
          : `DOM candidate ${index + 1}`,
      role:
        typeof candidate.role === "string" && candidate.role.trim().length > 0
          ? candidate.role.trim()
          : "dom_candidate",
      source: "dom",
      x: Number(candidate.x),
      y: Number(candidate.y),
      width: Number(candidate.width),
      height: Number(candidate.height),
      metadata:
        candidate.metadata != null && typeof candidate.metadata === "object"
          ? candidate.metadata
          : undefined,
    })),
  };
}

export async function readBrowserCandidatePayload(payloadPath) {
  const payload = JSON.parse(await readFile(payloadPath, "utf8"));

  return normalizeBrowserCandidatePayload(payload);
}
