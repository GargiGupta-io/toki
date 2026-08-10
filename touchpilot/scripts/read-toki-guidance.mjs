import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Why the last guidance request ended the way it did, on one screen.
 *
 * The diagnostics store already holds all of this. What it did not have was a
 * view of it: `toki:debug` prints every subsystem as raw JSON, and the failures
 * that actually happen are almost always one of three things -- what the model
 * answered, what the verifier compared it against, and which gate refused it.
 * Reconstructing that from a full dump, a state history and a server log, three
 * times an hour, is how an evening goes.
 *
 * Read-only. Prints nothing that is not already in the store.
 */

const diagnosticsDirectory =
  process.env.TOKI_DEBUG_DIR ??
  path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "app.toki.desktop",
    "diagnostics",
  );

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readHistory(file, limit = 4000) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .slice(-limit)
      .flatMap((line) => {
        try {
          return line.trim() ? [JSON.parse(line)] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function truncate(value, max = 300) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text == null) return "none";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function box(rect) {
  if (rect == null) return "none";
  const { x, y, width, height, centerX, centerY } = rect;
  if (centerX != null) return `centre ${centerX},${centerY} ${width}x${height}`;
  return `${x},${y} ${width}x${height}`;
}

const latest = readJson(path.join(diagnosticsDirectory, "latest.json"));
const history = readHistory(path.join(diagnosticsDirectory, "history.ndjson"));

if (latest == null) {
  console.error(`No diagnostics found in ${diagnosticsDirectory}`);
  process.exit(1);
}

const snapshot = latest.snapshot ?? {};

console.log("Toki guidance diagnosis");
console.log("=======================");
console.log(`Exported     ${latest.exportedAt}`);
console.log(`Overlay      ${snapshot.overlayState ?? "unknown"}`);
console.log(`Provider     ${snapshot.guidanceProviderName ?? "none"} (${snapshot.guidanceProviderMode ?? "unknown"})`);
console.log(`Session      ${snapshot.guidanceSession?.status ?? "none"}`);
console.log(`Accepted     ${snapshot.hasAcceptedGuidance ? "yes" : "no"}`);

const circle = snapshot.pointerCircle;

if (circle) {
  console.log("\nCircle select");
  console.log("-------------");
  console.log(`  instrument  ${circle.source}${circle.source === "pointer" ? " (camera not tracking)" : ""}`);
  console.log(`  armed       ${circle.armed ? "yes" : "no"}`);
  console.log(`  phase       ${circle.phase ?? "not started"}`);
  console.log(
    `  turned      ${circle.turnedDegrees ?? 0} of ${circle.requiredDegrees} degrees needed`,
  );
  console.log(`  points      ${circle.points}`);
  console.log(`  region      ${circle.region ? `${Math.round(circle.region.width)}x${Math.round(circle.region.height)} at ${Math.round(circle.region.x)},${Math.round(circle.region.y)}` : "none"}`);
}

if (snapshot.guidanceProviderError) {
  console.log(`\nERROR        ${snapshot.guidanceProviderError}`);
}

const debug = snapshot.guidanceProviderDebug;

if (debug?.providerOutput) {
  const out = debug.providerOutput;
  console.log("\nWhat the model answered");
  console.log("-----------------------");
  console.log(`  label       ${out.label ?? "none"}`);
  console.log(`  confidence  ${out.confidence ?? "none"}`);
  console.log(`  risk        ${out.risk ?? "none"}`);
  console.log(`  target      ${box(out.target)}`);
  console.log(`  candidateId ${out.target?.candidateId ?? "none"}`);
  console.log(`  reason      ${truncate(out.reason, 240)}`);
  if (out.rawAnswer) {
    console.log(`  raw         ${truncate(out.rawAnswer, 400)}`);
  }
}

if (debug?.targetVerification) {
  const check = debug.targetVerification;
  console.log("\nWhat verification did with it");
  console.log("-----------------------------");
  console.log(`  status      ${check.status ?? "not_run"}`);
  console.log(`  source      ${check.source ?? "none"}`);
  console.log(`  input       ${box(check.inputTarget)}`);
  console.log(`  click point ${check.clickPoint ? `${check.clickPoint.x},${check.clickPoint.y}` : "none"}`);
  if (check.candidate) {
    // The usual culprit: an icon has no words, so the candidate matched by
    // geometry carries a label like "+" and nothing semantic to compare.
    console.log(`  candidate   id=${check.candidate.id ?? "?"} label=${JSON.stringify(check.candidate.label ?? "")} role=${check.candidate.role ?? "?"}`);
  }
  for (const reason of check.reasons ?? []) {
    console.log(`  refused     ${reason}`);
  }
}

if (debug?.vision) {
  console.log("\nCoordinate mapping");
  console.log("------------------");
  console.log(`  mode        ${debug.vision.coordinateMode ?? "unknown"}`);
  console.log(`  raw target  ${box(debug.vision.rawTarget)}`);
}

for (const issue of snapshot.guidanceIssues ?? []) {
  console.log(`\nISSUE        ${issue.path ?? ""} ${issue.message ?? truncate(issue)}`);
}

console.log("\nRecent guidance transitions");
console.log("---------------------------");
const rows = [];
for (const record of history) {
  const g = record?.state?.guidance;
  if (g == null) continue;
  const key = `${g.sessionStatus}|${g.providerMode}|${g.targetLabel}|${g.providerError}`;
  if (rows.length === 0 || rows[rows.length - 1].key !== key) {
    rows.push({ key, at: record.recordedAt, g });
  }
}
for (const { at, g } of rows.slice(-8)) {
  const time = String(at ?? "").slice(11, 23);
  console.log(`  ${time}  ${String(g.sessionStatus ?? "-").padEnd(17)} ${g.targetLabel ?? "-"}`);
  if (g.providerError) {
    console.log(`                 ${truncate(g.providerError, 160)}`);
  }
}
