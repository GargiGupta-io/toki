import { readFileSync } from "node:fs";

const css = readFileSync("apps/desktop/src/App.css", "utf8");
const app = readFileSync("apps/desktop/src/App.tsx", "utf8");
const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed, detail });
}

const reducedMotionMatch = css.match(
  /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*)\n\}/,
);
const reducedMotionBlock = reducedMotionMatch?.[1] ?? "";

check(
  "reduced-motion block exists",
  reducedMotionBlock.length > 0,
  "prefers-reduced-motion: reduce",
);

for (const selector of [
  ".puck-orbit",
  ".puck-core",
  ".puck-droplet",
  ".pointer-pulse",
]) {
  check(
    `${selector} covered by reduced motion`,
    reducedMotionBlock.includes(selector),
  );
}

check(
  "reduced motion disables decorative animation",
  /animation:\s*none\s*!important/.test(reducedMotionBlock),
);

check(
  "pointer pulse has static reduced-motion fallback",
  /\.pointer-pulse\s*\{[\s\S]*?transform:\s*scale\(1\)/.test(reducedMotionBlock),
);

const intervalMatch = app.match(/setInterval\([\s\S]*?,\s*(\d+)\s*\)/);
const cursorInterval = intervalMatch ? Number(intervalMatch[1]) : Number.NaN;

check(
  "cursor polling interval is responsive",
  Number.isFinite(cursorInterval) && cursorInterval <= 40,
  Number.isFinite(cursorInterval) ? `${cursorInterval}ms` : "not found",
);

check(
  "puck motion uses compositor-friendly properties",
  css.includes("will-change: transform, opacity"),
);

const failed = checks.filter((item) => !item.passed);

console.log("Toki visual motion QA");
console.log("");

for (const item of checks) {
  const status = item.passed ? "PASS" : "FAIL";
  const detail = item.detail ? ` - ${item.detail}` : "";
  console.log(`[${status}] ${item.name}${detail}`);
}

if (failed.length > 0) {
  console.error("");
  console.error(`Visual motion QA failed with ${failed.length} failing check(s).`);
  process.exit(1);
}

console.log("");
console.log("Visual motion QA passed.");
