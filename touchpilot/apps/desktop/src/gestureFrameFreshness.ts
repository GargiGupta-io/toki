export type GestureVideoFrameFreshnessState = Readonly<{
  lastVideoTime: number | null;
  lastAdvancedAtMs: number | null;
  stale: boolean;
}>;

export type GestureVideoFrameFreshnessResult = Readonly<{
  state: GestureVideoFrameFreshnessState;
  shouldInfer: boolean;
  shouldAdvanceWithEmptyFrame: boolean;
}>;

export const gestureVideoFramePolicy = Object.freeze({
  staleAfterMs: 350,
  progressEpsilon: 0.000_1,
});

export type GestureVideoFrameSource = Readonly<{
  currentTime: number;
  getVideoPlaybackQuality?: () => Readonly<{
    totalVideoFrames: number;
  }>;
  webkitDecodedFrameCount?: number;
}>;

export function readGestureVideoFrameProgress(
  video: GestureVideoFrameSource,
): number | null {
  const totalVideoFrames = video.getVideoPlaybackQuality?.().totalVideoFrames;

  if (Number.isFinite(totalVideoFrames) && (totalVideoFrames ?? 0) > 0) {
    return totalVideoFrames ?? null;
  }

  if (
    Number.isFinite(video.webkitDecodedFrameCount) &&
    (video.webkitDecodedFrameCount ?? 0) > 0
  ) {
    return video.webkitDecodedFrameCount ?? null;
  }

  if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
    return video.currentTime;
  }

  // Live MediaStreams in WebKit can report 0 or a non-finite currentTime even
  // while decoded camera frames are available. Returning null makes the
  // caller infer optimistically instead of permanently suppressing the model.
  return null;
}

export function createInitialGestureVideoFrameFreshnessState(): GestureVideoFrameFreshnessState {
  return {
    lastVideoTime: null,
    lastAdvancedAtMs: null,
    stale: false,
  };
}

export function advanceGestureVideoFrameFreshness({
  previousState,
  videoTime,
  nowMs,
  staleAfterMs = gestureVideoFramePolicy.staleAfterMs,
}: {
  previousState: GestureVideoFrameFreshnessState;
  videoTime: number | null;
  nowMs: number;
  staleAfterMs?: number;
}): GestureVideoFrameFreshnessResult {
  if (videoTime == null) {
    return {
      state: {
        ...previousState,
        lastAdvancedAtMs: nowMs,
        stale: false,
      },
      shouldInfer: true,
      shouldAdvanceWithEmptyFrame: false,
    };
  }

  const validVideoTime = Number.isFinite(videoTime) && videoTime >= 0;
  const videoAdvanced =
    validVideoTime &&
    (previousState.lastVideoTime == null ||
      videoTime < previousState.lastVideoTime ||
      videoTime - previousState.lastVideoTime >=
        gestureVideoFramePolicy.progressEpsilon);

  if (videoAdvanced) {
    return {
      state: {
        lastVideoTime: videoTime,
        lastAdvancedAtMs: nowMs,
        stale: false,
      },
      shouldInfer: true,
      shouldAdvanceWithEmptyFrame: false,
    };
  }

  const lastAdvancedAtMs = previousState.lastAdvancedAtMs ?? nowMs;
  const stale = nowMs - lastAdvancedAtMs >= staleAfterMs;

  return {
    state: {
      lastVideoTime: validVideoTime
        ? previousState.lastVideoTime ?? videoTime
        : previousState.lastVideoTime,
      lastAdvancedAtMs,
      stale,
    },
    shouldInfer: false,
    shouldAdvanceWithEmptyFrame: stale,
  };
}
