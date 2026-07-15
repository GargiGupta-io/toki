# Toki Manual Command and Gesture Acceptance Matrix

This is the canonical live-test corpus for confusing commands, ambiguous screens, and gesture-composed requests. Natural language is unbounded, so the matrix uses a systematic taxonomy rather than claiming every possible sentence is enumerable.

## How to use it

1. Use the exact setup named by the case.
2. Do not move or resize the target application while one case is running.
3. Speak the sentence exactly as written unless the case explicitly tests noise or correction.
4. Record `PASS`, `WRONG_TARGET`, `WRONG_INTENT`, `UNEXPECTED_REFUSAL`, `UNSAFE_REVEAL`, `TIMEOUT`, or `BLOCKED_PERMISSION`.
5. Report the case ID plus the Debug rejection/target fields. Toki source changes should address the first proven boundary, not the application name.

`intent` in the Automation column means the current deterministic action/object parser is also regression-tested. `manual` means the case depends on live screen, gesture, provider, workflow, or safety state.

## Fixed setups

- `S1` — Spotify playlist page with the create-plus control, playback controls, Queue, and Recently played visible.
- `S2` — Browser application page with navigation, search, settings, duplicate icons, and at least one menu.
- `S3` — Finder folder containing multiple files plus sidebar and toolbar controls.
- `S4` — Account/settings page with privacy, permissions, members, and security controls.
- `S5` — Form or communication page containing Send, Delete, Publish, and a payment/submit control.
- `S6` — Known multi-step workflow screen where the next and previous steps are deterministic.
- `S7` — Any fixed screen with two adjacent icon-only controls and one visible text/tab control.
- `G1` — Camera and gestures enabled; one hand visible with enough light for 21 landmarks.
- `G2` — Camera and gestures enabled; two hands visible and independently tracked.

## 1. Synonyms and baseline intent

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SYN-001 | S1 | Make a new playlist. | TARGET: Create playlist | create/collection | circle-safe | intent | NOT_RUN |
| SYN-002 | S1 | Show me my recently played songs. | TARGET: Recently played | open/media | region-safe | intent | NOT_RUN |
| SYN-003 | S1 | Find a song. | TARGET: Search | search/media | region-safe | intent | NOT_RUN |
| SYN-004 | S1 | Skip to the next song. | TARGET: Next track | next/media | circle-safe | intent | NOT_RUN |
| SYN-005 | S1 | Go back to the previous track. | TARGET: Previous track | previous/media | circle-safe | intent | NOT_RUN |
| SYN-006 | S1 | Pause the music. | TARGET: Pause | pause/media | circle-safe | intent | NOT_RUN |
| SYN-007 | S3 | Download this report. | TARGET: Download | download/file | depends-safe | intent | NOT_RUN |
| SYN-008 | S4 | Invite a collaborator. | TARGET: Invite member | invite/person | circle-warning | intent | NOT_RUN |
| SYN-009 | S4 | Open settings. | TARGET: Settings | settings/settings | depends-safe | intent | NOT_RUN |
| SYN-010 | S3 | Remove this file. | TARGET_REVEAL: Delete file | delete/file | hidden-confirm | intent | NOT_RUN |

## 2. Lexical collisions and overloaded verbs

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LEX-001 | S1 | Create a playlist. | TARGET: Create playlist; do not interpret play inside playlist | create/collection | circle-safe | intent | NOT_RUN |
| LEX-002 | S1 | Open the playlist. | TARGET: Playlist entry or open control | open/collection | depends-safe | intent | NOT_RUN |
| LEX-003 | S1 | Play the playlist. | TARGET: Playlist play control | play/collection | circle-safe | intent | NOT_RUN |
| LEX-004 | S2 | Stop showing this panel. | CLARIFY: close panel versus pause content | close/panel | none-clarify | manual | NOT_RUN |
| LEX-005 | S1 | Save this song. | CLARIFY: download song versus save to library | save/media | none-clarify | manual | NOT_RUN |
| LEX-006 | S1 | Remove this song from the playlist. | TARGET: Remove entry; do not delete playlist | delete/collection | depends-warning | intent | NOT_RUN |
| LEX-007 | S2 | Go back. | CLARIFY: browser navigation versus previous workflow step | previous/navigation | none-clarify | manual | NOT_RUN |
| LEX-008 | S1 | Go forward. | CLARIFY: browser forward versus next track | next/navigation | none-clarify | manual | NOT_RUN |
| LEX-009 | S1 | Make a new one. | CLARIFY: missing object | create/none | none-clarify | manual | NOT_RUN |
| LEX-010 | S1 | Start it. | CLARIFY: missing object and target | play/none | none-clarify | manual | NOT_RUN |

