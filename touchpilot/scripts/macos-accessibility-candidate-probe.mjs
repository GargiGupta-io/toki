import {
  collectMacAccessibilityCandidates,
  listMacAccessibilityProcesses,
} from "./macos-accessibility-candidates.mjs";

function readArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1 || index + 1 >= process.argv.length) {
    return "";
  }

  return process.argv[index + 1].trim();
}

function readNumberArg(name) {
  const raw = readArg(name);

  if (raw.length === 0) {
    return undefined;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

function formatCandidate(candidate) {
  return `${candidate.id} | ${candidate.role} | ${candidate.label} | ${candidate.x},${candidate.y} ${candidate.width}x${candidate.height}`;
}

async function main() {
  const appName =
    readArg("--app") ||
    process.env.TOKI_ACCESSIBILITY_APP_NAME ||
    process.env.TOKI_KNOWN_SCREEN_APP_NAME ||
    "";
  const displayWidth = readNumberArg("--display-width");
  const displayHeight = readNumberArg("--display-height");
  const shouldList = process.argv.includes("--list") || appName.length === 0;

  console.log("Toki macOS accessibility candidate probe");
  console.log("");

  if (shouldList) {
    const processResult = await listMacAccessibilityProcesses();

    console.log(`Process source: ${processResult.source}`);

    if (processResult.error) {
      console.log(`Process warning: ${processResult.error}`);
    }

    if (processResult.processes.length > 0) {
      console.log("Visible apps:");

      for (const processInfo of processResult.processes) {
        const marker = processInfo.frontmost ? "*" : "-";
        console.log(`${marker} ${processInfo.name}`);
      }
    } else {
      console.log("Visible apps: none");
    }

    console.log("");
  }

  const candidateResult = await collectMacAccessibilityCandidates({
    appName,
    displayWidth,
    displayHeight,
  });

  console.log(`Candidate source: ${candidateResult.source}`);
  console.log(`Target app: ${appName || "frontmost"}`);
  console.log(`Resolved app: ${candidateResult.appName || "unknown"}`);
  console.log(`Windows: ${candidateResult.windowCount ?? 0}`);
  console.log(`Visited elements: ${candidateResult.visitedCount ?? 0}`);

  if (candidateResult.error) {
    console.log(`Candidate warning: ${candidateResult.error}`);
  }

  console.log(`Candidates: ${candidateResult.candidates.length}`);

  for (const candidate of candidateResult.candidates.slice(0, 12)) {
    console.log(`- ${formatCandidate(candidate)}`);
  }

  if (
    process.env.TOKI_ACCESSIBILITY_REQUIRE_CANDIDATES === "1" &&
    candidateResult.candidates.length === 0
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
