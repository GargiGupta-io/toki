import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const payloadPath = join(rootDir, "fixtures", "bridge-payload.json");
const payload = JSON.parse(await readFile(payloadPath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(payload.schemaVersion === 1, "schemaVersion must be 1");
assert(payload.source === "browser-extension", "source must be browser-extension");
assert(typeof payload.capturedAt === "string", "capturedAt is required");
assert(typeof payload.page?.url === "string", "page.url is required");
assert(typeof payload.page?.title === "string", "page.title is required");
assert(Number.isFinite(payload.viewport?.width), "viewport.width is required");
assert(Array.isArray(payload.candidates), "candidates must be an array");
assert(payload.candidates.length > 0, "at least one candidate is required");

for (const [index, candidate] of payload.candidates.entries()) {
  assert(typeof candidate.id === "string", `candidate ${index} id is required`);
  assert(typeof candidate.label === "string", `candidate ${index} label is required`);
  assert(candidate.source === "dom", `candidate ${index} source must be dom`);
  assert(candidate.role.startsWith("dom_"), `candidate ${index} role must be dom_*`);
  assert(Number.isFinite(candidate.x), `candidate ${index} x is required`);
  assert(Number.isFinite(candidate.y), `candidate ${index} y is required`);
  assert(Number.isFinite(candidate.width), `candidate ${index} width is required`);
  assert(Number.isFinite(candidate.height), `candidate ${index} height is required`);
}

console.log(`bridge payload smoke passed: ${payload.candidates.length} candidates`);
