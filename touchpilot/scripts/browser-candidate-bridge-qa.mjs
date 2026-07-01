const endpoint =
  process.env.TOKI_BROWSER_CANDIDATE_ENDPOINT ??
  "http://127.0.0.1:8787/api/browser-candidates/latest";

const allowFixture = process.argv.includes("--allow-fixture");

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function isHttpPage(url) {
  return typeof url === "string" && /^https?:\/\//u.test(url);
}

function isUsableCandidate(candidate) {
  return (
    candidate != null &&
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    Number.isFinite(Number(candidate.x)) &&
    Number.isFinite(Number(candidate.y)) &&
    Number(candidate.width) > 0 &&
    Number(candidate.height) > 0
  );
}

console.log("Toki browser candidate bridge QA");
console.log(`Endpoint: ${endpoint}`);

let body;

try {
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`bridge returned HTTP ${response.status}`);
  }

  body = await response.json();
} catch (error) {
  fail(`could not read bridge payload - ${error instanceof Error ? error.message : String(error)}`);
  process.exit();
}

const payload = body?.payload;

if (payload == null) {
  fail("no browser candidate payload is stored; use the extension popup and click Send to Toki");
  process.exit();
}

if (payload.schemaVersion !== 1 || payload.source !== "browser-extension") {
  fail("latest payload is not a schemaVersion 1 browser-extension payload");
} else {
  pass("payload schema");
}

const pageUrl = payload.page?.url ?? "";
const pageTitle = payload.page?.title ?? "";
const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
const usableCandidates = candidates.filter(isUsableCandidate);
const fixturePage = pageUrl.includes("/fixtures/candidate-page.html");

if (!isHttpPage(pageUrl)) {
  fail(`page URL should be http/https, got ${pageUrl || "(empty)"}`);
} else {
  pass(`page URL - ${pageUrl}`);
}

if (!allowFixture && fixturePage) {
  fail("latest payload is still the fixture page; open a real dashboard page and send candidates again");
} else if (fixturePage) {
  pass("fixture page accepted for controlled QA");
} else {
  pass(`real page candidate payload - ${pageTitle || "untitled page"}`);
}

if (usableCandidates.length === 0) {
  fail("no usable DOM candidates found");
} else {
  pass(`usable candidates - ${usableCandidates.length}/${candidates.length}`);
}

console.log("\nTop candidates:");
for (const candidate of usableCandidates.slice(0, 8)) {
  console.log(
    `- ${candidate.label} (${candidate.role ?? "dom_candidate"}) @ ${candidate.x},${candidate.y} ${candidate.width}x${candidate.height}`,
  );
}
