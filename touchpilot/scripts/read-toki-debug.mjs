import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

function findDiagnosticsDirectory() {
  return candidateDirectories().find((directory) =>
    fs.existsSync(path.join(directory, "latest.json")),
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readHistory(filePath, limit = 12) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line));
}

function findCapture(directory) {
  return ["latest-capture.png", "latest-capture.jpg"]
    .map((name) => path.join(directory, name))
    .find((filePath) => fs.existsSync(filePath));
}

function showValue(label, value) {
  const rendered =
    value == null
      ? "none"
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  process.stdout.write(`${label}: ${rendered}\n`);
}

function printSummary(envelope, directory, history) {
  const snapshot = envelope.snapshot ?? {};
  const diagnostics = snapshot.gestureDiagnostics ?? {};
  const gestureRuntime = snapshot.gestureRuntime ?? {};
  const voiceRuntime = snapshot.voiceRuntime ?? {};
  const gestureVoiceLifecycle = snapshot.gestureVoiceLifecycle ?? {};
  const guidanceTarget = snapshot.guidanceResult?.step?.target ?? null;
  const capturePath = findCapture(directory);

  process.stdout.write("Toki local diagnostics\n");
  process.stdout.write("======================\n");
  showValue("Exported", envelope.exportedAt);
  showValue("Sequence", envelope.sequence);
  showValue("Overlay", snapshot.overlayState);
  showValue("Camera", {
    enabled: gestureRuntime.camera?.enabled,
    status: gestureRuntime.camera?.status,
    permission: gestureRuntime.camera?.permission,
    error: gestureRuntime.camera?.error ?? null,
  });
  showValue("Hands", diagnostics.hands?.length ?? 0);
  showValue("Gesture intent owners", {
    owners: diagnostics.intentArbiter?.owners ?? [],
    suppressed: diagnostics.intentArbiter?.suppressed ?? [],
  });
  showValue("Point", diagnostics.pointPose);
  showValue("Pointer", diagnostics.pointer);
  showValue("Wrist-roll lock", {
    pose: diagnostics.wristRollPose?.label,
    phase: diagnostics.wristRollLock?.phase,
    rotationDegrees: diagnostics.wristRollLock?.rotationDegrees ?? null,
    rollId: diagnostics.wristRollLock?.roll?.id ?? null,
    holdUntil: diagnostics.wristRollLock?.holdUntil ?? null,
    lockId: snapshot.gesturePointerLock?.id ?? null,
    validation: snapshot.gesturePointerLockFeedback?.validation ?? null,
    reason: snapshot.gesturePointerLockFeedback?.reason ?? null,
    lastUnlock:
      diagnostics.unlockRequest == null
        ? null
        : {
            lockId: diagnostics.unlockRequest.lockId,
            handTrackId: diagnostics.unlockRequest.handTrackId,
            unlockedAt: diagnostics.unlockRequest.unlockedAt,
            rotationDegrees: diagnostics.unlockRequest.rotationDegrees,
          },
  });
  showValue("Camera re-framing", {
    centreStageActive: diagnostics.cameraReframing?.active ?? null,
    checkedAt: diagnostics.cameraReframing?.checkedAt ?? null,
    note:
      diagnostics.cameraReframing?.active === true
        ? "Centre Stage re-frames the camera and hides the hand. Turn it off in Control Centre."
        : null,
  });
  showValue("Camera-off gesture", {
    phase: diagnostics.cameraShutdown?.phase ?? null,
    holdMs: diagnostics.cameraShutdown?.holdMs ?? null,
    hands: diagnostics.cameraShutdown?.handTrackIds ?? null,
    lastEvent: diagnostics.cameraShutdown?.lastEvent?.id ?? null,
  });
  showValue("Ordinary pinch", diagnostics.ordinaryPinch);
  showValue("Contextual control pinch", diagnostics.controlPinch);
  showValue("Voice", {
    status: voiceRuntime.status,
    source: voiceRuntime.activationSource ?? null,
    transcript: voiceRuntime.transcript?.text ?? null,
    error: voiceRuntime.error ?? null,
    capturePhase: gestureVoiceLifecycle.capturePhase ?? null,
    holdPhase: gestureVoiceLifecycle.holdPhase ?? null,
    held: gestureVoiceLifecycle.held ?? null,
    releasePending: gestureVoiceLifecycle.releasePending ?? null,
    owner: gestureVoiceLifecycle.owner ?? null,
    nativeSessionId: gestureVoiceLifecycle.nativeSessionId ?? null,
    lastCapture: gestureVoiceLifecycle.lastCapture ?? null,
    lastTransition: gestureVoiceLifecycle.lastTransition ?? null,
  });
  showValue("Guidance", {
    traceId: snapshot.guidanceTrace?.id ?? null,
    providerMode: snapshot.guidanceProviderMode,
    providerName: snapshot.guidanceProviderName,
    providerError: snapshot.guidanceProviderError,
    issues: snapshot.guidanceIssues,
    target: guidanceTarget,
  });
  showValue("Capture", {
    metadata: snapshot.captureMetadata,
    error: snapshot.captureError,
    imagePath: capturePath ?? null,
  });
  showValue("Latest JSON", path.join(directory, "latest.json"));
  showValue("History", path.join(directory, "history.ndjson"));

  if (history.length > 0) {
    process.stdout.write("\nRecent meaningful transitions\n");
    for (const entry of history) {
      process.stdout.write(
        `${entry.recordedAt ?? "unknown"} #${entry.sequence ?? "?"} ${JSON.stringify(
          entry.state ?? {},
        )}\n`,
      );
    }
  }
}

const directory = findDiagnosticsDirectory();
if (!directory) {
  process.stderr.write(
    `No Toki diagnostics export was found. Checked:\n${candidateDirectories()
      .map((candidate) => `- ${candidate}`)
      .join("\n")}\nLaunch the rebuilt Toki app and try again.\n`,
  );
  process.exitCode = 2;
} else {
  const envelope = readJson(path.join(directory, "latest.json"));
  const history = readHistory(path.join(directory, "history.ndjson"));

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ envelope, history }, null, 2)}\n`);
  } else {
    printSummary(envelope, directory, history);
  }
}
