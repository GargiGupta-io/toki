// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { useEffect, useRef } from "react";

import type { CircleStrokeState } from "./gestureCircleSelect";
import { circleSelectPolicy } from "./gestureCircleSelect";
import { createFluidTrail, fluidTrailPolicy, type FluidTrail } from "./fluidTrail";
import type { ViewportMetrics } from "./overlayGeometry";
import { placeStrokePoint, trailBounds } from "./selectionTrailPath";
import "./TokiSelectionTrail.css";

/**
 * The mark left by circling something.
 *
 * Four attempts drew a **path**: sample the pointer, smooth it, stroke a curve,
 * fade the tail. Every one read as an object being dragged, because that is
 * what it was -- a shape, redrawn each frame. Making it smoother, wider and
 * grainier changed how the object looked without changing that it was one.
 *
 * This draws nothing. It pushes colour and momentum into a fluid wherever the
 * pointer went, and then lets the fluid behave. What appears is the
 * *consequence* of movement rather than a record of it: the curl, the drift and
 * the settling are not animated, they fall out of the simulation. That is why
 * it reads as air being disturbed rather than as a line being drawn.
 *
 * **One implementation for both instruments.** A hand and a trackpad produce
 * the same thing -- points and times -- and the detector never knew which moved
 * them. Neither does this.
 *
 * The only drawn thing left is the box on completion, and that is not
 * decoration: it is Toki stating which region it took, so it has to be exact.
 */

export { fluidTrailPolicy as trailPolicy };

export function TokiSelectionTrail({
  stroke,
  viewport,
  head,
  colour = "#2A9BFF",
}: {
  stroke: CircleStrokeState | null;
  viewport: ViewportMetrics;
  /**
   * Where the blob actually is, after its spring.
   *
   * The fluid is pushed from here as well as from the samples, so the wake
   * comes off the creature instead of running alongside it.
   */
  head: { x: number; y: number } | null;
  /** The creature's colour, so the trail is plainly the same thing. */
  colour?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trailRef = useRef<FluidTrail | null>(null);
  const frameRef = useRef(0);
  const runningRef = useRef(false);
  const lastPushRef = useRef<{ x: number; y: number } | null>(null);
  const consumedRef = useRef(0);

  const live =
    stroke != null && stroke.phase !== "abandoned" && stroke.points.length > 0;

  /*
   * The loop runs only while there is something to show.
   *
   * Toki is open all day. A full-screen fluid simulation stepping in the
   * background would spend battery drawing nothing, so this starts on the first
   * push and parks itself once the fluid has settled.
   */
  function ensureRunning() {
    if (runningRef.current || trailRef.current == null) {
      return;
    }

    runningRef.current = true;

    const tick = (nowMs: number) => {
      const trail = trailRef.current;

      if (trail == null) {
        runningRef.current = false;
        return;
      }

      if (trail.frame(nowMs)) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      runningRef.current = false;
    };

    frameRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas == null) {
      return;
    }

    // Created once and kept. Building a WebGL context costs tens of
    // milliseconds, and that is the beginning of a gesture -- the part that
    // most has to feel immediate.
    trailRef.current = createFluidTrail(canvas, { colour });

    const onResize = () => trailRef.current?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frameRef.current);
      runningRef.current = false;
      trailRef.current?.dispose();
      trailRef.current = null;
    };
    // Built once for the life of the overlay; the colour is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    trailRef.current?.setColour(colour);
  }, [colour]);

  /*
   * Feed the fluid whatever is new since the last render.
   *
   * By index rather than by time, so every sample is pushed exactly once: a
   * slow hand does not pile colour into one spot, and a fast one does not skip
   * the middle of its own arc.
   */
  useEffect(() => {
    const trail = trailRef.current;

    // An abandoned stroke is one Toki gave up on. Continuing to push colour
    // for it would leave a wake behind a gesture that is no longer happening.
    if (trail == null || stroke == null || stroke.phase === "abandoned") {
      return;
    }

    if (stroke.points.length < consumedRef.current) {
      // A new stroke. Start counting again.
      consumedRef.current = 0;
      lastPushRef.current = null;
    }

    for (let index = consumedRef.current; index < stroke.points.length; index += 1) {
      const at = placeStrokePoint(stroke.points[index], viewport);
      const previous = lastPushRef.current;

      if (previous != null) {
        // Laid continuously between samples. The cursor is read every fifty
        // milliseconds, which at any real speed is tens of pixels apart, and
        // pushing only at those positions leaves a row of separate dots.
        trail.pushSegment(previous, at);
      }

      lastPushRef.current = at;
    }

    consumedRef.current = stroke.points.length;
    ensureRunning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stroke, viewport]);

  /*
   * The wake comes off the creature, not off the raw sample.
   *
   * The blob lags the pointer on purpose -- it is on a spring -- so pushing
   * only at recorded positions left the fluid running beside it rather than out
   * of it.
   */
  useEffect(() => {
    const trail = trailRef.current;

    if (trail == null || head == null || !live) {
      return;
    }

    const previous = lastPushRef.current;

    if (previous != null) {
      trail.pushSegment(previous, head);
      ensureRunning();
    }

    lastPushRef.current = head;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head, live]);

  const bounds =
    stroke?.phase === "complete"
      ? trailBounds(stroke.points.map((point) => placeStrokePoint(point, viewport)))
      : null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="toki-selection-trail__fluid"
        aria-hidden="true"
      />

      {bounds != null && Number.isFinite(bounds.minX) ? (
        <svg
          className="toki-selection-trail"
          data-complete="true"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          width={viewport.width}
          height={viewport.height}
          aria-hidden="true"
          focusable="false"
        >
          {/*
            What Toki understood. The box is the region that was locked, so it
            has to be exactly what was taken.
          */}
          <rect
            className="toki-selection-trail__region"
            x={bounds.minX}
            y={bounds.minY}
            width={Math.max(1, bounds.maxX - bounds.minX)}
            height={Math.max(1, bounds.maxY - bounds.minY)}
            rx={12}
          />
        </svg>
      ) : null}
    </>
  );
}

/** Exported for the tests, which assert the trail cannot outlive its policy. */
export const trailHistoryMs = circleSelectPolicy.historyMs;
