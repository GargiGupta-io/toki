import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  acceptGestureCalibrationCandidate,
  adaptiveGestureProfileStorageKey,
  clearAdaptiveGestureProfile,
  deriveAdaptiveGestureSettings,
  loadAdaptiveGestureProfile,
  offerGestureCalibrationCandidate,
  rejectGestureCalibrationCandidate,
  saveAdaptiveGestureProfile,
  startGestureCalibration,
} from "../apps/desktop/src/gestureAdaptiveProfile.ts";
import { classifyPinchGesture } from "../apps/desktop/src/gestureClassifier.ts";
import { createSyntheticTrackedHand } from "../apps/desktop/src/gestureFixtures.ts";
import { classifyPointPose } from "../apps/desktop/src/gesturePointing.ts";
import { classifyAirTapPose } from "../apps/desktop/src/gestureTargetLock.ts";

const thresholds = {
  minDetectionConfidence: 0.6,
  pinchHoldMs: 180,
  openPalmHoldMs: 220,
  cooldownMs: 700,
  maxHands: 1,
};

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    values,
  };
}

function approve(session, candidate, frameId) {
  const now = new Date(Date.parse("2026-07-16T00:00:00.000Z") + frameId).toISOString();
  const reviewing = offerGestureCalibrationCandidate(
    session,
    { ...candidate, frameId, capturedAt: now, confidence: 0.94, handedness: "right" },
    now,
  );
  assert.equal(reviewing.status, "reviewing");
  return acceptGestureCalibrationCandidate({
    session: reviewing,
    now,
    profileId: "profile-test",
  });
}

function completeCalibration() {
  let session = startGestureCalibration("2026-07-16T00:00:00.000Z");
  let profile = null;
  let frameId = 0;

  for (const point of [
    { x: 0.18, y: 0.14 },
    { x: 0.82, y: 0.15 },
    { x: 0.2, y: 0.68 },
    { x: 0.8, y: 0.7 },
    { x: 0.5, y: 0.4 },
    { x: 0.48, y: 0.5 },
  ]) {
    const result = approve(session, { stage: "point_range", point }, ++frameId);
    session = result.session;
    profile = result.profile ?? profile;
  }

  for (const value of [1.12, 1.16, 1.18, 1.2, 1.24]) {
    const result = approve(session, { stage: "tap_flexion", value }, ++frameId);
    session = result.session;
    profile = result.profile ?? profile;
  }

  for (const value of [0.28, 0.3, 0.31, 0.32, 0.34]) {
    const result = approve(session, { stage: "pinch_distance", value }, ++frameId);
    session = result.session;
    profile = result.profile ?? profile;
  }

  return { session, profile };
}

test("calibration requires explicit Correct and Wrong gesture discards a sample", () => {
  const session = startGestureCalibration("2026-07-16T00:00:00.000Z");
  const reviewing = offerGestureCalibrationCandidate(
    session,
    {
      stage: "point_range",
      frameId: 1,
      capturedAt: "2026-07-16T00:00:00.001Z",
      handedness: "right",
      confidence: 0.95,
      point: { x: 0.2, y: 0.3 },
    },
    "2026-07-16T00:00:00.001Z",
  );

  assert.equal(reviewing.pointSamples.length, 0);
  const rejected = rejectGestureCalibrationCandidate(
    reviewing,
    "2026-07-16T00:00:00.002Z",
  );
  assert.equal(rejected.status, "collecting");
  assert.equal(rejected.pointSamples.length, 0);
  assert.equal(rejected.rejectedCount, 1);
});

test("six point, five tap, and five pinch approvals complete one profile", () => {
  const { session, profile } = completeCalibration();

  assert.equal(session.status, "complete");
  assert.equal(session.stage, "complete");
  assert.equal(session.acceptedCount, 16);
  assert.ok(profile);
  assert.equal(profile.preferredPointerHand, "right");
  assert.equal(profile.pointRangeX.sampleCount, 6);
  assert.equal(profile.tapFlexion.sampleCount, 5);
  assert.equal(profile.pinchDistance.sampleCount, 5);
  assert.equal(profile.tapFlexion.median, 1.18);
  assert.ok(Math.abs(profile.tapFlexion.medianAbsoluteDeviation - 0.02) < 1e-9);
  const settings = deriveAdaptiveGestureSettings(profile);
  assert.ok(Math.abs(settings.pointerCalibration.cameraMinX - 0.115) < 1e-9);
  assert.ok(Math.abs(settings.pointerCalibration.cameraMaxX - 0.865) < 1e-9);
  assert.ok(Math.abs(settings.pointerCalibration.cameraMinY - 0.15) < 1e-9);
  assert.ok(Math.abs(settings.pointerCalibration.cameraMaxY - 0.75) < 1e-9);
});