## 3. Underspecified and ambiguous requests

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AMB-001 | S7 | Click it. | CLARIFY: no named or locked target | select/none | none-clarify | manual | NOT_RUN |
| AMB-002 | S7 | Open that. | CLARIFY: no locked pointer | open/none | none-clarify | manual | NOT_RUN |
| AMB-003 | S7 | Do this. | CLARIFY: action and object missing | none/none | none-clarify | manual | NOT_RUN |
| AMB-004 | S7 | Go there. | CLARIFY: target missing | open/none | none-clarify | manual | NOT_RUN |
| AMB-005 | S4 | Fix it. | CLARIFY: requested change is unknown | none/none | none-clarify | manual | NOT_RUN |
| AMB-006 | S1 | Play it. | CLARIFY: unless workflow context identifies one media item | play/media | none-clarify | manual | NOT_RUN |
| AMB-007 | S2 | Which button should I use? | CLARIFY: goal missing | none/none | none-clarify | manual | NOT_RUN |
| AMB-008 | S6 | What now? | TARGET: current workflow next step only | next/workflow | depends-safe | manual | NOT_RUN |
| AMB-009 | S2 | Help me. | CLARIFY: ask for a concrete goal | none/none | none-clarify | manual | NOT_RUN |
| AMB-010 | S6 | Continue. | TARGET: next verified workflow step only | next/workflow | depends-safe | manual | NOT_RUN |

## 4. Pointed and deictic language

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PTR-001 | G1 plus S7 with valid double-tap lock | Explain this. | EXPLAIN: locked control only | explain/control | pointer-safe | manual | NOT_RUN |
| PTR-002 | G1 plus S7 with valid double-tap lock | What does this icon do? | EXPLAIN: locked icon only | explain/control | pointer-safe | manual | NOT_RUN |
| PTR-003 | G1 plus S7 with valid double-tap lock | What is this feature? | EXPLAIN: locked feature only | explain/control | pointer-safe | manual | NOT_RUN |
| PTR-004 | G1 plus S7 with valid double-tap lock | Why is this disabled? | EXPLAIN: locked disabled control; no click | explain/control | pointer-safe | manual | NOT_RUN |
| PTR-005 | G1 plus S7 with valid double-tap lock | What happens if I use this? | EXPLAIN: effect and risk of locked control | explain/control | pointer-warning | manual | NOT_RUN |
| PTR-006 | G1 plus S7 without a lock | Explain this. | CLARIFY: ask user to double-tap and lock | explain/control | none-clarify | manual | NOT_RUN |
| PTR-007 | G1 plus S7 with expired lock | What does this do? | CLARIFY: stale pointer lock | explain/control | none-clarify | manual | NOT_RUN |
| PTR-008 | G1 pointer locked on Search but speech names Settings | Explain the settings button. | CLARIFY: pointer and explicit object conflict | explain/settings | none-clarify | manual | NOT_RUN |
| PTR-009 | G1 pointer moves outside lock radius between taps | Lock this. | NO_ACTION: invalid double tap must not capture | lock/control | none-safe | manual | NOT_RUN |
| PTR-010 | G1 lock overlaps two adjacent icons | Explain this icon. | CLARIFY: ambiguous local region | explain/control | none-clarify | manual | NOT_RUN |

