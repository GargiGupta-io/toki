import { useCallback, useEffect, useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";

import {
  checkForUpdate,
  describeUpdateState,
  downloadAndInstallUpdate,
  initialUpdateCheckState,
  type UpdateCheckState,
} from "./appUpdates";
import { createAuthSession, listenForAuthCallback } from "./authBindings";
import {
  describeAuthState,
  describePlan,
  signedOut,
  type AuthSession,
  type AuthState,
} from "./authSession";
import {
  loadDiagnosticsSettings,
  normalizeDiagnosticsSettings,
  type DiagnosticsSettings,
} from "./diagnosticsSettings";
import {
  clearOpenAiKey,
  describeOpenAiKeyStatus,
  getOpenAiKeyStatus,
  setOpenAiKey,
  unknownOpenAiKeyStatus,
  type OpenAiKeyStatus,
} from "./openAiKey";
import {
  describeLocalTranscription,
  getOperatorSetting,
  setOperatorSetting,
  whisperBinarySetting,
  whisperModelSetting,
} from "./operatorSettings";
import { createTokiApiClient, type AccountState } from "./tokiApiClient";
import { Row, Toggle } from "./TokiControls";
import {
  DownloadIcon,
  PersonIcon,
  ShieldIcon,
  SlidersIcon,
} from "./TokiIcons";
import "./TokiSettingsWindow.css";

/**
 * The settings window.
 *
 * Everything configured once and then forgotten. The panel under the notch
 * keeps only what is touched every session -- talking, pausing, the camera --
 * because a strip hanging off the notch is the wrong shape for an API key and
 * two absolute file paths. Those need width, and a window can have width.
 *
 * This replaces an earlier Preferences window that was removed for being a
 * second place to look for the same thing. The objection was sound; the answer
 * was not to fold a key field into a 420px strip, but to make the two surfaces
 * mean different things. The panel is for now. This is for setup.
 */

/**
 * Tell the panel that what it can transcribe with may have changed.
 *
 * The panel lives in another window with its own JavaScript context, so a value
 * written here is invisible to it until it asks again. It used to ask on every
 * focus, which meant a Keychain read -- and on a rebuilt binary, a password
 * prompt -- each time the panel was touched.
 *
 * Failing to announce is not worth surfacing: the setting is saved either way,
 * and the panel catches up next time it starts.
 */
async function announceSpeechSettingsChanged(): Promise<void> {
  try {
    await emitTo("settings", "toki://speech-settings-changed", {});
  } catch {
    // Nothing to tell the person; the write succeeded.
  }
}

type Section = "general" | "account" | "speech" | "privacy" | "updates";

const sections: Array<{
  id: Section;
  label: string;
  icon: () => React.ReactElement;
}> = [
  { id: "general", label: "General", icon: SlidersIcon },
  { id: "account", label: "Account", icon: PersonIcon },
  { id: "speech", label: "Speech", icon: SlidersIcon },
  { id: "privacy", label: "Privacy", icon: ShieldIcon },
  { id: "updates", label: "Updates", icon: DownloadIcon },
];

export function TokiSettingsWindow() {
  const [section, setSection] = useState<Section>("general");

  const authRef = useRef<AuthSession | null>(null);
  const [authState, setAuthState] = useState<AuthState>(signedOut);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [planChecked, setPlanChecked] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [keyStatus, setKeyStatus] = useState<OpenAiKeyStatus>(
    unknownOpenAiKeyStatus,
  );
  const [keyDraft, setKeyDraft] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [whisperBinary, setWhisperBinary] = useState("");
  const [whisperModel, setWhisperModel] = useState("");
  const [whisperError, setWhisperError] = useState<string | null>(null);

  const [diagnostics, setDiagnostics] = useState<DiagnosticsSettings>(
    loadDiagnosticsSettings,
  );

  const [updateState, setUpdateState] = useState<UpdateCheckState>(
    initialUpdateCheckState,
  );
  const pendingUpdateRef = useRef<Awaited<
    ReturnType<typeof import("@tauri-apps/plugin-updater").check>
  > | null>(null);

  useEffect(() => {
    const session = createAuthSession();
    authRef.current = session;

    getOpenAiKeyStatus()
      .then(setKeyStatus)
      .catch(() => setKeyStatus(unknownOpenAiKeyStatus));
    void getOperatorSetting(whisperBinarySetting).then((v) =>
      setWhisperBinary(v ?? ""),
    );
    void getOperatorSetting(whisperModelSetting).then((v) =>
      setWhisperModel(v ?? ""),
    );

    if (session == null) {
      setPlanChecked(true);
      return;
    }

    void session.restore().then(setAuthState);

    // The sign-in callback comes back as a toki:// link, and macOS may launch
    // the app to deliver one. Registered here because this is the window that
    // starts sign-in.
    const stopping = listenForAuthCallback((url) => {
      void session.completeSignIn(url).then(setAuthState);
    });
    return () => {
      void stopping.then((stop) => stop()).catch(() => undefined);
    };
  }, []);

  const refreshAccount = useCallback(async () => {
    const session = authRef.current;
    if (session == null) {
      setAccount(null);
      setPlanChecked(true);
      return;
    }
    const client = createTokiApiClient({
      endpoint: import.meta.env.VITE_TOKI_GUIDANCE_ENDPOINT,
      session,
    });
    setAccount(await client.account());
    setPlanChecked(true);
  }, []);

  useEffect(() => {
    if (authState.status === "signed_in") {
      void refreshAccount();
    } else {
      setAccount(null);
      setPlanChecked(authState.status !== "waiting_for_browser");
    }
  }, [authState.status, refreshAccount]);

  // Payment completes in the browser and is confirmed to the service, not to
  // this app, so returning to this window is when it is worth asking again.
  useEffect(() => {
    if (authState.status !== "signed_in") {
      return;
    }
    const onFocus = () => void refreshAccount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [authState.status, refreshAccount]);

  async function runAccountAction(
    action: "signIn" | "signOut" | "checkout" | "portal",
  ) {
    const session = authRef.current;
    if (session == null) {
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    try {
      if (action === "signIn") {
        setAuthState(await session.signIn());
        return;
      }
      if (action === "signOut") {
        setAuthState(await session.signOut());
        // The overlay holds its own copy of the session and its token stays
        // valid until it expires, so it has to be told rather than left to
        // notice.
        emitTo("overlay", "toki://overlay-command", {
          type: "auth-changed",
        }).catch(() => undefined);
        return;
      }

      const client = createTokiApiClient({
        endpoint: import.meta.env.VITE_TOKI_GUIDANCE_ENDPOINT,
        session,
      });
      const result =
        action === "checkout"
          ? await client.startCheckout()
          : await client.manageSubscription();

      if ("url" in result) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(result.url);
      } else {
        setAccountError(result.error);
      }
    } catch (error) {
      setAccountError(String(error));
    } finally {
      setAccountBusy(false);
    }
  }

  function applyDiagnostics(next: DiagnosticsSettings) {
    const normalized = normalizeDiagnosticsSettings(next);
    setDiagnostics(normalized);
    emitTo("overlay", "toki://overlay-command", {
      type: "set-diagnostics-settings",
      settings: normalized,
    }).catch(() => undefined);
  }

  return (
    <main className="toki-settings" aria-label="Toki settings">
      <nav className="toki-settings__tabs" role="tablist">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            data-active={section === id}
            onClick={() => setSection(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="toki-settings__body" role="tabpanel">
        {section === "general" && (
          <>
            <p className="toki-settings__lead">
              Toki lives in the menu bar. Click its icon for the panel under the
              notch, where everything you use while working already is.
            </p>
            <Toggle
              label="Speak explanations"
              detail="Reads out what Toki is pointing at."
              on
              onToggle={() => undefined}
              disabled
            />
          </>
        )}

        {section === "account" && (
          <>
            <p className="toki-settings__lead">
              {authRef.current == null
                ? "This build has no account service configured."
                : describeAuthState(authState)}
            </p>
            {authRef.current != null && (
              <>
                <p className="toki-note">
                  {planChecked ? describePlan(account) : "Checking your plan…"}
                </p>
                {accountError && (
                  <p className="toki-note" data-tone="warn">
                    {accountError}
                  </p>
                )}
                {authState.status === "signed_in" ? (
                  <>
                    {planChecked && account != null && !account.entitled && (
                      <Row
                        label="Upgrade to Pro"
                        detail="Opens Stripe in your browser."
                        onClick={() => void runAccountAction("checkout")}
                        disabled={accountBusy}
                      />
                    )}
                    {planChecked && account?.hasBillingAccount && (
                      <Row
                        label="Manage plan"
                        detail="Change your card, or cancel."
                        onClick={() => void runAccountAction("portal")}
                        disabled={accountBusy}
                      />
                    )}
                    <div className="toki-settings__actions">
                      <button
                        type="button"
                        onClick={() => void refreshAccount()}
                        disabled={accountBusy}
                      >
                        Refresh plan
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAccountAction("signOut")}
                        disabled={accountBusy}
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                ) : (
                  <Row
                    label="Sign in"
                    detail="Opens your browser, then returns here."
                    onClick={() => void runAccountAction("signIn")}
                    disabled={accountBusy}
                  />
                )}
              </>
            )}
          </>
        )}

        {section === "speech" && (
          <>
            <p className="toki-settings__lead">{describeOpenAiKeyStatus(keyStatus)}</p>
            <label className="toki-settings__field">
              <span>OpenAI API key</span>
              <input
                type="password"
                value={keyDraft}
                placeholder={keyStatus.stored ? "Replace saved key" : "sk-…"}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setKeyDraft(event.target.value)}
              />
            </label>
            {keyError && (
              <p className="toki-note" data-tone="warn">
                {keyError}
              </p>
            )}
            <div className="toki-settings__actions">
              <button
                type="button"
                disabled={keyBusy || keyDraft.trim().length === 0}
                onClick={async () => {
                  setKeyBusy(true);
                  setKeyError(null);
                  try {
                    setKeyStatus(await setOpenAiKey(keyDraft));
                    await announceSpeechSettingsChanged();
                    // Cleared the moment it is stored, so the secret does not
                    // sit in the DOM for the rest of the session.
                    setKeyDraft("");
                  } catch (error) {
                    setKeyError(String(error));
                  } finally {
                    setKeyBusy(false);
                  }
                }}
              >
                Save key
              </button>
              <button
                type="button"
                disabled={keyBusy || !keyStatus.stored}
                onClick={async () => {
                  setKeyBusy(true);
                  try {
                    setKeyStatus(await clearOpenAiKey());
                    await announceSpeechSettingsChanged();
                  } catch (error) {
                    setKeyError(String(error));
                  } finally {
                    setKeyBusy(false);
                  }
                }}
              >
                Remove key
              </button>
            </div>

            <h2 className="toki-settings__heading">Local transcription</h2>
            <p className="toki-note">
              {describeLocalTranscription(
                whisperBinary || null,
                whisperModel || null,
              )}
            </p>
            <label className="toki-settings__field">
              <span>Whisper binary</span>
              <input
                type="text"
                value={whisperBinary}
                placeholder="/absolute/path/to/whisper-cli"
                spellCheck={false}
                onChange={(event) => setWhisperBinary(event.target.value)}
              />
            </label>
            <label className="toki-settings__field">
              <span>Whisper model</span>
              <input
                type="text"
                value={whisperModel}
                placeholder="/absolute/path/to/model.bin"
                spellCheck={false}
                onChange={(event) => setWhisperModel(event.target.value)}
              />
            </label>
            {whisperError && (
              <p className="toki-note" data-tone="warn">
                {whisperError}
              </p>
            )}
            <div className="toki-settings__actions">
              <button
                type="button"
                onClick={async () => {
                  setWhisperError(null);
                  try {
                    await setOperatorSetting(whisperBinarySetting, whisperBinary);
                    await setOperatorSetting(whisperModelSetting, whisperModel);
                    // The panel shows whether anything can transcribe, and it
                    // has its own JavaScript context, so it cannot see this.
                    // It used to re-read on every focus, which asked the
                    // Keychain -- and a password prompt -- each time the panel
                    // was touched. This is the only moment the answer changes.
                    await announceSpeechSettingsChanged();
                  } catch (error) {
                    setWhisperError(String(error));
                  }
                }}
              >
                Save paths
              </button>
            </div>
            <p className="toki-note">
              Typed, never searched for. An app opened from Finder inherits no
              shell environment, so an environment variable is absent for every
              ordinary user — and hunting for a binary on disk is how a writable
              folder turns into code running inside Toki&rsquo;s screen-recording
              permission.
            </p>
          </>
        )}

        {section === "privacy" && (
          <>
            <p className="toki-settings__lead">
              Both are off unless you turn them on, and turning diagnostics off
              deletes what was collected.
            </p>
            <Toggle
              label="Share diagnostics"
              detail="Timings and errors. Never what is on your screen."
              on={diagnostics.diagnosticsEnabled}
              onToggle={() =>
                applyDiagnostics({
                  ...diagnostics,
                  diagnosticsEnabled: !diagnostics.diagnosticsEnabled,
                })
              }
            />
            <Toggle
              label="Include screenshots"
              detail={
                diagnostics.diagnosticsEnabled
                  ? "Saves pictures of your screen alongside diagnostics."
                  : "Needs diagnostics turned on first."
              }
              on={diagnostics.screenCapturesEnabled}
              onToggle={() =>
                applyDiagnostics({
                  ...diagnostics,
                  screenCapturesEnabled: !diagnostics.screenCapturesEnabled,
                })
              }
              disabled={!diagnostics.diagnosticsEnabled}
            />
          </>
        )}

        {section === "updates" && (
          <>
            <p className="toki-settings__lead">
              {describeUpdateState(updateState) ||
                "Toki checks for updates when you ask it to."}
            </p>
            <div className="toki-settings__actions">
              <button
                type="button"
                disabled={
                  updateState.status === "checking" ||
                  updateState.status === "downloading"
                }
                onClick={async () => {
                  setUpdateState({ status: "checking" });
                  const { check } = await import("@tauri-apps/plugin-updater");
                  setUpdateState(
                    await checkForUpdate(async () => {
                      const update = await check();
                      pendingUpdateRef.current = update;
                      return update;
                    }),
                  );
                }}
              >
                Check for updates
              </button>
              {updateState.status === "available" && (
                <button
                  type="button"
                  onClick={async () => {
                    const update = pendingUpdateRef.current;
                    if (update == null) {
                      return;
                    }
                    setUpdateState(
                      await downloadAndInstallUpdate(update, setUpdateState),
                    );
                  }}
                >
                  Install
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
