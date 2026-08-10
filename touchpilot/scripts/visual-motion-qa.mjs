import { readFileSync } from "node:fs";

const css = readFileSync("apps/desktop/src/App.css", "utf8");
const app = readFileSync("apps/desktop/src/App.tsx", "utf8");
const blobPuck = readFileSync("apps/desktop/src/BlobPuck.tsx", "utf8");
const blobPuckCss = readFileSync("apps/desktop/src/BlobPuck.css", "utf8");
const blobCursor = readFileSync("apps/desktop/src/BlobCursor.tsx", "utf8");
const blobCursorCss = readFileSync("apps/desktop/src/BlobCursor.css", "utf8");
const creatureLayer = readFileSync("apps/desktop/src/TokiCreatureLayer.tsx", "utf8");
const creatureCss = readFileSync("apps/desktop/src/TokiCreatureLayer.css", "utf8");
const spotlight = readFileSync("apps/desktop/src/TokiGuidanceSpotlight.tsx", "utf8");
const spotlightCss = readFileSync("apps/desktop/src/TokiGuidanceSpotlight.css", "utf8");
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
  // Somebody who asked for less motion still has to be told where to look, so
  // the outline and the dimming appear -- they just do not fade in.
  "target outline motion has a reduced-motion fallback",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(spotlightCss) &&
    /\.toki-spotlight__ring\s*\{\s*animation-duration:\s*1ms/.test(
      spotlightCss.replace(/\.toki-spotlight__scrim,\s*/g, ""),
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
  // A rotating circle with the mode written around it sat on the control it
  // was pointing at, saying what the notch and the dotted outline already say.
  "no status ring is drawn over the target",
  !creatureLayer.includes("<TokiStatusRing"),
);

check(
  // The outline now comes from the spotlight, sized to the target itself, so a
  // wide control gets a wide box and a small one gets a small box without a
  // separate shape decision.
  "the target outline is sized from the target",
  spotlight.includes("target.width + paddingPx * 2") &&
    spotlight.includes("target.height + paddingPx * 2") &&
    spotlight.includes('className="toki-spotlight__ring"'),
);

check(
  // Dots read as something marked over another application's interface; a
  // solid rounded rectangle reads as a focus ring that application drew.
  "the target outline reads as an annotation",
  spotlightCss.includes("stroke-dasharray: 0.1") &&
    spotlightCss.includes("stroke-linecap: round"),
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
  "two-hand split keeps a persistent liquid strand and remains visual-only",
  blobPuck.includes("presentedSplitVisual?.visualOnly") &&
    blobPuck.includes('data-split-strand={presentedSplitVisual ? "persistent" : "none"}') &&
    blobPuck.includes('data-persistent="true"') &&
    blobPuck.includes('className="blob-puck__split-bridge"') &&
    blobPuck.includes('className="blob-puck__secondary-lobe"') &&
    blobPuckCss.includes(".blob-puck__split-bridge") &&
    /data-split-phase="split"[^}]+\.blob-puck__split-bridge\s*\{[^}]*opacity:\s*0\.[1-9]/.test(
      blobPuckCss,
    ) &&
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.blob-puck__split-bridge,[\s\S]*transition:\s*none/.test(
      blobPuckCss,
    ),
);

check(
  "locked targeting keeps one puck with persistent in-body feedback",
  app.includes("createGesturePuckPresentation") &&
    app.includes("splitVisual={gesturePuckPresentation.splitVisual}") &&
    app.includes("lockState={gesturePuckPresentation.lockState}") &&
    blobPuck.includes(
      'const presentedSplitVisual = lockState === "none" ? splitVisual : null',
    ) &&
    blobPuck.includes("data-lock-state={lockState}") &&
    blobPuck.includes(
      'data-lock-feedback={lockState === "none" ? "none" : "persistent"}',
    ) &&
    blobPuckCss.includes('.blob-puck[data-lock-state="locked"]') &&
    !app.includes("TokiPointerLockCue"),
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
