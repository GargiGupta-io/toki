# Toki Gesture Experience Manual Acceptance

Use this checklist only with the installed production app. Codex runs the deterministic gates, build, installation, signature checks, and process checks; the user performs every live camera, voice, gesture, and visual judgment.

## Build Under Test

- App: `/Applications/Toki.app`
- Executable SHA-256: `f7dbda8ecb5be43cc5a033cc8ad039c8d8b9699696118b51825193a38c5d527c`
- Expected process: exactly one `/Applications/Toki.app/Contents/MacOS/toki-desktop`
- Do not run the Vite/Tauri development app at the same time.

## Before Starting

1. Open Toki's top utility and select `Controls`.
2. Confirm macOS Camera, Microphone, Accessibility, and Input Monitoring permissions for this installed Toki identity if prompted. If Screen Recording is missing, the first real guidance/capture request should invoke the native macOS permission flow; approve it and relaunch Toki once if macOS asks.
3. Keep one ordinary app visible for the gesture tests. Use a screen with several distinct controls for guidance tests.
4. Record `PASS`, `FAIL`, or `NOT RUN` for every numbered case. Do not silently retry a failure before preserving its first Debug evidence.

## A. Combined Camera Lifecycle

| ID | Action | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| CAM-01 | Turn on `Camera + Gestures` in the top Controls tab. | One switch starts both camera and gestures. Status progresses through Starting to Active; Toki stays open. | NOT RUN | |
| CAM-02 | Turn the combined switch off. | Camera and gesture processing both stop. No stale hand or blob remains. | NOT RUN | |
| CAM-03 | With the capability off, say an explicit command such as “Turn on the camera.” | Camera and gestures turn on locally. No visual-guidance provider request or target ring appears. | NOT RUN | |
| CAM-04 | Try a negated or unrelated phrase such as “Do not turn on the camera.” | The local camera-on route does not activate. | NOT RUN | |
| CAM-05 | With tracking active, hold two closed fists for two seconds. | Camera and gestures turn off exactly once. | NOT RUN | |
| CAM-06 | Try one fist, point, open palm, and pinch separately. | None of these turns the camera off. | NOT RUN | |

## B. Pointer Feel and Hand Recovery

| ID | Action | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| PTR-01 | Point with one index finger and make small movements. | Toki follows calmly without high-DPI twitching or reduced-camera-range amplification. | NOT RUN | |
| PTR-02 | Move the fingertip across the camera frame, including its center and usable edges. | The full normalized camera frame maps one-to-one across the active display, with horizontal mirroring only. Toki remains responsive and does not move the real mouse cursor. | NOT RUN | |
| PTR-03 | Briefly hide the pointer hand, then return it quickly. | Visible state may recover without swapping identity or jumping to the other hand. | NOT RUN | |
| PTR-04 | Remove the pointer hand completely. | The visible pointer/blob releases after roughly one-third of a second instead of freezing for two seconds. | NOT RUN | |
| PTR-05 | Return the same hand within the two-second internal grace. | Tracking resumes without manufacturing a tap, lock, click, or voice event. | NOT RUN | |

## C. Wrist-Roll Lock

| ID | Action | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| LOCK-01 | Point at one visible control, turn that wrist roughly 90–180°, and hold briefly. | The one main Toki creature freezes at the last stable pre-roll fingertip coordinate; no second blob appears. | NOT RUN | |
| LOCK-02 | Move the pointing finger after the lock appears. | The one main Toki creature and the locked point remain frozen together. | NOT RUN | |
| LOCK-03 | Start a wrist roll but return before the brief stability hold completes. | No target lock is created. | NOT RUN | |
| LOCK-03A | Keep the wrist turned after one lock. | The held roll does not create another lock; returning to a normal point rearms the detector. | NOT RUN | |
| LOCK-04 | Change apps, move/resize the window, or invalidate Screen Recording after locking. | The stale lock is removed or refused; it is not reused on the changed screen. | NOT RUN | |
| LOCK-05 | Observe the lock without issuing guidance. | The compact top status confirms the lock, no accepted-guidance ring appears, and Toki performs no click. | NOT RUN | |

## D. Two-Hand Split and Persistent Strand

| ID | Action | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| SPLIT-00 | Show a second hand while both hands are already apart. | Toki stays merged; mere two-hand visibility never arms or triggers a split. | NOT RUN | |
| SPLIT-01 | Bring both hands together, hold briefly until “Split ready” appears, then move them apart. | Toki becomes two liquid lobes connected by one visible thin strand. | NOT RUN | |
| SPLIT-02 | Move both hands in different directions while split. | Both lobes follow their hands and the strand remains attached to their visible edges. | NOT RUN | |
| SPLIT-03 | Increase the separation. | The strand becomes finer but never disappears while the split remains active. | NOT RUN | |
| SPLIT-04 | Bring both hands closer together. | The strand contracts naturally and the lobes merge without snapping or leaving a stale line. | NOT RUN | |
| SPLIT-05 | Briefly occlude one hand, then remove it for longer. | A short miss is forgiven; prolonged loss begins recovery/merge and clears the second lobe. | NOT RUN | |
| SPLIT-06 | Enable macOS Reduce Motion and repeat the split. | The strand stays visible and attached but does not pulse or interpolate. | NOT RUN | |

## E. Ordinary and Control-Hand Pinch Hold-to-Talk

