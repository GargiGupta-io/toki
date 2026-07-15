# Command and Test Ledger

## Ledger Limits

This ledger uses repository scripts, terminal output recorded in the conversation, and tracked phase documentation. It was updated after the 2026-07-15 repair verification.

- Exact full command history: `UNKNOWN`.
- Exact last successful app-bundle source: the repair source later committed through `de7d2b6`, as described in `FILE_CHANGE_MANIFEST.md`.
- Current automated result: all listed repair, typecheck, compile, visual-motion, browser-extension, smoke, and deterministic known-screen gates pass.
- Installed main-app source state: the repair source later committed through `de7d2b6`; the bundle does not embed a commit identifier.

## 2026-07-15 Repair Verification

No command in this section manually controlled Toki or issued a guidance request. The latest installation step replaced and launched the app for user-owned acceptance.

| Command | Result |
| --- | --- |
| `npm run typecheck` | `PASS` |
| `npm run rust:check` | `PASS` |
| `npm run test:vision-provider` | `PASS` — 8 tests |
| `npm run test:voice-hold` | `PASS` — 3 tests |
| `npm run test:capture-access` | `PASS` — 2 tests |
| `npm run test:puck-motion` | `PASS` — 4 tests |
| `npm run test:target-cue` | `PASS` — 4 tests |
| `npm run test:target-verification` | `PASS` — 23 tests |
| `npm run test:command-corpus` | `PASS` — 3 tests and 120 unique manual cases |
| `npm run test:guidance-planning` | `PASS` — 6 tests |
| `npm run test:guidance:smoke` | `PASS` — 40 tests |
| `npm run test:coordinates` | `PASS` |
| `npm run test:provider-image` | `PASS` |
| `npm run test:candidate-fusion` | `PASS` |
| `npm run test:candidate-intent` | `PASS` — 9 tests |
| `npm run qa:visual:motion` | `PASS` |
| `npm run browser-extension:check` | `PASS` |
| `npm run qa:browser:known-screen` | `PASS` — 4 command/target cases plus candidate count |
| `npm run qa:fallback:known-screen` | `PASS` — 3 OCR/accessibility cases |
| `npm run qa:workflow:known-screen` | `PASS` |
| `npm run qa:eval:known-screen` | `PASS` — 2/2 fixtures |
| `npm --workspace @toki/ai test` | `PASS` — 33 tests |
| `cargo test -p toki-desktop` | `PASS` — 5 tests |
| `cargo fmt --all -- --check` | `PASS` |
| `npm run desktop:web:build` | `PASS` — production frontend build |
| `npm run guidance:provider:check` | `PASS` — Codex CLI `0.144.4`, subscription authentication ready |
| `cargo fmt --all` | `PASS` |
| `git diff --check` | `PASS` |
| Repository case-insensitive retired-runtime text audit, excluding generated/dependency/Git paths | `PASS` — no matches |
| `npm --workspace @toki/desktop run tauri build -- --bundles app` | `PASS` — production executable and `Toki.app` generated |
| `npm run desktop:sign:mac` | `PASS` — local ad-hoc signature and strict verification |
| Replacement and launch of `/Applications/Toki.app` | `PASS` — old bundle removed, new bundle installed, re-signed, and launched |
| Combined provider/verification/intent/hold/coordinate/image/fusion/planning run | `PASS` — 64/64 tests |
| Optional `npm run guidance:known-screen` image run | `NOT RUN` — `TOKI_KNOWN_SCREEN_IMAGE` was not configured |
| Installed/build executable SHA-256 comparison | `PASS` — latest corrected copies both `9289d3a776516c88c25ca0d9352d9cb1e6682912832ae615d7ca2522b2a4baf9` |

The final pre-gesture checkpoint run passed 155 automated tests across TypeScript/Node and Rust, plus all listed compile, formatting, fixture, browser-extension, visual-motion, and production web-build gates. Manual Toki commands remain user-owned and were not issued by Codex.

