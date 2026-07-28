import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  analyzeGestureDiagnosticTrace,
  replayGesturePointerTrace,
} from "../apps/desktop/src/gestureDiagnostics.ts";

function candidateDirectories() {
  if (process.env.TOKI_DEBUG_DIR) {
    return [process.env.TOKI_DEBUG_DIR];
  }

  if (process.platform === "darwin") {
    return [
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "app.toki.desktop",
        "diagnostics",
      ),
    ];
  }

  if (process.platform === "win32") {
    return [
      path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "app.toki.desktop",
        "diagnostics",
      ),
    ];
  }

  return [
    path.join(
      process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
      "app.toki.desktop",
      "diagnostics",
    ),
  ];
}

function findLatestExport() {
  for (const directory of candidateDirectories()) {
    const latestPath = path.join(directory, "latest.json");
    if (fs.existsSync(latestPath)) {
      return latestPath;
    }
  }

  return null;
}

function printValue(label, value) {
  process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
}

const latestPath = findLatestExport();
if (latestPath == null) {
  process.stderr.write(
    `No Toki diagnostics export was found. Launch Toki and reproduce the gesture first.\nChecked:\n${candidateDirectories()
      .map((directory) => `- ${directory}`)
      .join("\n")}\n`,
  );
  process.exitCode = 2;
} else {
  const envelope = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const snapshot = envelope.snapshot ?? {};
  const trace = snapshot.gestureDiagnostics?.trace ?? null;

  if (trace == null || !Array.isArray(trace.frames)) {
    process.stderr.write(
      "The installed Toki build does not contain the gesture replay trace yet. Rebuild and relaunch Toki, reproduce the gesture, then run this command again.\n",
    );
    process.exitCode = 3;
  } else {
    const analysis = analyzeGestureDiagnosticTrace(trace);
    const replay = replayGesturePointerTrace(trace);
    const report = {
      source: latestPath,
      exportedAt: envelope.exportedAt ?? null,
      sequence: envelope.sequence ?? null,
      analysis,
      replay: {
        deterministic: replay.deterministic,
        replayedFrames: replay.replayedFrames,
        phaseMismatchCount: replay.phaseMismatchCount,
        maxDeltaPx: replay.maxDeltaPx,
      },
      presentation: snapshot.gesturePresentationDiagnostics ?? null,
      windowValidation: snapshot.gestureWindowValidationDiagnostics ?? null,
    };

    if (process.argv.includes("--json")) {
      process.stdout.write(
        `${JSON.stringify(
          process.argv.includes("--frames")
            ? { ...report, replayFrames: replay.frames }
            : report,
          null,
          2,
        )}\n`,
      );
    } else {
      process.stdout.write("Toki gesture replay\n");
      process.stdout.write("===================\n");
      printValue("Source", report.source);
      printValue("Exported", report.exportedAt);
      printValue("Samples", analysis.sampleCount);
      printValue("Duration ms", analysis.durationMs);
      printValue("Inference p95 ms", analysis.inferenceDurationP95Ms);
      printValue("Frame interval p95 ms", analysis.frameIntervalP95Ms);
      printValue("Raw-to-logical p95 px", analysis.rawToLogicalDistanceP95Px);
      printValue("Logical-to-blob p95 px", analysis.logicalToBlobDistanceP95Px);
      printValue("Symptoms", analysis.symptoms);
      printValue("Pointer replay", report.replay);
      printValue("Presentation", report.presentation);
      printValue("Window validation", report.windowValidation);
    }
  }
}