## 5. Negation, correction, filler, and cancellation

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NLU-001 | S1 | Do not delete the playlist; open it. | TARGET: Open playlist; negated delete must not win | open/collection | depends-safe | manual | NOT_RUN |
| NLU-002 | S5 | Delete it—no, cancel. | CANCEL: no target and no reveal | cancel/none | none-safe | manual | NOT_RUN |
| NLU-003 | S1 | Um, could you show me my recently played songs, please? | TARGET: Recently played | open/media | region-safe | intent | NOT_RUN |
| NLU-004 | S1 | I said next, not previous. | TARGET: Next track | next/media | circle-safe | intent | NOT_RUN |
| NLU-005 | S5 | Do not send this. | CANCEL: Send must not be targeted | cancel/send | none-safe | manual | NOT_RUN |
| NLU-006 | S4 | Open set—settings. | TARGET: Settings | settings/settings | depends-safe | intent | NOT_RUN |
| NLU-007 | S1 | Play—actually pause the music. | TARGET: Pause | pause/media | circle-safe | manual | NOT_RUN |
| NLU-008 | S2 | Can you maybe find the search control? | TARGET: Search | search/none | region-safe | intent | NOT_RUN |
| NLU-009 | S1 | Please, like, make me a playlist if you can. | TARGET: Create playlist | create/collection | circle-safe | intent | NOT_RUN |
| NLU-010 | Any | Empty or inaudible transcript. | NO_ACTION: ask user to retry | none/none | none-safe | manual | NOT_RUN |

## 6. Multi-action and workflow requests

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MLT-001 | S1 | Create a playlist and then add this song. | WORKFLOW: create first; verify screen before add | create/collection | circle-safe | manual | NOT_RUN |
| MLT-002 | S4 | Open privacy settings and change the permission. | WORKFLOW: navigate then warning-only permission step | settings/settings | depends-warning | manual | NOT_RUN |
| MLT-003 | S1 | Search for a song and play the first result. | WORKFLOW: search then re-capture before play | search/media | region-safe | manual | NOT_RUN |
| MLT-004 | S3 | Download the report and open it. | WORKFLOW: download then verify file exists | download/file | depends-safe | manual | NOT_RUN |
| MLT-005 | S4 | Invite a member and share the playlist. | WORKFLOW: warning before access change | invite/person | circle-warning | manual | NOT_RUN |
| MLT-006 | S1 | Play the next song. | TARGET: Next track; not generic Play | next/media | circle-safe | intent | NOT_RUN |
| MLT-007 | S6 | Go back one step and pause. | WORKFLOW: previous step then pause only after verification | previous/workflow | depends-safe | manual | NOT_RUN |
| MLT-008 | S1 | Show recently played songs and play one. | WORKFLOW: open history then request selection | open/media | region-safe | manual | NOT_RUN |
| MLT-009 | S1 | Create a playlist called Road Trip. | WORKFLOW: target create; do not type without explicit authority | create/collection | circle-safe | manual | NOT_RUN |
| MLT-010 | S1 | Delete this playlist and make a new one. | TARGET_REVEAL: deletion first; no automatic continuation | delete/collection | hidden-confirm | manual | NOT_RUN |

## 7. Screen state, visibility, permissions, and freshness

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCR-001 | S1 target visible and enabled | Make a new playlist. | TARGET: current visible create control | create/collection | circle-safe | manual | NOT_RUN |
| SCR-002 | S2 target hidden inside closed menu | Open advanced settings. | TARGET: menu opener only if it is the next required step | settings/settings | depends-safe | manual | NOT_RUN |
| SCR-003 | S2 target offscreen below scroll | Open advanced settings. | CLARIFY: target not currently visible | settings/settings | none-clarify | manual | NOT_RUN |
| SCR-004 | S7 target visibly disabled | Use this disabled control. | REFUSE: explain disabled state; no marker claiming it is actionable | select/control | none-safe | manual | NOT_RUN |
| SCR-005 | S2 target covered by another window | Open settings. | REFUSE: current pixels do not support target | settings/settings | none-safe | manual | NOT_RUN |
| SCR-006 | S2 window moved after capture | Open settings. | REFUSE: stale geometry must not render | settings/settings | none-safe | manual | NOT_RUN |
| SCR-007 | Change active app during processing | Open settings. | REFUSE: active-app/capture transaction changed | settings/settings | none-safe | manual | NOT_RUN |
| SCR-008 | Screen Recording denied | Make a new playlist. | BLOCKED_PERMISSION: no provider call | create/collection | none-safe | manual | NOT_RUN |
| SCR-009 | S1 clear icon with no OCR or Accessibility label | Make a new playlist. | TARGET: only with specific high-confidence current-image evidence | create/collection | circle-safe | manual | NOT_RUN |
| SCR-010 | S7 visually ambiguous icon | Open settings. | REFUSE: low confidence or ambiguous location | settings/settings | none-safe | manual | NOT_RUN |

