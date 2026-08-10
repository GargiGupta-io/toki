import { spawnSync } from "node:child_process";

/**
 * Can Toki see the screen right now?
 *
 * This used to check that a coding CLI was installed and signed in. There is no
 * CLI any more: guidance is one HTTPS request to Gemini, so the only thing that
 * can be missing is a key -- and the only thing worth proving is that the key
 * works against the model that is actually configured.
 *
 * It sends a real request rather than checking that a string is non-empty. Every
 * way this can fail (a revoked key, a retired model, a region block, no network)
 * looks identical from the outside until something is sent.
 */

import { DEFAULT_GEMINI_MODEL } from "./guidance-smoke-server.mjs";

const TOKI_BINARY = "/Applications/Toki.app/Contents/MacOS/toki-desktop";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Ask the app, rather than looking the key up here.
 *
 * This used to read a standalone Keychain item with `security
 * find-generic-password`. Toki does not store settings that way: everything
 * lives in one vault blob, looked up by name inside it. So a key added from a
 * terminal was perfectly real, perfectly readable, and completely invisible to
 * the app -- and this script cheerfully reported READY while Toki reported no
 * key at all, which is the exact opposite of what a check is for.
 *
 * The app answers about its own storage, and no secret has to leave it.
 */
function askTokiForKeyStatus() {
  const result = spawnSync(TOKI_BINARY, ["--probe-gemini"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  if (result.status !== 0 || typeof result.stdout !== "string") {
    return null;
  }

  const answer = result.stdout.trim();

  return answer.startsWith("ready")
    ? { stored: true, hint: answer.slice("ready".length).trim() }
    : { stored: false, reason: answer.replace(/^blocked\s*/u, "") };
}

/**
 * A key to send with, for the live request.
 *
 * Only the environment: the app's own key stays inside the app. When there is
 * none here, the check reports what Toki says about its storage and stops
 * short of pretending to have made a call.
 */
function resolveKey() {
  for (const name of ["GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
    const value = process.env[name]?.trim();
    if (value) {
      return { key: value, source: name };
    }
  }

  return null;
}

// Imported rather than repeated. This script kept its own copy of the default
// and was left behind when the app's changed, so it reported the free tier as
// exhausted while the app was working perfectly -- a check that lies about the
// thing it exists to check is worse than no check.
const model = process.env.TOKI_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
const resolved = resolveKey();

const inToki = askTokiForKeyStatus();

if (inToki?.stored) {
  console.log(`[READY] Toki has a key stored ${inToki.hint}.`);
} else if (inToki) {
  console.error("[BLOCKED] Toki has no key stored.");
  console.error(inToki.reason);
  console.error("");
  console.error("Save it in Toki: Settings, Speech, under 'Seeing your screen'.");
  console.error("A key added with `security add-generic-password` will not do:");
  console.error("Toki keeps its settings in one vault and never reads that item.");
  process.exitCode = 1;
} else {
  console.error("[SKIPPED] Could not ask Toki about its stored key.");
}

if (resolved == null) {
  // Nothing to send with from here. What Toki holds has already been reported.
  process.exit(process.exitCode ?? 0);
} else {
  // A one-pixel PNG. Enough to exercise the image path -- which is the part
  // that fails differently from a text-only request -- without sending anything
  // off this machine that came from the screen.
  const onePixelPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": resolved.key,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: 'Reply with the JSON object {"ok":true} and nothing else.' },
            { inline_data: { mime_type: "image/png", data: onePixelPng } },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  }).catch((error) => ({ ok: false, status: 0, error }));

  if (!response.ok) {
    const detail =
      typeof response.text === "function"
        ? await response.text().catch(() => "")
        : String(response.error ?? "");

    if (response.status === 429) {
      // Not a fault. The free tier allows a few questions a minute, and the
      // quickest way to reach it is checking that it works.
      console.error("[WAIT] The free tier's limit was reached, not a bad key.");
      console.error("Give it a minute and run this again.");
      console.error(detail.match(/limit: [\d,]+/u)?.[0] ?? "");
      process.exitCode = 1;
    } else {
      console.error(`[BLOCKED] Gemini refused: ${response.status}`);
      console.error(detail.slice(0, 400));
    }

    if (response.status === 404) {
      console.error("");
      console.error(
        `A 404 here means the model is retired, not that the key is wrong. Set`,
      );
      console.error(`TOKI_GEMINI_MODEL to a current one; "${model}" was tried.`);
    }

    process.exitCode = 1;
  } else {
    const payload = await response.json();
    const text = (payload?.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part?.text ?? "")
      .join("")
      .trim();

    console.log(`[READY] ${model}, key from ${resolved.source}.`);
    console.log(text || "(the model answered with nothing, which is odd)");
  }
}