test("storage is versioned, local, derived-only, and resettable", () => {
  const storage = createStorage();
  const { profile } = completeCalibration();
  assert.ok(profile);
  assert.equal(saveAdaptiveGestureProfile(storage, profile), true);

  const raw = storage.values.get(adaptiveGestureProfileStorageKey);
  assert.equal(typeof raw, "string");
  assert.doesNotMatch(raw, /landmark|cameraFrame|pointSamples|tapFlexionSamples/i);
  assert.deepEqual(loadAdaptiveGestureProfile(storage), profile);

  storage.setItem(adaptiveGestureProfileStorageKey, JSON.stringify({ ...profile, version: 2 }));
  assert.equal(loadAdaptiveGestureProfile(storage), null);
  assert.equal(clearAdaptiveGestureProfile(storage), true);
  assert.equal(storage.getItem(adaptiveGestureProfileStorageKey), null);
});

test("learned settings are bounded even for extreme valid statistics", () => {
  const { profile } = completeCalibration();
  assert.ok(profile);
  const settings = deriveAdaptiveGestureSettings({
    ...profile,
    pointRangeX: { median: 0.98, medianAbsoluteDeviation: 0, sampleCount: 6 },
    pointRangeY: { median: 0.01, medianAbsoluteDeviation: 0, sampleCount: 6 },
    tapFlexion: { median: 1.5, medianAbsoluteDeviation: 0.2, sampleCount: 5 },
    pinchDistance: { median: 0.49, medianAbsoluteDeviation: 0.1, sampleCount: 5 },
  });

  assert.equal(settings.tapFlexionRatioThreshold, 1.45);
  assert.equal(settings.pinchDistanceThreshold, 0.45);
  assert.ok(
    settings.pointerCalibration.cameraMaxX -
      settings.pointerCalibration.cameraMinX >=
      0.46 - Number.EPSILON,
  );
  assert.ok(
    settings.pointerCalibration.cameraMaxY -
      settings.pointerCalibration.cameraMinY >=
      0.4 - Number.EPSILON,
  );
});

test("adapted thresholds affect only the existing pinch and tap classifiers", () => {
  const pinchFrame = createSyntheticTrackedHand({ pose: "pinch" });
  const pinchDistance = classifyPinchGesture(pinchFrame, thresholds).normalizedDistance;
  assert.ok(pinchDistance != null);
  assert.equal(
    classifyPinchGesture(pinchFrame, thresholds, pinchDistance - 0.001).label,
    "none",
  );
  assert.equal(
    classifyPinchGesture(pinchFrame, thresholds, pinchDistance + 0.001).label,
    "pinch",
  );

  const flexed = createSyntheticTrackedHand({ pose: "tap_flexed" });
  const pointPose = classifyPointPose(flexed, 0.6);
  const ratio = classifyAirTapPose({
    frame: flexed,
    pointPose,
    minDetectionConfidence: 0.6,
  }).indexExtensionRatio;
  assert.ok(ratio != null);
  assert.equal(
    classifyAirTapPose({
      frame: flexed,
      pointPose,
      minDetectionConfidence: 0.6,
      flexionRatioThreshold: ratio - 0.001,
    }).label,
    "none",
  );
  assert.equal(
    classifyAirTapPose({
      frame: flexed,
      pointPose,
      minDetectionConfidence: 0.6,
      flexionRatioThreshold: ratio + 0.001,
    }).label,
    "flexed",
  );
});

test("adaptive profile implementation never owns clicks, provider gates, or raw frames", () => {
  const source = readFileSync(
    new URL("../apps/desktop/src/gestureAdaptiveProfile.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /nativeClick|guidanceProvider|safetyDecision|getUserMedia/);
  assert.doesNotMatch(source, /HandLandmarkFrame|landmarks:/);
});
