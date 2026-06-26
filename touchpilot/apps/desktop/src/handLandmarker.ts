import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type {
  HandLandmarkFrame,
  HandLandmarkIndex,
  HandLandmarkName,
  HandLandmarkPoint,
  Handedness,
} from "@toki/shared";

const mediapipeVersion = "0.10.35";
const wasmBaseUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mediapipeVersion}/wasm`;
const handLandmarkerModelUrl =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

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
  const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);

  const options = {
    runningMode: "VIDEO" as const,
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  };

  try {
    return await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        modelAssetPath: handLandmarkerModelUrl,
        delegate: "GPU",
      },
    });
  } catch {
    return HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        modelAssetPath: handLandmarkerModelUrl,
        delegate: "CPU",
      },
    });
  }
}

export function detectHandLandmarksForVideo(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  frameId: number,
): HandLandmarkFrame | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  const result = landmarker.detectForVideo(video, performance.now());
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return null;
  }

  const handednessCategory = result.handedness[0]?.[0];
  const handedness = normalizeHandedness(handednessCategory?.categoryName);
  const confidence = handednessCategory?.score ?? 0;

  return {
    frameId,
    capturedAt: new Date().toISOString(),
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
  };
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