The general `npm run desktop:build` compiled the frontend, Rust release binary, and `Toki.app`, then failed only in the optional DMG presentation wrapper. The explicit app-only bundle command passed. The initial unsigned-bundle strict verification failed, then the repository signing step repaired it; strict verification passes for both the built and installed app. This remains an ad-hoc local signature, not a Developer ID/notarized distribution claim.

### Right Option Installed-App Repair

- User reproduction: newly installed app did nothing when Right Option was held.
- TCC evidence: `kTCCServiceListenEvent` returned `authValue=0`; Microphone and Screen Recording logs reported code-requirement hash mismatches.
- Root cause: the ad-hoc signed replacement had a new code identity, while the key monitor only preflighted access and silently polled a denied source.
- Repair: combine the right-side device flag and right-side key state; reject left/generic Option; request Input Monitoring only when missing; log native press/release delivery.
- Verification: `cargo test -p toki-desktop` passed 4/4 including two detector cases; TypeScript and 3/3 hold-state tests passed; app-only release rebuild and strict signature verification passed.
- Installation: corrected `/Applications/Toki.app` installed without launch; Toki-only TCC approvals reset successfully.
- Corrected signed executable SHA-256: `219e2db67fbff8df0fe4b17abe851e4abcb6c6c9769ea1abe439d2d19aed6c7d`; built and installed copies match.

### Current-Image Grounding Repair

- User reproduction: Right Option reached the provider, but guidance over a visible Spotify control was refused at 12% confidence.
- Root cause: the vision prompt required a coordinate-only target to be backed by a current OCR/Accessibility/DOM/manual candidate. Icon-heavy apps can expose no exact structured candidate, so the model followed the prompt and lowered confidence.
- Repair: make the current screenshot primary evidence, prefer exact structured candidate IDs when present, and permit a candidate-free target only with a current localization trace, specific non-generic label, at least 72% confidence, valid geometry, and action/object semantic agreement.
- Regression coverage: strong current-image-only target passes; low-confidence, generic-label, and Pause-vs-Next semantic mismatch cases fail. `npm run test:target-verification` passes 16/16 and `npm run test:vision-provider` passes 6/6.
- Broader verification: workspace typecheck, 4/4 native tests, 3/3 hold-state tests, visual-motion QA, workflow/eval/fallback known-screen checks, coordinate/provider-image/fusion suites, and the 40-test guidance smoke suite pass.
- Installation: latest `/Applications/Toki.app` replaced without launch; strict ad-hoc signature verification passes; Toki-only TCC approvals reset for the new identity.
- Latest signed executable SHA-256: `4d6dab06bedc27cdb19a0da5738b420a058c71bbe5d319f73015b6a35b470b95`; built and installed copies match.

### Combined-Evidence Spotify Repair

- User reproduction: “How to make a playlist on Spotify?” returned candidate `ocr-candidate-13`, label `Create playlist (+) button`, confidence `0.98`, and the correct visual reason, but verification rejected object `collection`.
- Root cause: candidate-backed verification evaluated only the OCR candidate text `+`, which supplied action `create` but no object. The same provider answer passed when its candidate ID was removed, proving an inconsistent evidence path.
- Repair: retain exact structured candidate ID/source/geometry and augment only missing semantics from the provider label/reason when the candidate is generic or symbolic, confidence is at least 72%, the current-image trace exists, and structured evidence has no explicit action/object conflict.
- Regression coverage: exact Spotify reproduction passes; explicit semantic conflict, 71.9% confidence, and missing-image-trace controls fail; exactly 72% passes. `npm run test:target-verification` passes 20/20.
- Broader verification: workspace typecheck, 4/4 native tests, provider/intent/planning/voice suites, coordinate/provider-image/fusion suites, 40 guidance smoke tests, visual-motion QA, and fallback/workflow/eval known-screen checks pass.
- Installation: latest `/Applications/Toki.app` replaced without launch; strict ad-hoc signature verification passes; Toki-only TCC approvals reset for the new identity.
- Latest signed executable SHA-256: `73275686ba0d6e1e48c58b2586dd11b98f06f755ce07899b2e659afaba12a533`; built and installed copies match.