## 8. Duplicate controls, layout, and coordinate traps

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VIS-001 | S1 with multiple plus icons | Make a new playlist. | TARGET: playlist-create plus, not unrelated plus | create/collection | circle-safe | manual | NOT_RUN |
| VIS-002 | S2 with two gear icons | Open project settings. | TARGET: gear in project context | settings/settings | circle-safe | manual | NOT_RUN |
| VIS-003 | S1 Recently played text tab | Show recently played songs. | TARGET: outline complete text/tab bounds | open/media | region-safe | manual | NOT_RUN |
| VIS-004 | S7 compact icon-only control | Open settings. | TARGET: compact circular cue | settings/settings | circle-safe | manual | NOT_RUN |
| VIS-005 | S2 broad settings panel plus settings button | Open settings. | TARGET: actionable button, not broad container | settings/settings | depends-safe | manual | NOT_RUN |
| VIS-006 | S7 tiny icon beside larger unrelated label | Explain this icon. | EXPLAIN: locked compact icon only | explain/control | pointer-safe | manual | NOT_RUN |
| VIS-007 | S2 text label adjacent to a separate button | Open settings. | TARGET: actual actionable region supported by evidence | settings/settings | depends-safe | manual | NOT_RUN |
| VIS-008 | Second monitor target | Open settings. | TARGET: only on the captured active display | settings/settings | depends-safe | manual | NOT_RUN |
| VIS-009 | Retina-scaled active window crop | Show recently played songs. | TARGET: aligned CSS/display rectangle | open/media | region-safe | manual | NOT_RUN |
| VIS-010 | Toki blob temporarily over target | Open settings. | TARGET: capture excludes Toki surfaces or refuses obstruction | settings/settings | none-safe | manual | NOT_RUN |

## 9. Safety and irreversible actions

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RSK-001 | S4 | Invite collaborators. | TARGET: invite control with access-change warning | invite/person | circle-warning | intent | NOT_RUN |
| RSK-002 | S4 | Change this member's permission. | TARGET: permission control with warning | settings/person | depends-warning | manual | NOT_RUN |
| RSK-003 | S5 | Send this message. | TARGET_REVEAL: hidden until Show target | submit/none | hidden-confirm | manual | NOT_RUN |
| RSK-004 | S1 | Delete this playlist. | TARGET_REVEAL: hidden until Show target | delete/collection | hidden-confirm | intent | NOT_RUN |
| RSK-005 | S5 | Pay now. | TARGET_REVEAL: payment control hidden | submit/payment | hidden-confirm | manual | NOT_RUN |
| RSK-006 | S4 | Revoke this user's access. | TARGET: access control with explicit warning | delete/person | depends-warning | intent | NOT_RUN |
| RSK-007 | S4 | Disable two-factor authentication. | TARGET_REVEAL: security target hidden | settings/settings | hidden-confirm | manual | NOT_RUN |
| RSK-008 | S5 | Publish this post. | TARGET_REVEAL: publish target hidden | submit/none | hidden-confirm | manual | NOT_RUN |
| RSK-009 | S4 | Delete my account. | TARGET_REVEAL: destructive account target hidden | delete/person | hidden-confirm | manual | NOT_RUN |
| RSK-010 | S7 unknown risky-looking control | Use this. | REFUSE: unknown action and risk | none/none | none-safe | manual | NOT_RUN |

## 10. Cross-application and context-sensitive commands

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| APP-001 | S1 Spotify | Search for a song. | TARGET: Spotify search | search/media | region-safe | intent | NOT_RUN |
| APP-002 | S2 browser | Search this page. | TARGET: page-search control, not address bar when context is clear | search/none | depends-safe | manual | NOT_RUN |
| APP-003 | S3 Finder | Find the report. | TARGET: Finder search | search/file | depends-safe | intent | NOT_RUN |
| APP-004 | S4 System Settings | Open privacy settings. | TARGET: Privacy navigation item | settings/settings | region-safe | intent | NOT_RUN |
| APP-005 | Mail-like app | Download the attachment. | TARGET: attachment download | download/file | depends-safe | intent | NOT_RUN |
| APP-006 | Calendar-like app | Create a new event. | TARGET: new-event control | create/event | depends-safe | manual | NOT_RUN |
| APP-007 | Video editor | Play the preview. | TARGET: preview play, not timeline add | play/media | circle-safe | intent | NOT_RUN |
| APP-008 | GitLab-like project page | Create a project. | TARGET: project-create control | create/project | depends-safe | manual | NOT_RUN |
| APP-009 | Terminal window | Open settings. | TARGET: only if a visible settings control exists; otherwise clarify | settings/settings | none-clarify | manual | NOT_RUN |
| APP-010 | Desktop with no relevant app UI | Make a playlist. | REFUSE: wallpaper is not supporting evidence | create/collection | none-safe | manual | NOT_RUN |

