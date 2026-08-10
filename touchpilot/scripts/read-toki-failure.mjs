import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The last guidance failure, in full.
 *
 * The Debug window has always shown this. The files it wrote did not: the
 * history kept a compact summary per transition, and everything that explains a
 * failure -- the per-stage trace, the provider's own words, the ranked
 * candidates, the payload gate -- lived only in `latest.json`, which is
 * overwritten twice a second. By the time anybody read it, the interesting
 * moment was gone and the file said `null` where the answer had been.
 *
 * That gap cost real time. Failures were diagnosed from a screenshot of a
 * window instead of from the record, and more than once the record was read,
 * found empty, and reported as "nothing to see" when the truth was "you are
 * reading the wrong moment".
 *
 * Run with no arguments for the most recent failure, or `--list` to see what
 * is there.
 */

const DIRECTORY = join(
  homedir(),
  "Library",
  "Application Support",
  "app.toki.desktop",
  "diagnostics",
);

function readHistory() {
  try {
    return readFileSync(join(DIRECTORY, "history.ndjson"), "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    console.error(`No diagnostics at ${DIRECTORY}.`);
    console.error("Toki writes them while diagnostics are enabled in Settings.");
    process.exit(1);
  }
}

const rows = readHistory();
const failures = rows.filter((row) => row.detail != null);

if (process.argv.includes("--list")) {
  if (failures.length === 0) {
    console.log("No failures recorded.");
  }

  for (const row of failures.slice(-20)) {
    const error =
      row.detail?.guidanceProviderError ?? row.detail?.captureError ?? "";
    console.log(`${row.recordedAt}  ${String(error).slice(0, 110)}`);
  }

  process.exit(0);
}

const latest = failures.at(-1);

if (latest == null) {
  console.log("No failure has been recorded with full detail yet.");
  console.log(`Entries in history: ${rows.length}`);
  console.log(
    "Older entries predate this record, and carry only the summary line.",
  );

  // The summary is still worth showing: it names the error even when the
  // detail behind it was not kept.
  const summarised = rows.filter(
    (row) => row.state?.guidance?.providerError || row.state?.capture?.error,
  );

  for (const row of summarised.slice(-5)) {
    const guidance = row.state?.guidance ?? {};
    console.log(
      `\n${row.recordedAt}  ${guidance.providerName ?? "unknown provider"}`,
    );
    console.log(`  ${guidance.providerError ?? row.state?.capture?.error}`);
  }

  process.exit(0);
}

const detail = latest.detail ?? {};

console.log(`Last guidance failure — ${latest.recordedAt}`);
console.log("=".repeat(60));
console.log(`Provider : ${detail.guidanceProviderName ?? "unknown"}`);
console.log(`Error    : ${detail.guidanceProviderError ?? detail.captureError}`);

const goal = detail.guidanceRequest?.goal;
if (goal) {
  // First, because when this is wrong nothing after it matters. A request for
  // the "quote reply" option arrived as "code reply" and every layer below
  // behaved correctly on the wrong question.
  console.log(`Heard    : "${goal}"`);
}

const stages = detail.guidanceTrace?.events ?? detail.guidanceTrace?.stages;
if (Array.isArray(stages)) {
  console.log("\nStages");
  for (const stage of stages) {
    const name = stage.stage ?? stage.name ?? "?";
    const status = stage.status ?? "";
    const ms = stage.durationMs != null ? `${stage.durationMs}ms` : "";
    console.log(`  ${String(name).padEnd(14)} ${status.padEnd(10)} ${ms}`);
    if (stage.summary) {
      console.log(`    ${stage.summary}`);
    }
  }
}

const screen = detail.guidanceRequest?.screen;
if (screen) {
  const shot = screen.screenshot ?? {};
  console.log("\nPayload");
  console.log(
    `  display ${screen.display?.width}x${screen.display?.height}` +
      `  screenshot ${shot.imageWidth}x${shot.imageHeight}` +
      `  calibration ${screen.calibration?.status ?? "?"}`,
  );

  const candidates = screen.candidates ?? [];
  console.log(`  candidates: ${candidates.length} (${screen.candidateSource ?? "none"})`);

  // The list that is actually sent as evidence. Reading it is how you find out
  // that twenty browser tabs took every slot and the page's own controls were
  // never offered.
  for (const candidate of candidates.slice(0, 12)) {
    console.log(
      `    ${String(candidate.label ?? "").slice(0, 46).padEnd(48)}` +
        `${candidate.role ?? ""} @ ${candidate.x},${candidate.y}`,
    );
  }

  if (candidates.length > 12) {
    console.log(`    … ${candidates.length - 12} more`);
  }
}

const raw = detail.guidanceProviderDebug?.providerOutput?.rawAnswer;
if (raw) {
  console.log("\nProvider said");
  console.log(`  ${String(raw).slice(0, 600)}`);
}

const verification = detail.guidanceProviderDebug?.targetVerification;
if (verification) {
  console.log("\nVerification");
  console.log(`  ${verification.status}  ${verification.match ?? ""}`);
  for (const reason of verification.reasons ?? []) {
    console.log(`    ${reason}`);
  }
}