### Read-Only Media-History Semantic Repair

- User reproduction: “How to see the recently played songs.” returned a current-image `Recently played tab`, confidence `0.99`, visible-evidence reason, and mapped rectangle, but verification reported `command-action-unrecognized` and `semantic-object-missing:media`.
- Root cause: `see` was absent from the read-only navigation action family, while target text such as `Recently played tab` supplied neither the `open` action nor the `media` object.
- Repair: normalize `see` with `open/view/show`; infer read-only navigation from UI nouns such as `tab`, `page`, and `panel`; infer media only from specific phrases such as `recently played`, `listening history`, and `playback history`.
- Negative controls: `Recent profiles tab` is rejected for the media command, and `Recently played tab` cannot satisfy the playback action `next`.
- Verification: target verification passes 22/22, candidate intent passes 9/9, and the complete typecheck/native/provider/planning/voice/coordinate/image/fusion/smoke/visual/known-screen matrix passes.
- Installation: TCC approvals reset; latest `/Applications/Toki.app` replaced, strictly verified, and launched as PID `68243` for user-owned testing.
- Latest signed executable SHA-256: `059d4f87eab649a3a3015b0114b2fda6f41d7beb8786c1bdd01ea08a5f495f59`; built and installed copies match.

### Warning And Target-Reveal Safety Repair

- User reproduction: “How to invite collaborators on this playlist?” returned the correct person-plus control at 96% with `permission_change`, but the provider response was rejected as an invalid target.
- Root cause: provider normalization always emitted `requiresConfirmation: false`, while schema validation required every account/permission target to set it true. The result failed before semantic verification or rendering.
- Repair: share one risk-normalization helper across provider and local-candidate paths. Account and permission changes are warning-only and show their target immediately; external send, delete, payment, security, and unknown-risk guidance require user-controlled target reveal.
- UI behavior: `Show target` appears in the focused top utility for strong-risk guidance. Before the click, the accepted target is retained for Debug but excluded from overlay/ring state. The click only toggles local reveal state; it cannot click or change the underlying app.
- Regression coverage: focused AI/provider policy passes 41/41; target verification/render gating passes 23/23; the combined interaction matrix passes 64/64; visual-motion QA checks the gate and no-execution boundary.
- Broader verification: all workspace TypeScript checks, Rust workspace check, 40 guidance smoke tests, browser-extension checks, and browser/fallback/workflow/eval known-screen fixtures pass. The optional image-driven known-screen command reported missing `TOKI_KNOWN_SCREEN_IMAGE` and was not counted as a failure.
- Installation: Toki-only TCC approvals reset; `/Applications/Toki.app` replaced, strictly verified, and launched; the installed process was observed running as PID `72997` at final verification.
- Latest signed executable SHA-256: `70048e37b6af5176e43b5d6e6c91bea1dfdc00e325b9afe7ba5a392caea615bf`; built and installed copies match.

## Repository and Status Commands

| Command | Last known result |
| --- | --- |
| `git -C "/Users/pumba/Documents/ Codex Projects/clicky" status --short --branch` | Before migration docs: `## main...origin/main` plus `?? touchpilot/learnings/` |
| `git -C "/Users/pumba/Documents/ Codex Projects/clicky" rev-parse HEAD` | `d4234bf00104ad973e694fc3564cf98a21a12f30` |
| `git -C "/Users/pumba/Documents/ Codex Projects/clicky" log -1 --format=%s` | `test: cover retired local vision runtime context and errors` |

## Development and Build Commands

Run these from `/Users/pumba/Documents/ Codex Projects/clicky/touchpilot` unless stated otherwise.

