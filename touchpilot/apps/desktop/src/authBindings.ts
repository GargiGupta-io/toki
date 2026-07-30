// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { invoke } from "@tauri-apps/api/core";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";

import { AuthSession, readAuthConfig, type SessionDeps } from "./authSession";

/**
 * The real wiring behind sign-in: Keychain, system browser, toki:// links.
 *
 * Kept apart from `authSession.ts` so the flow itself stays testable. This file
 * is the part that cannot run outside a Tauri window.
 */

export function createAuthSession(): AuthSession | null {
  const config = readAuthConfig(import.meta.env);

  // No project configured means no sign-in, which is a normal state during
  // local development against fixtures. The caller shows no sign-in button
  // rather than one that fails when pressed.
  if (!config) {
    return null;
  }

  const deps: SessionDeps = {
    config,
    load: () => invoke<string | null>("read_auth_session"),
    save: (session) => invoke("store_auth_session", { session }),
    clear: () => invoke("clear_auth_session"),
    openUrl: (url) => openUrl(url),
    transport: (grantType, payload) =>
      invoke("auth_token_request", {
        supabaseUrl: config.supabaseUrl,
        anonKey: config.anonKey,
        grantType,
        payload,
      }),
  };

  return new AuthSession(deps);
}

/**
 * Listen for the browser handing sign-in back.
 *
 * `onOpenUrl` reports the link that launched the app as well as any that arrive
 * later, which is what covers the cold start: macOS launches Toki to deliver
 * the callback, so there is no running app to receive an event.
 */
export function listenForAuthCallback(
  handle: (url: string) => void,
): Promise<() => void> {
  return onOpenUrl((urls) => {
    for (const url of urls) {
      handle(url);
    }
  });
}
