# Toki API

The service the desktop app talks to for guidance and speech. It exists so that
users pay Toki rather than pasting their own model credentials, and so the cost
of running a model is something Toki controls.

It runs today with no credentials and no deployment, returning placeholder
responses, so the desktop client can be integrated and exercised before any
credits are bought.

## Running it

```
npm run api:dev
```

Then check what mode it is in:

```
curl http://127.0.0.1:8787/health
```

To exercise the authenticated path locally, set a development licence key.
Nothing is accepted unless you do:

```
TOKI_DEV_LICENCE_KEYS=dev-key-123 npm run api:dev
curl -X POST http://127.0.0.1:8787/guidance \
  -H "Authorization: Bearer dev-key-123" \
  -d '{"goal":"Open settings","screen":{}}'
```

## Fixture mode

With no `TOKI_PROVIDER_API_KEY`, the service runs in **fixture mode**: it
answers with correctly shaped placeholders that say so in the response body, on
`/health`, and at startup.

The mode is derived from whether a credential exists rather than from a separate
switch, because a flag that can disagree with the credentials is a way to ship
something that claims to be live and cannot be.

Fixture guidance never carries a target. A placeholder that pointed somewhere
would send users clicking arbitrary coordinates on their own screen.

## Configuration

| Variable | Meaning |
|---|---|
| `TOKI_PROVIDER_API_KEY` | Model provider credential — a Gemini key, free at aistudio.google.com/apikey. Setting it switches the service to live mode. |
| `TOKI_PROVIDER_BASE_URL` | Provider endpoint. Defaults to Gemini. Change only together with the model: the request shape follows the model name. |
| `TOKI_GUIDANCE_MODEL` | Vision model for guidance. Defaults to `gemini-3.5-flash-lite`, chosen by measurement — see config.ts. |
| `TOKI_TRANSCRIPTION_MODEL` | Speech-to-text model. |
| `TOKI_DEV_LICENCE_KEYS` | Comma-separated keys the stub store accepts. Development only. |
| `TOKI_REQUESTS_PER_MINUTE` | Per-licence rate limit. Defaults to 20. |
| `TOKI_MAX_REQUEST_BYTES` | Body limit. Defaults to 12 MB. |
| `PORT` | Defaults to 8787. |

## What still has to be built

Three things need decisions or purchases that have not been made:

1. **Real model calls.** `HandlerDependencies` takes `requestGuidance` and
   `transcribe`. Implement them against the provider and pass them in; the
   handler already routes to them whenever a credential is present.
2. **Real licence issuance.** `LicenceStore` is one method. Back it with a
   database, or a webhook from a merchant of record such as Lemon Squeezy or
   Paddle so that sales tax and VAT are not yours to handle.
3. **Deployment.** No host is chosen. `handler.ts` is a plain function from
   request to response and touches no Node APIs, so a different adapter is all
   that a serverless function or an edge worker needs. `server.ts` is the Node
   one.

## Constraints worth keeping

**Request bodies are large.** Guidance carries a base64 screenshot and speech
carries base64 audio, several megabytes each. Some serverless hosts cap request
bodies well below that, and vision calls can be slow enough to hit execution
time limits. Check both before committing to a host.

**Bodies are private.** They contain pictures of the user's screen and
recordings of their voice. Nothing logs a body, echoes one back, or persists
one, and provider error text is not relayed to the client because it can quote
the request. Whatever host is chosen must not log request bodies either.

**Rate limiting is in memory.** Correct for one instance, wrong for two: each
would allow the full quota. `RateLimiter` is the seam to back it with something
shared once more than one instance runs.

**The desktop app cannot reach this yet.** Its content security policy permits
no remote origin. When this service has an address, add it to `connect-src` in
`apps/desktop/src-tauri/tauri.conf.json`.
