import type { CameraDeviceKind, CameraDeviceSummary } from "@touchpilot/shared";

function classifyCameraDevice(label: string): CameraDeviceKind {
  const normalized = label.toLowerCase();

  if (normalized.includes("depth") || normalized.includes("lidar")) {
    return "depth";
  }

  if (normalized.includes("ir") || normalized.includes("infrared")) {
    return "ir";
  }

  if (normalized.includes("virtual") || normalized.includes("obs")) {
    return "virtual";
  }

  if (normalized.includes("camera") || normalized.includes("webcam")) {
    return "rgb";
  }

  return "unknown";
}

export async function probeCameraDevices(): Promise<CameraDeviceSummary[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");

  return cameras.map((device, index) => {
    const label = device.label || `Camera ${index + 1}`;

    return {
      id: device.deviceId || `camera-${index}`,
      label,
      kind: classifyCameraDevice(label),
      isDefault: device.deviceId === "default" || index === 0,
    };
  });
}