| Command | Purpose | Last exact result |
| --- | --- | --- |
| `npm run desktop:dev` | Launch live Tauri/Vite dev app | Historically launched; current result `UNKNOWN` |
| `npm run desktop:build` | Desktop workspace build path including DMG | App compilation/bundle passed; optional DMG wrapper failed in current environment |
| `npm --workspace @toki/desktop run tauri build -- --bundles app` | App-only production bundle | Passed on 2026-07-15 |
| `npm run desktop:release:mac` | Build macOS release app | Historically used; last successful commit `UNKNOWN` |
| `npm run desktop:sign:mac` | Sign macOS app | Passed on 2026-07-15 |
| `npm run desktop:install:mac` | Install macOS main app | Latest equivalent install completed and launched the signed installed app |
| `npm run desktop:release:exe` | Windows no-bundle release executable | Historically completed after long Rust link; current result `UNKNOWN` |
| `npm run desktop:build:windows` or full Tauri packaging script, if present | Windows installers | Historically succeeded with `CARGO_BUILD_JOBS=1`; exact latest result `UNKNOWN` |

## Typecheck and Compile Commands

### Recorded Successful Results

The user supplied successful terminal output for:

```bash
npm --workspace @touchpilot/shared run typecheck
```

Result recorded: TypeScript completed without errors.

After rename, the current workspace package is `@toki/shared`; the root `npm run typecheck` command passes for the pre-gesture repair checkpoint.

```bash
npm --workspace @touchpilot/desktop run typecheck
```

Result recorded historically: `tsc --noEmit` completed without errors.

After rename, the current workspace package is `@toki/desktop`; use the root scripts rather than stale package names.

```bash
cargo check --workspace
```

Recorded successful examples include completion in `9.30s`, `34.62s`, `50.73s`, and `1m 15s` on different dependency states. The pre-gesture repair checkpoint passes through `npm run rust:check`.

```bash
npm --workspace @touchpilot/desktop run build
```

Recorded successful historical result:

```text
vite v7.3.3 building client environment for production...
43 modules transformed.
dist/index.html                   0.49 kB
dist/assets/index-DPAxpqaE.css   20.39 kB
dist/assets/index-C3cmKU4W.js   370.32 kB
built in 4.18s
```

This output predates later changes and the rename. It is not proof for HEAD.

## Current Root Test Scripts

The following scripts are important to the current accuracy work:

```bash
npm run typecheck
npm run rust:check
npm run test:coordinates
npm run test:provider-image
npm run test:candidate-fusion
npm run test:candidate-intent
npm run test:guidance-planning
npm run test:vision-provider
npm run test:voice-hold
npm run test:target-verification
npm run qa:eval:known-screen
```

The pre-gesture repair checkpoint adds or modifies tests for the provider contract, hold-to-talk state, target verification, candidate fusion, candidate intent, guidance planning, provider images, coordinate transforms, overlay render gating, capture integrity, cue geometry, liquid motion, and the command corpus. Current results are recorded above.

## Runtime QA Commands

### Windows

```powershell
npm run qa:windows:runtime
npm run qa:windows:visual
```

Last recorded successful runtime result:

- Overlay exists and is fullscreen.
- Overlay title is blank.
- No caption/system menu/thick frame.
- Click-through and layered styles present.
- Not a taskbar app.
- Settings window title blank, no caption, tool-window behavior.
- Overlay hit-test passes through.

Last recorded visual result:

- Screenshot captured.
- No visible Toki/TouchPilot title text.
- No settings/debug panel by default.
- OCR check skipped because Tesseract was not installed; manual review was required.

These results predate current HEAD and do not prove current Windows behavior.

### macOS

```bash
npm run qa:mac:runtime
npm run qa:mac:transcribe
npm run qa:visual:motion
npm run qa:visual:manual
```

Recorded local Whisper probe result:

