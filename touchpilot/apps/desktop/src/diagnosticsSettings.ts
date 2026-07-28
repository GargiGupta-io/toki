/**
 * Consent for writing diagnostics to disk.
 *
 * Toki's diagnostics export writes to
 * `~/Library/Application Support/app.toki.desktop/diagnostics/`, and one of the
 * files it writes is a PNG of whatever was on screen. The camera and screen
 * recording prompts ask permission to *look* at the screen; nothing in them
 * asks permission to keep a copy. So both switches default to off and the
 * export writes nothing at all until someone deliberately turns them on.
 *
 * The two are separate on purpose. Text diagnostics are useful for support and
 * already have secrets stripped by `sanitizeDebugExportValue`. A screenshot is
 * a different order of sensitivity, and agreeing to share one must never be
 * read as agreeing to share the other.
 */

export type DiagnosticsSettings = {
  diagnosticsEnabled: boolean;
  screenCapturesEnabled: boolean;
};

export const diagnosticsSettingsDefaults: DiagnosticsSettings = Object.freeze({
  diagnosticsEnabled: false,
  screenCapturesEnabled: false,
});

export const DIAGNOSTICS_ENABLED_STORAGE_KEY = "toki.diagnostics-enabled";
export const DIAGNOSTICS_SCREEN_CAPTURES_STORAGE_KEY =
  "toki.diagnostics-screen-captures";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Screen captures are meaningless without diagnostics, and a capture flag that
 * outlived its parent would be worse than useless: turning diagnostics back on
 * months later would silently resume writing screenshots nobody re-approved.
 * Normalising on every read means the stored pair can never express that state,
 * however it was written.
 */
export function normalizeDiagnosticsSettings(
  settings: Partial<DiagnosticsSettings> | null | undefined,
): DiagnosticsSettings {
  const diagnosticsEnabled = settings?.diagnosticsEnabled === true;

  return {
    diagnosticsEnabled,
    screenCapturesEnabled:
      diagnosticsEnabled && settings?.screenCapturesEnabled === true,
  };
}

export function loadDiagnosticsSettings(
  storage: StorageLike | null = getBrowserStorage(),
): DiagnosticsSettings {
  if (storage == null) {
    return diagnosticsSettingsDefaults;
  }

  // Anything other than an exact "true" counts as off, so a corrupted or
  // partially written value fails closed rather than open.
  return normalizeDiagnosticsSettings({
    diagnosticsEnabled:
      storage.getItem(DIAGNOSTICS_ENABLED_STORAGE_KEY) === "true",
    screenCapturesEnabled:
      storage.getItem(DIAGNOSTICS_SCREEN_CAPTURES_STORAGE_KEY) === "true",
  });
}

export function saveDiagnosticsSettings(
  settings: DiagnosticsSettings,
  storage: StorageLike | null = getBrowserStorage(),
): DiagnosticsSettings {
  const normalized = normalizeDiagnosticsSettings(settings);

  storage?.setItem(
    DIAGNOSTICS_ENABLED_STORAGE_KEY,
    normalized.diagnosticsEnabled ? "true" : "false",
  );
  storage?.setItem(
    DIAGNOSTICS_SCREEN_CAPTURES_STORAGE_KEY,
    normalized.screenCapturesEnabled ? "true" : "false",
  );

  return normalized;
}

/**
 * True when turning `next` on requires deleting what `previous` already wrote.
 * Switching diagnostics off is a withdrawal of consent, so the files collected
 * under it should not survive the switch.
 */
export function shouldClearDiagnosticsOnChange(
  previous: DiagnosticsSettings,
  next: DiagnosticsSettings,
): boolean {
  return previous.diagnosticsEnabled && !next.diagnosticsEnabled;
}