| ID | Action | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| VOICE-00 | With no pointer lock, pinch and hold the pointing hand while speaking, then release. | The ordinary one-hand path starts native recording, remains listening while held, and submits exactly once after release. | NOT RUN | |
| VOICE-00A | Pinch and release quickly while the microphone is still starting. | The release is remembered; a late native start is either submitted once or rejected cleanly. Toki never remains stuck in `starting` or `listening`. | NOT RUN | |
| VOICE-01 | Create a valid pointer lock, then pinch and hold with the other hand while speaking. | Recording starts through the existing hold-to-talk controller and stays active only while the pinch is held. | NOT RUN | |
| VOICE-02 | Begin the pinch immediately after the wrist roll while lock validation is still checking. | The held press waits for that same lock validation instead of disappearing or starting against another lock. | NOT RUN | |
| VOICE-03 | Let the pinch wobble slightly while entering and while held. | Brief threshold/camera jitter does not discard a real entry, repeatedly start, stop, or submit recording. Interruption time does not count toward the required pinch hold. | NOT RUN | |
| VOICE-04 | Open the pinch deliberately. | Recording stops promptly and submits exactly once. The local release must not depend on a cross-window event round trip. | NOT RUN | |
| VOICE-04A | While opening the pinch, briefly bring thumb and index close for one noisy frame, then keep them open. | The release candidate remains latched and submits once; one contradictory frame does not return Toki to a stuck held/listening state. | NOT RUN | |
| VOICE-04B | Start opening, then deliberately re-pinch and keep holding. | The sustained re-pinch cancels the release candidate and the existing recording continues; no false submission occurs. | NOT RUN | |
| VOICE-05 | Briefly hide the control hand during a recording, then return the same hand within two seconds. | The hold recovers without a false release or duplicate submission. | NOT RUN | |
| VOICE-06 | Remove the control hand for more than two seconds during a recording. | Listening stops and the audio already captured submits at most once; Toki does not remain stuck listening. | NOT RUN | |
| VOICE-06A | Deliberately open the pinch, then briefly move the hand out of view while the release is settling. | The latched release survives the missing frame, stops recording, and submits exactly once. | NOT RUN | |
| VOICE-07 | Pinch without a valid current lock. | Contextual recording does not begin later against an unrelated lock. | NOT RUN | |

## F. Pointer-Grounded Explanation

| ID | Action | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| EXP-01 | Lock one visible icon/control, pinch and hold with the other hand, say “Explain this,” then release. | A passive explanation card describes only the current control under the frozen point. | NOT RUN | |
| EXP-02 | Observe the underlying app during EXP-01. | Toki performs no click and shows no accepted-guidance target ring for the explanation. | NOT RUN | |
| EXP-03 | Say “What happens if I use this?” with a valid lock. | The same grounded explanation path is used. | NOT RUN | |
| EXP-04 | Ask a deictic explanation without a lock. | Toki asks for clarification rather than guessing. | NOT RUN | |
| EXP-05 | Lock a point, change the screen, then ask for an explanation. | Toki refuses or clarifies because the evidence is stale. | NOT RUN | |
| EXP-06 | Point to one control but explicitly name a different object in speech. | Toki refuses the pointer/speech conflict. | NOT RUN | |
| EXP-07 | Toggle spoken-explanation mute and repeat a valid explanation. | The card still appears, but muted speech does not play. Speech never begins while the microphone is recording. | NOT RUN | |

## G. Existing Voice and Guidance Regression

| ID | Action | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| REG-01 | Hold Right Option, speak, and release. | Recording exists only while held; release during startup is remembered; submission happens once. | NOT RUN | |
| REG-02 | On one unchanged screen, issue three commands that require different controls. | Each accepted command resolves to a distinct semantically correct region. | NOT RUN | |
| REG-03 | Ask to see recently played items on a screen where that tab is visible. | The complete tab/word region is outlined, not just a circle placed over the text. | NOT RUN | |
| REG-04 | Test one compact icon target. | The compact target retains the circular rotating cue. | NOT RUN | |
| REG-05 | Test an unsupported or ambiguous command. | Guidance is rejected and no target cue, strand, square, crosshair, or ring leaks onto the screen. | NOT RUN | |
| REG-06 | Test `Invite collaborators` on a visible playlist control. | The target appears with a warning that the option may change playlist access/settings; Toki performs no action. | NOT RUN | |
| REG-07 | Test one strong-risk target. | No ring appears before `Show target`; that user-controlled action reveals only the ring and never clicks the app. | NOT RUN | |
| REG-08 | With Screen Recording currently untrusted, issue one real guidance request. | macOS presents the native Screen Recording request. After approval and any requested relaunch, the next request passes Toki's app-owned preflight instead of reporting the old stale denial. | NOT RUN | |

## Failure Evidence

For the first failure in any section, preserve:

1. Case ID and exact spoken phrase or gesture sequence.
2. Whether the installed app or a dev app was running.
3. Camera/gesture status, active hand roles, raw and filtered pinch distance, pinch phase/event, recorder capture phase, hold phase, release-pending flag, detector/track owner, native session ID, last native duration/byte count, and lock/split phase from Debug.
4. Active-window app/title/bounds, screenshot dimensions, and permission state for guidance failures.
5. Raw provider answer, original rectangle, interpreted action/object, supporting evidence, grounding score/verdict, final rectangle, and exact rejection reason.
6. Whether the failure remained after hands left the camera or after capture stopped.
7. Approximate failure time so `npm run toki:debug` can be matched to the private local transition history. A user-posted Debug screenshot is not required.

Do not weaken confidence, safety, or semantic verification to make a failed manual case pass. Identify the first incorrect boundary and repair only that boundary.
