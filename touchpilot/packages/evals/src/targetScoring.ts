import type { TargetBox } from "@toki/shared";

import type { EvalExpectedTarget } from "./schema";

export type Point = {
  x: number;
  y: number;
};

export type TargetScoreMetrics = {
  centerDistance: number | null;
  centerHit: boolean;
  iou: number;
  labelMatch: boolean;
  candidateMatch: boolean;
};

export type TargetScoreResult = TargetScoreMetrics & {
  passed: boolean;
  failures: string[];
};

export function getTargetCenter(target: TargetBox): Point {
  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
}

export function getCenterDistance(a: TargetBox, b: TargetBox): number {
  const aCenter = getTargetCenter(a);
  const bCenter = getTargetCenter(b);
  return Math.hypot(aCenter.x - bCenter.x, aCenter.y - bCenter.y);
}

export function isPointInsideTarget(point: Point, target: TargetBox): boolean {
  return (
    point.x >= target.x &&
    point.x <= target.x + target.width &&
    point.y >= target.y &&
    point.y <= target.y + target.height
  );
}

export function getIntersectionOverUnion(a: TargetBox, b: TargetBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  const aArea = Math.max(0, a.width) * Math.max(0, a.height);
  const bArea = Math.max(0, b.width) * Math.max(0, b.height);
  const unionArea = aArea + bArea - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

export function normalizeTargetLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export function scoreTargetMatch(
  actual: TargetBox | null | undefined,
  expected: EvalExpectedTarget,
): TargetScoreResult {
  if (!actual) {
    return {
      centerDistance: null,
      centerHit: false,
      iou: 0,
      labelMatch: false,
      candidateMatch: false,
      passed: false,
      failures: ["missing actual target"],
    };
  }

  const centerDistance = getCenterDistance(actual, expected);
  const centerHit = isPointInsideTarget(getTargetCenter(actual), expected);
  const iou = getIntersectionOverUnion(actual, expected);
  const labelMatch =
    normalizeTargetLabel(actual.label) === normalizeTargetLabel(expected.label);
  const candidateMatch = actual.candidateId === expected.candidateId;
  const failures: string[] = [];

  if (!candidateMatch) {
    failures.push(
      `candidate mismatch: expected ${expected.candidateId}, got ${
        actual.candidateId ?? "none"
      }`,
    );
  }

  if (!labelMatch) {
    failures.push(
      `label mismatch: expected ${expected.label}, got ${actual.label}`,
    );
  }

  if (expected.maxCenterDistance !== undefined) {
    if (centerDistance > expected.maxCenterDistance) {
      failures.push(
        `center distance ${centerDistance.toFixed(2)} > ${
          expected.maxCenterDistance
        }`,
      );
    }
  }

  if (expected.minIoU !== undefined) {
    if (iou < expected.minIoU) {
      failures.push(`IoU ${iou.toFixed(3)} < ${expected.minIoU}`);
    }
  }

  if (!centerHit) {
    failures.push("actual center is outside expected target");
  }

  return {
    centerDistance,
    centerHit,
    iou,
    labelMatch,
    candidateMatch,
    passed: failures.length === 0,
    failures,
  };
}
