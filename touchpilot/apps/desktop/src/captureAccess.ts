export const SCREEN_CAPTURE_ACCESS_REQUIRED_MESSAGE =
  "Screen Recording is not trusted for this Toki build. Grant Screen Recording permission to Toki, quit and relaunch it, then try again.";

export function requireScreenCaptureAccess(allowed: boolean): void {
  if (!allowed) {
    throw new Error(SCREEN_CAPTURE_ACCESS_REQUIRED_MESSAGE);
  }
}
