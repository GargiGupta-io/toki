import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const sqlDirectory = path.resolve(scriptsDirectory, "..", "apps", "api", "sql");
const schema = readFileSync(path.join(sqlDirectory, "001_schema.sql"), "utf8");
const rls = readFileSync(path.join(sqlDirectory, "002_rls.sql"), "utf8");
const envExample = readFileSync(
  path.resolve(scriptsDirectory, "..", "apps", "api", ".env.example"),
  "utf8",
);

test("every table has row-level security enabled", () => {
  // The anon key is public by design and ships inside the desktop app, so the
  // database is the boundary. A table left without this is readable by anyone
  // who signs in, for every other customer's rows.
  const tables = [...schema.matchAll(/create table if not exists public\.(\w+)/gu)]
    .map((match) => match[1]);

  assert.ok(tables.length >= 3, "expected profiles, subscriptions, webhook_events");
  for (const table of tables) {
    assert.match(
      rls,
      new RegExp(`alter table public\\.${table} enable row level security`, "u"),
      `${table} must have row-level security enabled`,
    );
  }
});

test("a client can never write its own subscription tier", () => {
  // A select policy is fine; an insert or update policy would let a client set
  // its own tier to whatever it liked. Rows are written only by the trigger and
  // the webhook handler, both running with the service role.
  const subscriptionPolicies = [
    ...rls.matchAll(/create policy "[^"]+"\s+on public\.subscriptions for (\w+)/gu),
  ].map((match) => match[1]);

  assert.deepEqual(
    subscriptionPolicies,
    ["select"],
    "subscriptions must be read-only to clients",
  );
});

test("policies scope every row to its owner", () => {
  // Capture to the statement's closing bracket, not the first one — auth.uid()
  // contains brackets of its own.
  for (const match of rls.matchAll(
    /create policy "([^"]+)"[\s\S]*?using \(([\s\S]*?)\)\s*(?:with check|;)/gu,
  )) {
    assert.match(
      match[2],
      /auth\.uid\(\)/u,
      `policy "${match[1]}" must compare against auth.uid()`,
    );
  }
});

test("a new account gets a working free tier", () => {
  // Without a row, every gated check has to special-case null, and an unpaid
  // user is a broken user rather than a limited one.
  assert.match(schema, /create trigger on_auth_user_created/u);
  assert.match(schema, /insert into public\.subscriptions[\s\S]*?'free'/u);
});

test("duplicate webhook deliveries cannot be processed twice", () => {
  // Stripe retries, and will send the same event more than once.
  assert.match(schema, /create table if not exists public\.webhook_events/u);
  assert.match(schema, /id text primary key/u);
});

test("cancelling honours the period already paid for", () => {
  assert.match(schema, /current_period_end/u);
});

test("the example environment file carries names but never values", () => {
  const assignments = envExample
    .split("\n")
    .filter((line) => /^[A-Z_]+=/u.test(line))
    .filter((line) => !/^[A-Z_]+=$/u.test(line));

  // A default like a base URL or a port is fine. A credential is not.
  for (const line of assignments) {
    assert.doesNotMatch(
      line,
      /=(sk_|pk_|eyJ|whsec_)/u,
      `.env.example must not contain a real credential: ${line.split("=")[0]}`,
    );
  }

  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]) {
    assert.match(
      envExample,
      new RegExp(`^${name}=$`, "mu"),
      `${name} must be present and empty`,
    );
  }
});
