import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const dockerfile = read("apps/api/Dockerfile");
const flyConfig = read("apps/api/fly.toml");
const envExample = read("apps/api/.env.example");

/**
 * Shapes that only real credentials have. A test key is still a credential, and
 * `sk_test_` in a committed file is still a leak.
 */
const credentialPatterns = [
  /\bsk_(test|live)_[A-Za-z0-9]{8,}/,
  /\bwhsec_[A-Za-z0-9]{8,}/,
  /\bsk-ant-[A-Za-z0-9-]{8,}/,
  /\bprice_[A-Za-z0-9]{10,}/,
  // A JWT: three base64 segments. Supabase keys and access tokens both match.
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

test("no committed deployment file carries a credential", () => {
  // The failure this prevents is not subtle and not recoverable: a secret in a
  // public repository is in the history for good, and rotating it is the only
  // real fix.
  for (const file of [
    "apps/api/Dockerfile",
    "apps/api/fly.toml",
    "apps/api/.env.example",
  ]) {
    const contents = read(file);
    for (const pattern of credentialPatterns) {
      assert.doesNotMatch(
        contents,
        pattern,
        `${file} appears to contain a real credential`,
      );
    }
  }
});

/**
 * Settings whose names say they hold a credential.
 *
 * The rule is not "every value must be blank" — a model name and a default URL
 * are useful defaults and are not secrets. The rule is that anything named like
 * a secret must be blank, because a real value beside one of these names is a
 * leak whatever shape it happens to have.
 */
function namesACredential(name) {
  return /(KEY|SECRET|TOKEN|PASSWORD)$/.test(name);
}

test("the environment example names every setting without holding a secret", () => {
  for (const line of envExample.split("\n")) {
    if (line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const [name, ...rest] = line.split("=");
    const value = rest.join("=").trim();

    if (namesACredential(name)) {
      assert.equal(
        value,
        "",
        `${name} has a value in .env.example; a credential must never be committed`,
      );
      continue;
    }

    for (const pattern of credentialPatterns) {
      assert.doesNotMatch(value, pattern, `${name} looks like a credential`);
    }
  }

  for (const required of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
  ]) {
    assert.match(envExample, new RegExp(`^${required}=`, "m"), `${required} is undocumented`);
  }
});

test("the deployed service refuses plain http", () => {
  // Every request carries a bearer token, and guidance requests carry a picture
  // of the user's screen.
  assert.match(flyConfig, /force_https\s*=\s*true/);
});

test("the health check points at an endpoint that needs no credentials", () => {
  // A health check against an authenticated path fails for the wrong reason and
  // takes the service down during a deploy.
  const match = flyConfig.match(/path\s*=\s*"([^"]+)"/);
  assert.ok(match, "no health check path configured");
  assert.equal(match[1], "/health");

  const handler = read("apps/api/src/handler.ts");
  const healthIndex = handler.indexOf('request.path === "/health"');
  const authIndex = handler.indexOf("identifyCaller(request");
  assert.ok(healthIndex > 0 && authIndex > 0);
  assert.ok(
    healthIndex < authIndex,
    "health is answered before authentication, or the check can never pass",
  );
});

test("the base image is pinned by digest", () => {
  // A tag is a moving pointer: the same Dockerfile built next month would
  // produce a different image, and the change would appear in no diff.
  const froms = dockerfile.match(/^FROM .+$/gm) ?? [];
  assert.ok(froms.length > 0, "no base image");
  for (const line of froms) {
    assert.match(line, /@sha256:[0-9a-f]{64}/, `${line} is not pinned`);
  }
});

test("the image ships no development tooling and does not run as root", () => {
  assert.match(dockerfile, /--omit=dev/, "test tooling must not ship");
  assert.match(dockerfile, /^USER node$/m, "the service has no reason to be root");
  assert.match(dockerfile, /--ignore-scripts/, "install hooks must not run");
});

test("every SQL migration is numbered and ordered", () => {
  // They are applied by hand, so the order has to be readable from the names.
  const files = readdirSync(path.join(root, "apps/api/sql")).sort();
  assert.ok(files.length >= 3);
  files.forEach((file, index) => {
    assert.match(file, /^\d{3}_[a-z_]+\.sql$/, `${file} is not numbered`);
    assert.equal(
      Number(file.slice(0, 3)),
      index + 1,
      `migration numbering has a gap at ${file}`,
    );
  });
});
