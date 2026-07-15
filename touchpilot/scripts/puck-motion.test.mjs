import assert from "node:assert/strict";
import test from "node:test";
import { getPuckMotionModel } from "../apps/desktop/src/puckMotion.ts";

const safeGuidingInput = {
  overlayState: "guiding",
  hasAcceptedGuidance: true,
  hasActiveTarget: true,
  isRefreshingCapture: false,
  hasCaptureError: false,
  guidanceIssueCount: 0,
};

test("accepted visible guidance can release a target droplet", () => {
  assert.deepEqual(getPuckMotionModel(safeGuidingInput), {
    state: "guiding",
    canSendTargetDroplets: true,
  });
});

test("a rejected target can never release a target droplet", () => {
  assert.deepEqual(
    getPuckMotionModel({
      ...safeGuidingInput,
      guidanceIssueCount: 1,
    }),
    {
      state: "error",
      canSendTargetDroplets: false,
    },
  );
});

test("a hidden or missing target can never release a target droplet", () => {
  assert.equal(
    getPuckMotionModel({
      ...safeGuidingInput,
      hasActiveTarget: false,
    }).canSendTargetDroplets,
    false,
  );
});

test("processing keeps the blob active but does not release a target droplet", () => {
  assert.deepEqual(
    getPuckMotionModel({
      ...safeGuidingInput,
      overlayState: "thinking",
      isRefreshingCapture: true,
    }),
    {
      state: "thinking",
      canSendTargetDroplets: false,
    },
  );
});
