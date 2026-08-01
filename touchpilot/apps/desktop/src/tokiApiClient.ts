// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { invoke } from "@tauri-apps/api/core";

import type { AuthSession } from "./authSession";
import {
  readHostedVisionResponse,
  type HostedVisionReply,
} from "./hostedVisionProvider";

/**
 * The one way this app talks to its own service.
 *
 * Every call goes out through Rust rather than from the window, so the window's
 * ban on remote origins stays absolute, and the access token is attached down
 * there rather than being handed to JavaScript to attach.
 *
 * A request is never sent without a token. Sending one anonymously would get a
 * 401 back, which is a slower way of finding out what is already known here,
 * and it would put a screenshot on the wire for a call that cannot succeed.
 */

export type ApiReply = { status: number; body: Record<string, unknown> };

/** What the service says this account is entitled to. */
export type AccountState = {
  email: string | null;
  tier: "free" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  /** Whether paid features may run. The server decides this, not the client. */
  entitled: boolean;
  /** Whether there is a Stripe customer to manage, so "Manage plan" can work. */
  hasBillingAccount: boolean;
};

export type TokiApiClient = {
  configured: boolean;
  vision(body: {
    prompt: string;
    imageBase64: string;
    imageFormat: "png" | "jpeg";
    outputSchema?: unknown;
  }): Promise<HostedVisionReply>;
  /** Reads the plan. Null while signed out or unreachable. */
  account(): Promise<AccountState | null>;
  /** Returns the Stripe page to open in the browser, or an error. */
  startCheckout(): Promise<{ url: string } | { error: string }>;
  manageSubscription(): Promise<{ url: string } | { error: string }>;
};

/**
 * How long to wait before the single cold-start retry.
 *
 * Long enough for a container to finish starting, short enough that somebody
 * watching does not conclude the app has hung.
 */
const coldStartWaitMs = 4_000;

const signedOutReply: HostedVisionReply = {
  kind: "signed_out",
  error: "Sign in to use live guidance.",
};

export function createTokiApiClient({
  endpoint,
  session,
  send = (path, accessToken, body) =>
    invoke<ApiReply>("toki_api_request", {
      endpoint,
      path,
      accessToken,
      body,
    }),
}: {
  endpoint: string | undefined;
  session: AuthSession | null;
  send?: (
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
  ) => Promise<ApiReply>;
}): TokiApiClient {
  const configured = Boolean(endpoint?.trim()) && session != null;

  async function call(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ApiReply | null> {
    // `accessToken` refreshes an expiring token before returning it, and
    // returns null once the session is genuinely over.
    const token = await session?.accessToken();
    if (token == null) {
      return null;
    }

    const reply = await send(path, token, body);

    // One retry, only for a host that is still waking up.
    //
    // The service sleeps when idle and its host answers 502 or 503 for the
    // first moments of a cold start, before the process is listening. Treating
    // that as a real failure meant the app reported the plan as uncheckable
    // whenever somebody opened it after a quiet spell -- which is most of the
    // time. Nothing else is retried: a 4xx is an answer, and repeating a
    // request that costs money is not a fix for anything.
    if (reply.status === 502 || reply.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, coldStartWaitMs));
      return send(path, token, body);
    }

    return reply;
  }

  return {
    configured,

    async vision(body) {
      if (!configured) {
        return {
          kind: "error",
          error: "This build has no guidance service configured.",
        };
      }

      try {
        const reply = await call("/vision", body);
        return reply == null
          ? signedOutReply
          : readHostedVisionResponse(reply.status, reply.body);
      } catch (error) {
        return {
          kind: "error",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async account() {
      if (!configured) {
        return null;
      }

      try {
        const reply = await call("/account", {});
        if (reply == null || reply.status !== 200) {
          return null;
        }

        const body = reply.body;
        return {
          email: typeof body.email === "string" ? body.email : null,
          tier: body.tier === "pro" ? "pro" : "free",
          status: typeof body.status === "string" ? body.status : "unknown",
          currentPeriodEnd:
            typeof body.currentPeriodEnd === "string" ? body.currentPeriodEnd : null,
          // Absent or malformed means not entitled. A parsing accident must
          // never hand out paid access.
          entitled: body.entitled === true,
          hasBillingAccount: body.hasBillingAccount === true,
        } satisfies AccountState;
      } catch {
        return null;
      }
    },

    async startCheckout() {
      return billingCall("/billing/checkout");
    },

    async manageSubscription() {
      return billingCall("/billing/portal");
    },
  };

  async function billingCall(path: string): Promise<{ url: string } | { error: string }> {
    if (!configured) {
      return { error: "This build has no billing service configured." };
    }

    try {
      const reply = await call(path, {});

      if (reply == null) {
        return { error: "Sign in before changing your plan." };
      }

      if (reply.status === 200 && typeof reply.body.url === "string") {
        return { url: reply.body.url };
      }

      return {
        error:
          typeof reply.body.error === "string"
            ? reply.body.error
            : `The billing service replied with ${reply.status}.`,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
