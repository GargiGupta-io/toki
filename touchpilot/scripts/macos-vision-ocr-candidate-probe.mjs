import { collectMacVisionOcrCandidates } from "./macos-vision-ocr-candidates.mjs";

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

function readImagePath() {
  const positional = process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--") && arg.trim().length > 0);

  return (
    readArg("--image") ||
    positional ||
    process.env.TOKI_KNOWN_SCREEN_IMAGE ||
    ""
  ).trim();
}

function formatCandidate(candidate) {
  return `${candidate.id} | ${candidate.role} | ${candidate.label} | ${candidate.x},${candidate.y} ${candidate.width}x${candidate.height}`;
}

async function main() {
  const imagePath = readImagePath();
  const displayWidth = readNumberArg("--display-width");
  const displayHeight = readNumberArg("--display-height");
  const scaleFactor = readNumberArg("--scale") ?? 1;

  console.log("Toki macOS Vision OCR candidate probe");
  console.log("");
  console.log(`Image: ${imagePath || "missing"}`);

  const result = await collectMacVisionOcrCandidates({
    imagePath,
    displayWidth,
    displayHeight,
    scaleFactor,
  });

  console.log(`Candidate source: ${result.source}`);

  if (result.error) {
    console.log(`Candidate warning: ${result.error}`);
  }

  console.log(`Candidates: ${result.candidates.length}`);

  for (const candidate of result.candidates.slice(0, 20)) {
    console.log(`- ${formatCandidate(candidate)}`);
  }

  if (
    process.env.TOKI_OCR_REQUIRE_CANDIDATES === "1" &&
    result.candidates.length === 0
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
