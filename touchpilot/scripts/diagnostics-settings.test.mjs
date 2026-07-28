import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DIAGNOSTICS_ENABLED_STORAGE_KEY,
  DIAGNOSTICS_SCREEN_CAPTURES_STORAGE_KEY,
  diagnosticsSettingsDefaults,
  loadDiagnosticsSettings,
  normalizeDiagnosticsSettings,
  saveDiagnosticsSettings,
  shouldClearDiagnosticsOnChange,
} from "../apps/desktop/src/diagnosticsSettings.ts";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDirectory, "..");
const appPath = path.join(workspaceRoot, "apps", "desktop", "src", "App.tsx");
const debugExportPath = path.join(
  workspaceRoot,
  "apps",
  "desktop",
  "src",
  "debugExport.ts",
);
const libPath = path.join(
  workspaceRoot,
  "apps",
  "desktop",
  "src-tauri",
  "src",
  "lib.rs",
);

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    entries,
  };
}

test("both switches default to off", () => {
  // The whole point of the change: a user who never opts in gets nothing
  // written to disk, so neither default may be true.
  assert.equal(diagnosticsSettingsDefaults.diagnosticsEnabled, false);
  assert.equal(diagnosticsSettingsDefaults.screenCapturesEnabled, false);
  assert.deepEqual(
    loadDiagnosticsSettings(createStorage()),
    diagnosticsSettingsDefaults,
  );
  assert.deepEqual(loadDiagnosticsSettings(null), diagnosticsSettingsDefaults);
});

test("screen captures cannot be enabled while diagnostics are off", () => {
  // A capture flag outliving its parent would mean re-enabling diagnostics
  // silently resumes writing screenshots nobody re-approved.
  assert.deepEqual(
    normalizeDiagnosticsSettings({
      diagnosticsEnabled: false,
      screenCapturesEnabled: true,
    }),
    { diagnosticsEnabled: false, screenCapturesEnabled: false },
  );

  const storage = createStorage({
    [DIAGNOSTICS_ENABLED_STORAGE_KEY]: "false",
    [DIAGNOSTICS_SCREEN_CAPTURES_STORAGE_KEY]: "true",
  });
  assert.deepEqual(loadDiagnosticsSettings(storage), {
    diagnosticsEnabled: false,
    screenCapturesEnabled: false,
  });
});

test("anything other than an exact true reads as off", () => {
  for (const value of ["1", "yes", "TRUE", "", "null", "undefined"]) {
    const storage = createStorage({
      [DIAGNOSTICS_ENABLED_STORAGE_KEY]: value,
      [DIAGNOSTICS_SCREEN_CAPTURES_STORAGE_KEY]: value,
    });
    assert.deepEqual(
      loadDiagnosticsSettings(storage),
      diagnosticsSettingsDefaults,
      `"${value}" must not enable diagnostics`,
    );
  }
});

test("saving normalises before persisting", () => {
  const storage = createStorage();
  const saved = saveDiagnosticsSettings(
    { diagnosticsEnabled: false, screenCapturesEnabled: true },
    storage,
  );

  assert.equal(saved.screenCapturesEnabled, false);
  assert.equal(
    storage.getItem(DIAGNOSTICS_SCREEN_CAPTURES_STORAGE_KEY),
    "false",
    "the invalid combination must not reach storage at all",
  );
});

test("both switches on round-trips", () => {
  const storage = createStorage();
  saveDiagnosticsSettings(
    { diagnosticsEnabled: true, screenCapturesEnabled: true },
    storage,
  );
  assert.deepEqual(loadDiagnosticsSettings(storage), {
    diagnosticsEnabled: true,
    screenCapturesEnabled: true,
  });
});

test("collected files are cleared only when consent is withdrawn", () => {
  const on = { diagnosticsEnabled: true, screenCapturesEnabled: true };
  const off = { diagnosticsEnabled: false, screenCapturesEnabled: false };
  const textOnly = { diagnosticsEnabled: true, screenCapturesEnabled: false };

  assert.equal(shouldClearDiagnosticsOnChange(on, off), true);
  assert.equal(shouldClearDiagnosticsOnChange(off, on), false);
  assert.equal(shouldClearDiagnosticsOnChange(on, textOnly), false);
  assert.equal(shouldClearDiagnosticsOnChange(off, off), false);
});

test("the overlay passes both consent flags into the export hook", () => {
  const app = readFileSync(appPath, "utf8");
  const call = app.slice(
    app.indexOf("useTokiDebugExport({"),
    app.indexOf("});", app.indexOf("useTokiDebugExport({")),
  );

  // This hook previously ran unconditionally inside OverlayWindowApp, which is
  // the window every user runs. Losing either flag restores that.
  assert.match(call, /diagnosticsEnabled: diagnosticsSettings\.diagnosticsEnabled/u);
  assert.match(
    call,
    /screenCapturesEnabled: diagnosticsSettings\.screenCapturesEnabled/u,
  );
});

test("the export hook refuses to write or queue while disabled", () => {
  const source = readFileSync(debugExportPath, "utf8");

  assert.match(
    source,
    /if \(!diagnosticsEnabled\) \{/u,
    "the effect must bail out before building a payload",
  );
  assert.match(
    source,
    /!diagnosticsEnabledRef\.current/u,
    "a already-scheduled flush must re-check consent before writing",
  );
  assert.match(
    source,
    /capture: screenCapturesEnabled/u,
    "a queued screenshot must be dropped, not carried forward",
  );
});

test("asking about diagnostics does not create the folder", () => {
  const source = readFileSync(libPath, "utf8");
  const statusFunction = source.slice(
    source.indexOf("fn build_toki_debug_export_status"),
    source.indexOf("\n}", source.indexOf("fn build_toki_debug_export_status")),
  );

  // create_dir_all in the status path would give every user the folder merely
  // for opening the debug window.
  assert.match(statusFunction, /toki_debug_export_directory_path/u);
  assert.doesNotMatch(statusFunction, /create_dir_all/u);
  assert.match(source, /fn clear_toki_debug_export/u);
  assert.match(source, /clear_toki_debug_export,/u, "command must be registered");
});