```text
[PASS] microphone captured
[PASS] transcription - model=local-whisper:.../ggml-base.en.bin
Transcript: Show me what to click.
```

Exact model path must not be treated as portable configuration.

## Provider and Transcription Results

### OpenAI Transcription Probe

Recorded failure:

```text
429 Too Many Requests
type: insufficient_quota
code: insufficient_quota
```

Decision: local Whisper is the current free/offline transcription path. Do not embed paid provider keys in the desktop app.

### Local Whisper

Recorded success: microphone capture and transcription worked on macOS.

### Vision Provider

Repository evidence:

- Provider-neutral structured response contract added.
- Codex subscription adapter added for local development without API credits.
- Candidate ID resolution, raw provider output, original rectangle, evidence, and rejection details are preserved through the downstream contract.
- The current project has no source/configuration/test/documentation dependency on the retired local runtime.

Runtime semantic accuracy remains `UNKNOWN` pending user-owned manual acceptance. Last pre-repair observations included generic or wrong targets.

## Historical Errors and Resolution State

| Error | Meaning | State |
| --- | --- | --- |
| PowerShell `Cannot overwrite variable PID` | QA callback used reserved PowerShell variable | Fixed historically |
| PowerShell `Unable to find type [StringBuilder]` | Missing fully qualified/imported type in QA script | Fixed historically |
| `MSCTFIME UI` detected as settings | QA selected a zero-sized Windows helper window | Fixed historically by filtering helper windows |
| Overlay title `TouchPilot Overlay` | Stale executable/native title issue | Fresh build later passed QA |
| Rust CPAL stream not `Send` in Tauri state | Native audio stream stored in incompatible shared state | Fixed historically |
| OpenAI transcription `429 insufficient_quota` | No paid quota | Unresolved by design; local Whisper used |
| macOS Screen Recording repeatedly reported untrusted | Bundle identity/permission/runtime mismatch or preflight issue | Historical recurring risk; current state `UNKNOWN` |
| `No high-confidence local target was found` | Candidate/localization failure | Product-level accuracy still in progress |
| Generic/wrong target such as `Vision target` or same `plus icon` | Semantic grounding failure | Current known product risk |
| Target box offset by pixels | Coordinate/crop mapping or box-refinement issue | Contracts/tests added; runtime acceptance `UNKNOWN` |
| `Vision confidence was too low (12%)` on a visible icon control | Prompt incorrectly made structured candidates mandatory even when the current screenshot was visually clear | Current-image grounding prompt/verifier repaired and regression-tested; installed live acceptance `UNKNOWN` |
| Correct 98% `Create playlist (+) button` rejected as missing object `collection` | Candidate-backed verification discarded provider semantics and evaluated only OCR symbol `+` | Guarded combined-evidence augmentation added and regression-tested; installed live acceptance `UNKNOWN` |
| Correct 99% `Recently played tab` rejected for unknown action/missing media | Intent vocabulary did not map `see` to read-only navigation or contextual media-history target text | General contextual semantics added and regression-tested; installed live acceptance `UNKNOWN` |

## Last Known Successful Build

- The production frontend, Rust executable, and app-only macOS bundle passed on 2026-07-15.
- Artifact: `touchpilot/target/release/bundle/macos/Toki.app`.
- Current corrected signed executable SHA-256: `70048e37b6af5176e43b5d6e6c91bea1dfdc00e325b9afe7ba5a392caea615bf`; installed and built copies match.
- The artifact was built before the checkpoint commits from source later committed through `de7d2b6`; it does not embed that commit identifier.
- Historical Windows release artifacts were produced.
- Historical macOS builds were installed and manually tested.
- Do not claim the installed app represents HEAD without recording its build commit.

## Current Failing Tests or Errors

