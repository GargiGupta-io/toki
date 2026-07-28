/**
 * macOS Centre Stage digitally pans, crops, and zooms the camera frame to keep a
 * person centred. It is actively hostile to hand tracking:
 *
 * - a raised hand can fall outside the crop entirely, so the model sees no hand;
 * - re-framing makes a still hand appear to move, and a moving hand jump;
 * - camera-to-screen mapping assumes a fixed field of view, and Centre Stage
 *   changes both the crop origin and the zoom while it runs.
 *
 * Toki cannot switch it off. The control mode belongs to the user through
 * Control Centre, and it is a system-wide setting that also affects their other
 * video apps, so silently flipping it would be wrong even if it were possible.
 * What Toki must not do is stay silent: the failure looks exactly like Toki
 * being broken, and a new user has no way to guess the cause.
 */

export const cameraReframingLabel = "Centre Stage is breaking hand tracking";

export const cameraReframingMessage =
  "Centre Stage keeps re-framing the camera, which hides your hand. " +
  "Turn it off in Control Centre → Video Effects.";

export type CameraReframingState = {
  /** `null` when the system could not be asked, which is not a warning. */
  active: boolean | null;
  checkedAt: string | null;
};

export const initialCameraReframingState: CameraReframingState = {
  active: null,
  checkedAt: null,
};

export function shouldWarnAboutCameraReframing({
  reframing,
  gesturesEnabled,
  cameraStatus,
}: {
  reframing: CameraReframingState;
  gesturesEnabled: boolean;
  cameraStatus: string;
}): boolean {
  // Only worth saying while Toki is actually trying to read hands. An unknown
  // result is treated as nothing to report rather than as a fault.
  return (
    reframing.active === true && gesturesEnabled && cameraStatus === "active"
  );
}
