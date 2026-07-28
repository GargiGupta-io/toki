import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/**
 * Checking for and installing a new version of Toki.
 *
 * Without this, whoever downloads a build keeps it forever: there is no way to
 * ship them a fix short of asking them to visit the site and download again,
 * which most people never do. For an app whose gesture tracking is still
 * settling, that is the difference between "patched on Tuesday" and "everyone
 * from week one is still broken".
 *
 * The download and signature check happen in Rust, so the content security
 * policy does not apply and the update host does not need to be reachable from
 * the page. An update is only installed if it is signed by the private key
 * matching the public key compiled into the app, so a compromised or
 * substituted release file cannot be installed.
 */

export type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current" }
  | { status: "available"; version: string; notes: string | null }
  | { status: "downloading"; version: string }
  | { status: "ready"; version: string }
  | { status: "failed"; message: string };

export const initialUpdateCheckState: UpdateCheckState = { status: "idle" };

export function describeUpdateState(state: UpdateCheckState): string {
  switch (state.status) {
    case "idle":
      return "";
    case "checking":
      return "Checking for updates…";
    case "current":
      return "Toki is up to date.";
    case "available":
      return `Version ${state.version} is available.`;
    case "downloading":
      return `Downloading version ${state.version}…`;
    case "ready":
      return `Version ${state.version} is installed. Restart to finish.`;
    case "failed":
      // Never silently swallow this. An update mechanism that quietly stops
      // working looks identical to one that has nothing to offer, and the
      // difference only becomes visible when a fix fails to reach anyone.
      return `Could not check for updates: ${state.message}`;
  }
}

export async function checkForUpdate(
  checkImpl: () => Promise<Update | null> = check,
): Promise<UpdateCheckState> {
  try {
    const update = await checkImpl();

    if (update == null) {
      return { status: "current" };
    }

    return {
      status: "available",
      version: update.version,
      notes: update.body ?? null,
    };
  } catch (error) {
    return { status: "failed", message: String(error) };
  }
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (state: UpdateCheckState) => void,
): Promise<UpdateCheckState> {
  try {
    onProgress?.({ status: "downloading", version: update.version });
    await update.downloadAndInstall();
    return { status: "ready", version: update.version };
  } catch (error) {
    return { status: "failed", message: String(error) };
  }
}

export async function restartToFinishUpdate(): Promise<void> {
  await relaunch();
}
