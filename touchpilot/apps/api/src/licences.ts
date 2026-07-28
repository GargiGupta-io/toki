/**
 * Licence checking.
 *
 * A purchase issues a licence key; every request carries it; the service
 * refuses anything it does not recognise. That refusal is the only thing
 * standing between a public endpoint and an unbounded model bill, so the
 * enforcement path is written as real logic now, against a store that is
 * stubbed until there is a payment provider to fill it.
 *
 * Swapping the stub for a real store — a database, or a webhook from a
 * merchant of record such as Lemon Squeezy or Paddle — should mean
 * implementing LicenceStore and nothing else.
 */

export type Licence = {
  key: string;
  /** ISO date, or null for a licence that does not expire. */
  expiresAt: string | null;
  revoked: boolean;
};

export type LicenceCheck =
  | { valid: true; licence: Licence }
  | { valid: false; reason: LicenceRejection };

export type LicenceRejection = "missing" | "unknown" | "expired" | "revoked";

export type LicenceStore = {
  find(key: string): Promise<Licence | null>;
};

export const licenceRejectionMessages: Record<LicenceRejection, string> = {
  missing: "A licence key is required.",
  unknown: "That licence key was not recognised.",
  expired: "That licence has expired.",
  revoked: "That licence has been revoked.",
};

/**
 * Placeholder store, replaced once purchases exist.
 *
 * Seeded only from TOKI_DEV_LICENCE_KEYS so that a development key has to be
 * chosen deliberately. Defaulting to accepting anything would mean the day the
 * service is deployed with a real credential and no store yet, it would happily
 * serve the whole internet.
 */
export function createStubLicenceStore(
  env: Record<string, string | undefined> = process.env,
): LicenceStore {
  const seeded = (env.TOKI_DEV_LICENCE_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  const licences = new Map<string, Licence>(
    seeded.map((key) => [key, { key, expiresAt: null, revoked: false }]),
  );

  return {
    async find(key) {
      return licences.get(key) ?? null;
    },
  };
}

export async function checkLicence(
  key: string | null | undefined,
  store: LicenceStore,
  now: Date = new Date(),
): Promise<LicenceCheck> {
  const trimmed = key?.trim();

  if (trimmed == null || trimmed.length === 0) {
    return { valid: false, reason: "missing" };
  }

  const licence = await store.find(trimmed);

  if (licence == null) {
    return { valid: false, reason: "unknown" };
  }

  // Revocation is checked before expiry so a refunded or charged-back licence
  // reports the honest reason rather than aging into "expired".
  if (licence.revoked) {
    return { valid: false, reason: "revoked" };
  }

  if (licence.expiresAt != null && new Date(licence.expiresAt) <= now) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, licence };
}

/**
 * Read the licence from a request.
 *
 * A bearer token rather than a query parameter: query strings end up in access
 * logs, browser history, and proxy logs, and a licence key is a credential.
 */
export function readLicenceKey(
  headers: Record<string, string | undefined>,
): string | null {
  const authorization = headers.authorization ?? headers.Authorization;

  if (authorization == null) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/iu.exec(authorization.trim());
  return match?.[1]?.trim() ?? null;
}
