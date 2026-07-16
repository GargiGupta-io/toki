import { readFileSync } from "node:fs";

const css = readFileSync("apps/desktop/src/App.css", "utf8");
const app = readFileSync("apps/desktop/src/App.tsx", "utf8");
const blobPuck = readFileSync("apps/desktop/src/BlobPuck.tsx", "utf8");
const blobPuckCss = readFileSync("apps/desktop/src/BlobPuck.css", "utf8");
const blobCursor = readFileSync("apps/desktop/src/BlobCursor.tsx", "utf8");
const blobCursorCss = readFileSync("apps/desktop/src/BlobCursor.css", "utf8");
const creatureLayer = readFileSync("apps/desktop/src/TokiCreatureLayer.tsx", "utf8");
const creatureCss = readFileSync("apps/desktop/src/TokiCreatureLayer.css", "utf8");
const statusRing = readFileSync("apps/desktop/src/TokiStatusRing.tsx", "utf8");
const statusRingCss = readFileSync("apps/desktop/src/TokiStatusRing.css", "utf8");
const topUtility = readFileSync("apps/desktop/src/TokiTopUtilitySurface.tsx", "utf8");
const guidanceAcceptance = readFileSync(
  "apps/desktop/src/guidanceAcceptance.ts",
  "utf8",
);
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

check(
  "blob motion has a reduced-motion fallback",
  reducedMotionBlock.includes(".blob") &&
    /animation:\s*none\s*!important/.test(reducedMotionBlock),
);

check(
  "target ring motion has a reduced-motion fallback",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(statusRingCss) &&
    /\.toki-status-ring svg,[\s\S]*\.toki-status-ring__region-progress[\s\S]*animation:\s*none/.test(
      statusRingCss,
    ),
);

check(
  "legacy square and crosshair target marker is removed",
  !app.includes("function PointerRing") &&
    !css.includes(".pointer-target") &&
    !css.includes(".pointer-crosshair") &&
    !css.includes(".pointer-pulse"),
);

check(
  "blob puck renders without rings or aura strands",
  !blobPuck.includes("TokiStatusRing") &&
    !blobPuck.includes("blob-puck-aura") &&
    !blobPuck.includes("blob-puck-strand"),
);

check(
  "accepted target owns the rotating status ring",
  creatureLayer.includes("target != null") &&
    creatureLayer.includes("<TokiStatusRing") &&
    creatureLayer.includes("target.x + target.width / 2") &&
    creatureLayer.includes("target.y + target.height / 2"),
);

check(
  "wide targets receive a full region outline",
  creatureLayer.includes("targetWidth={target.width}") &&
    creatureLayer.includes("targetHeight={target.height}") &&
    statusRing.includes("getTargetCueGeometry") &&
    statusRing.includes("data-shape={geometry.shape}") &&
    statusRing.includes('className="toki-status-ring__region-progress"'),
);

check(
  "compact targets preserve the circular ring",
  statusRing.includes('geometry.shape === "region"') &&
    statusRing.includes('viewBox="0 0 52 52"') &&
    statusRing.includes('className="toki-status-ring__orbit"'),
);

check(
  "strong-risk guidance has a user-controlled Show target gate",
  topUtility.includes("Show target") &&
    topUtility.includes("onRevealTarget") &&
    guidanceAcceptance.includes("targetRevealAcknowledged") &&
    app.includes('type: "reveal-risky-target"'),
);

check(
  "target reveal remains guidance-only",
  topUtility.includes("it will not click or change anything") &&
    app.includes('setRiskTargetRevealed(true)') &&
    !topUtility.includes("onClickTarget"),
);

check(
  "duplicate target travel decoration is removed",
  !creatureLayer.includes("toki-target-travel") &&
    !creatureCss.includes("toki-target-travel"),
);

check(
  "cursor position updates are native-event driven",
  app.includes('listen<NativeCursorPosition>("toki://native-cursor"'),
);

check(
  "blob motion uses animation frames and compositor-friendly transforms",
  blobCursor.includes("window.requestAnimationFrame(applyFrame)") &&
    blobCursorCss.includes("will-change: transform"),
);

check(
  "blob keeps an autonomous liquid dance while stationary",
  blobCursor.includes("ambientMotionIsActive") &&
    blobCursor.includes("ambientDeform") &&
    blobCursor.includes("el.style.borderRadius") &&
    blobPuck.includes("ambientMotion={visual.ambientMotion}") &&
    blobPuck.includes("ambientSpeed={visual.ambientSpeed}"),
);

check(
  "liquid dance respects reduced motion",
  blobCursor.includes('window.matchMedia("(prefers-reduced-motion: reduce)")') &&
    blobCursor.includes("reducedMotionRef.current") &&
    blobPuckCss.includes("@media (prefers-reduced-motion: reduce)"),
);

check(
  "accepted guidance can release exactly one target droplet",
  blobPuck.includes("motion.canSendTargetDroplets && target != null") &&
    blobPuck.includes('className="blob-puck__target-droplet"') &&
    app.includes("target={hasAcceptedGuidance ? activeTarget : null}"),
);

check(
  "target droplet has a reduced-motion fallback",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.blob-puck__target-droplet[\s\S]*display:\s*none/.test(
    blobPuckCss,
  ),
);

check(
  "two-hand split is liquid, visual-only, and reduced-motion safe",
  blobPuck.includes('data-split-visual-only={splitVisual?.visualOnly ? "true" : "false"}') &&
    blobPuck.includes('className="blob-puck__split-bridge"') &&
    blobPuck.includes('className="blob-puck__secondary-lobe"') &&
    blobPuckCss.includes(".blob-puck__split-bridge") &&
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.blob-puck__split-bridge,[\s\S]*transition:\s*none/.test(
      blobPuckCss,
    ),
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