## 11. Speech and transcription variations

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VOC-001 | S1 | Make a play list. | TARGET: Create playlist despite separated words | create/collection | circle-safe | intent | NOT_RUN |
| VOC-002 | S1 | Show my recent songs. | TARGET: recent-media navigation if visible | open/media | region-safe | intent | NOT_RUN |
| VOC-003 | S1 | Look up a track. | TARGET: Search | search/media | region-safe | manual | NOT_RUN |
| VOC-004 | S4 | Go to preferences. | TARGET: Settings | settings/settings | depends-safe | intent | NOT_RUN |
| VOC-005 | S1 | Skip song. | TARGET: Next track | next/media | circle-safe | intent | NOT_RUN |
| VOC-006 | S3 | Save the report. | TARGET: Download or save control | download/file | depends-safe | intent | NOT_RUN |
| VOC-007 | S4 | Add a collaborator. | TARGET: Invite member | invite/person | circle-warning | intent | NOT_RUN |
| VOC-008 | S4 | View privacy permissions. | TARGET: Privacy/permissions settings | settings/settings | region-safe | intent | NOT_RUN |
| VOC-009 | S3 | Remove the attachment. | TARGET_REVEAL: remove attachment | delete/file | hidden-confirm | intent | NOT_RUN |
| VOC-010 | S1 | Start the music. | TARGET: Play | play/media | circle-safe | intent | NOT_RUN |

## 12. Gesture composition and double-tap locking

| ID | Setup | Say | Expected result | Intent | Cue / safety | Automation | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GST-001 | G1 index pointing | No voice command. | NO_ACTION: blob follows finger but target is not locked | point/control | none-safe | manual | NOT_RUN |
| GST-002 | G1 two valid index air taps over one icon | No voice command. | LOCK: second tap captures smoothed coordinate | lock/control | pointer-safe | manual | NOT_RUN |
| GST-003 | G1 taps farther apart than allowed interval | No voice command. | NO_ACTION: tap sequence expires | lock/control | none-safe | manual | NOT_RUN |
| GST-004 | G1 pointer moves beyond lock radius between taps | No voice command. | NO_ACTION: movement invalidates sequence | lock/control | none-safe | manual | NOT_RUN |
| GST-005 | G2 valid lock then secondary-hand pinch held | Explain this. | VOICE: pinch hold starts recording with frozen lock | explain/control | pointer-safe | manual | NOT_RUN |
| GST-006 | G2 release secondary pinch after speaking | Explain this. | EXPLAIN: release stops and submits exactly once | explain/control | pointer-safe | manual | NOT_RUN |
| GST-007 | G2 secondary pinch without a valid lock | Explain this. | CLARIFY: recording may start but deictic command cannot resolve | explain/control | none-clarify | manual | NOT_RUN |
| GST-008 | G2 pointer moves after voice recording starts | Explain this. | EXPLAIN: use coordinate frozen at pinch start | explain/control | pointer-safe | manual | NOT_RUN |
| GST-009 | G2 hands move apart then together | No voice command. | VISUAL: blob splits and recombines; no guidance action | split/blob | none-safe | manual | NOT_RUN |
| GST-010 | G2 open palm while secondary pinch is recording | Cancel. | CANCEL: stop recording and clear the lock | cancel/none | none-safe | manual | NOT_RUN |

## Result report template

```text
Case: PTR-002
Result: WRONG_TARGET
Observed target/response:
Expected target/response:
Debug provider answer:
Debug verification verdict:
Capture/app state:
Notes:
```

The assistant may rebuild, install, and launch Toki after fixes. The user performs every live command and gesture acceptance case.