- Automated failing tests in the executed repair matrix: none.
- Compile/typecheck errors in the executed repair matrix: none.
- Packaging limitation: the all-bundles command failed in the optional DMG wrapper. App-only bundling and strict local ad-hoc signature verification pass; Developer ID signing/notarization remain future release work.
- Current product-level status: pre-repair wrong/generic targeting, latency, and voice failures have not yet been manually accepted after the repair.
- Current permission/fullscreen behavior: `UNKNOWN` until installed-app acceptance testing.

## Commands That Should Not Be Repeated Blindly

1. Do not repeat a failed command unchanged. Read the failure and switch to the next appropriate method or report the blocker.
2. Do not run `npm run desktop:release:exe` for routine UI checks. Windows Rust linking historically appeared stuck around `531/533` for a long time.
3. Do not run full installer packaging for routine frontend iteration.
4. Do not use `npm run desktop:dev` results as proof of the installed/main app.
5. Do not reinstall/rebuild the main app until the exact source commit and intended artifact are recorded.
6. Do not repeatedly trigger macOS permission prompts. Check bundle identity, installed path, process identity, and preflight state first.
7. Do not run obsolete `@touchpilot/*` workspace commands without checking current package names after the Toki rename.
8. Do not launch multiple dev/main Toki processes simultaneously during runtime QA.
9. Do not run destructive Git or artifact-cleanup commands without explicit approval.
10. Do not treat automated checks as proof of live targeting. Codex may rebuild, install, and launch Toki, but only the user runs the manual commands and judges acceptance.

## 2026-07-15 Living-Visual Repair Run

| Command/check | Result |
| --- | --- |
| `npm run qa:visual:motion` | PASS — 15/15 assertions, including autonomous liquid motion and accepted-target-only droplet travel |
| `npm run test:puck-motion` | PASS — 4/4 safety/state cases |
| `npm run desktop:typecheck` | PASS |
| `npm run typecheck` | PASS — all workspaces |
| `npm run rust:check` | PASS |
| `npm run test:target-verification` | PASS — 23/23 |
| `npm run desktop:web:build` | PASS |
| `git diff --check` | PASS |
| `npm run desktop:release:mac` | PASS — app-only Tauri release built and ad-hoc signature verified |
| `npm run desktop:install:mac` | PASS — previous installed app stopped/replaced, installed signature verified, launch requested |
| Built vs installed executable SHA-256 | MATCH — `ca4809d7f063a6e53b67412e52964e635089fc9ba9026c8b76cad62455415286` |
| Initial post-install process check | No Toki process remained; `pgrep` was unavailable in the sandbox and escalated `ps aux` confirmed absence |
| `open -na /Applications/Toki.app` plus process verification | PASS — installed process observed as PID `84279` |

No real guidance command was issued. Live appearance and interaction acceptance remain user-owned.

## 2026-07-15 Capture-Integrity and Target-Cue Repair Run

| Command/check | Result |
| --- | --- |
| `npm run desktop:typecheck` | PASS |
| `npm run test:capture-access` | PASS — 2/2 |
| `npm run test:target-cue` | PASS — 4/4 |
| `npm run qa:visual:motion` | PASS — 17/17 |
| `cargo test -p toki-desktop` | PASS — 5/5 |
| `git diff --check` | PASS |
| `npm run typecheck` | PASS — all workspaces |
| `npm run rust:check` | PASS |
| `npm run test:target-verification` | PASS — 23/23 |
| `npm run desktop:web:build` | PASS |
| `npm run desktop:release:mac` | PASS — release app built and strict ad-hoc signature verification passed |
| `npm run desktop:install:mac` | PASS — `/Applications/Toki.app` replaced and verified |
| Built vs installed executable SHA-256 | MATCH — `9289d3a776516c88c25ca0d9352d9cb1e6682912832ae615d7ca2522b2a4baf9` |
| Installed process check | PASS — `/Applications/Toki.app/Contents/MacOS/toki-desktop` observed as PID `90673` |

No real guidance command was issued. Screen Recording authorization and live cue judgment remain user-owned. No commit or push was made.
