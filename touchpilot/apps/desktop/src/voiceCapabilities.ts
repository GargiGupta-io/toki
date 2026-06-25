import type { VoicePermissionState } from "@toki/shared";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type MicrophoneDeviceSummary = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type SpeechRecognitionSupport = {
  supported: boolean;
  api: "SpeechRecognition" | "webkitSpeechRecognition" | "none";
};

export type VoiceCapabilityProbe = {
  checkedAt: string;
  mediaDevicesSupported: boolean;
  getUserMediaSupported: boolean;
  enumerateDevicesSupported: boolean;
  permissionsApiSupported: boolean;
  microphonePermission: VoicePermissionState;
  speechRecognition: SpeechRecognitionSupport;
  microphones: MicrophoneDeviceSummary[];
  error?: string;
};

export type VoiceCapabilityProbeOptions = {
  requestMicrophone?: boolean;
};

function getSpeechRecognitionSupport(): SpeechRecognitionSupport {
  if (window.SpeechRecognition != null) {
    return { supported: true, api: "SpeechRecognition" };
  }

  if (window.webkitSpeechRecognition != null) {
    return { supported: true, api: "webkitSpeechRecognition" };
  }

  return { supported: false, api: "none" };
}

function getPermissionFromState(state: PermissionState): VoicePermissionState {
  if (state === "granted" || state === "denied" || state === "prompt") {
    return state;
  }

  return "unknown";
}

function getPermissionFromError(error: unknown): VoicePermissionState {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "denied";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "unsupported";
  }

  return "error";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function queryMicrophonePermission(): Promise<VoicePermissionState> {
  if (navigator.permissions?.query == null) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return getPermissionFromState(status.state);
  } catch {
    return "unknown";
  }
}

async function requestMicrophonePermission(): Promise<{
  permission: VoicePermissionState;
  error?: string;
}> {
  if (navigator.mediaDevices?.getUserMedia == null) {
    return { permission: "unsupported", error: "getUserMedia is not available." };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    return { permission: "granted" };
  } catch (error) {
    return {
      permission: getPermissionFromError(error),
      error: getErrorMessage(error),
    };
  }
}

async function getMicrophones(): Promise<MicrophoneDeviceSummary[]> {
  if (navigator.mediaDevices?.enumerateDevices == null) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      id: device.deviceId || `microphone-${index}`,
      label: device.label || `Microphone ${index + 1}`,
      isDefault: device.deviceId === "default" || index === 0,
    }));
}

export async function probeVoiceCapabilities(
  options: VoiceCapabilityProbeOptions = {},
): Promise<VoiceCapabilityProbe> {
  const mediaDevicesSupported = navigator.mediaDevices != null;
  const getUserMediaSupported = navigator.mediaDevices?.getUserMedia != null;
  const enumerateDevicesSupported = navigator.mediaDevices?.enumerateDevices != null;
  const permissionsApiSupported = navigator.permissions?.query != null;
  const speechRecognition = getSpeechRecognitionSupport();
  let microphonePermission: VoicePermissionState = getUserMediaSupported
    ? await queryMicrophonePermission()
    : "unsupported";
  let error: string | undefined;

  if (options.requestMicrophone) {
    const requestResult = await requestMicrophonePermission();
    microphonePermission = requestResult.permission;
    error = requestResult.error;
  }

  const microphones = await getMicrophones().catch((deviceError: unknown) => {
    error = error ?? getErrorMessage(deviceError);
    return [];
  });

  return {
    checkedAt: new Date().toISOString(),
    mediaDevicesSupported,
    getUserMediaSupported,
    enumerateDevicesSupported,
    permissionsApiSupported,
    microphonePermission,
    speechRecognition,
    microphones,
    error,
  };
}
