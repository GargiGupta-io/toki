import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type {
  HandLandmarkFrame,
  HandLandmarkIndex,
  HandLandmarkName,
  HandLandmarkPoint,
  Handedness,
} from "@toki/shared";

export const handLandmarkerAssetMode = "bundled" as const;

export type HandLandmarkerAssetUrls = {
  wasmBaseUrl: string;
  modelAssetUrl: string;
};

export function resolveHandLandmarkerAssetUrls(
  applicationBaseUrl: string,
): HandLandmarkerAssetUrls {
  const assetRootUrl = new URL("./mediapipe/", applicationBaseUrl);

  return {
    wasmBaseUrl: new URL("wasm", assetRootUrl).toString(),
    modelAssetUrl: new URL(
      "models/hand_landmarker.task",
      assetRootUrl,
    ).toString(),
  };
}

const handLandmarkNames: HandLandmarkName[] = [
  "wrist",
  "thumb_cmc",
  "thumb_mcp",
  "thumb_ip",
  "thumb_tip",
  "index_mcp",
  "index_pip",
  "index_dip",
  "index_tip",
  "middle_mcp",
  "middle_pip",
  "middle_dip",
  "middle_tip",
  "ring_mcp",
  "ring_pip",
  "ring_dip",
  "ring_tip",
  "pinky_mcp",
  "pinky_pip",
  "pinky_dip",
  "pinky_tip",
];

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;

export async function getHandLandmarker(): Promise<HandLandmarker> {
  handLandmarkerPromise ??= createHandLandmarker();
  return handLandmarkerPromise;
}

async function createHandLandmarker(): Promise<HandLandmarker> {
  const assetUrls = resolveHandLandmarkerAssetUrls(document.baseURI);
  const vision = await FilesetResolver.forVisionTasks(assetUrls.wasmBaseUrl);

  const options = {
    runningMode: "VIDEO" as const,
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  };

  try {
    return await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        modelAssetPath: assetUrls.modelAssetUrl,
        delegate: "GPU",
      },
    });
  } catch {
    return HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        modelAssetPath: assetUrls.modelAssetUrl,
        delegate: "CPU",
      },
    });
  }
}

export function detectHandLandmarksForVideo(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  frameId: number,
): HandLandmarkFrame[] {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return [];
  }

  const result = landmarker.detectForVideo(video, performance.now());
  const capturedAt = new Date().toISOString();

  return result.landmarks.slice(0, 2).map((landmarks, handIndex) => {
    const handednessCategory = result.handedness[handIndex]?.[0];
    const handedness = normalizeHandedness(handednessCategory?.categoryName);
    const confidence = handednessCategory?.score ?? 0;

    return {
      frameId,
      capturedAt,
      handedness,
      confidence,
      landmarks: landmarks.map(
        (landmark, index): HandLandmarkPoint => ({
          index: index as HandLandmarkIndex,
          name: handLandmarkNames[index] ?? "wrist",
          x: landmark.x,
          y: landmark.y,
          z: landmark.z,
        }),
      ),
    } satisfies HandLandmarkFrame;
  });
}

function normalizeHandedness(value: string | undefined): Handedness {
  if (value === "Left") {
    return "left";
  }

  if (value === "Right") {
    return "right";
  }

  return "unknown";
}
