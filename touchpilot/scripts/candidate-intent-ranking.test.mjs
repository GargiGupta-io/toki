import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCandidateSemanticMatch,
  interpretCommandIntent,
} from "../apps/desktop/src/candidateIntent.ts";
import { rankScreenCandidates } from "../apps/desktop/src/candidateRanking.ts";

function candidate(id, label, metadata = {}) {
  return {
    id,
    label,
    role: "accessibility_element",
    source: "accessibility",
    x: 100,
    y: 100,
    width: 44,
    height: 44,
    metadata,
  };
}

test("create collection intent prefers its create control", () => {
  const ranked = rankScreenCandidates(
    [
      candidate("play", "Play button"),
      candidate("create", "Plus icon", {
        nativeHelp: "Create a new playlist",
      }),
      candidate("library", "Your library"),
    ],
    "Make a new playlist",
  );

  assert.equal(ranked[0].id, "create");
  assert.ok(ranked[0].rank.reasons.includes("intent-action:create"));
  assert.ok(ranked[0].rank.reasons.includes("intent-object:collection"));
  assert.ok(ranked[0].rank.reasons.includes("intent-action-object-pair"));
});

test("next media intent rejects an unrelated plus control", () => {
  const ranked = rankScreenCandidates(
    [
      candidate("create", "Plus icon", {
        nativeHelp: "Create a new playlist",
      }),
      candidate("play", "Play button"),
      candidate("next", "Next button", {
        nativeHelp: "Skip to the next song",
      }),
    ],
    "Play the next song",
  );

  assert.equal(ranked[0].id, "next");
  assert.ok(ranked[0].rank.reasons.includes("intent-primary-action:next"));
  assert.ok(
    ranked
      .find((item) => item.id === "create")
      .rank.reasons.some((reason) => reason.startsWith("intent-action-conflict:")),
  );
});

test("invite intent understands person plus controls", () => {
  const ranked = rankScreenCandidates(
    [
      candidate("generic-plus", "Plus icon"),
      candidate("invite", "Toolbar item", {
        nativeDescription: "Invite collaborators",
      }),
      candidate("new-file", "Add file"),
    ],
    "Add collaborators",
  );

  assert.equal(ranked[0].id, "invite");
  assert.ok(ranked[0].rank.reasons.includes("intent-action:invite"));
  assert.ok(ranked[0].rank.reasons.includes("intent-object:person"));
});

test("download intent beats unrelated search and settings controls", () => {
  const ranked = rankScreenCandidates(
    [
      candidate("search", "Search"),
      candidate("settings", "Settings"),
      candidate("download", "Toolbar item", {
        nativeHelp: "Download current report",
      }),
    ],
    "Download the report",
  );

  assert.equal(ranked[0].id, "download");
  assert.ok(ranked[0].rank.reasons.includes("intent-action:download"));
  assert.ok(ranked[0].rank.reasons.includes("intent-object:file"));
});

test("metadata can carry semantics when the visible label is generic", () => {
  const ranked = rankScreenCandidates(
    [
      candidate("generic", "Toolbar item", {
        nativeHelp: "Save report to Downloads",
      }),
      candidate("other", "Toolbar item", {
        nativeHelp: "Open application settings",
      }),
    ],
    "Save the report",
  );

  assert.equal(ranked[0].id, "generic");
  assert.ok(ranked[0].rank.reasons.includes("intent-action:download"));
});

test("play is not treated as an exact text match inside playlist", () => {
  const ranked = rankScreenCandidates(
    [candidate("playlist", "Playlist"), candidate("next", "Next")],
    "Play the next song",
  );
  const playlist = ranked.find((item) => item.id === "playlist");

  assert.equal(ranked[0].id, "next");
  assert.equal(
    playlist.rank.reasons.some((reason) => reason.startsWith("goal-text:")),
    false,
  );
  assert.equal(playlist.rank.reasons.includes("exact-label"), false);
});

test("command intent separates the requested action and object", () => {
  const createIntent = interpretCommandIntent("How do I make a new playlist?");
  const nextIntent = interpretCommandIntent("Play the next song");
  const inviteIntent = interpretCommandIntent("Invite collaborators");
  const recentIntent = interpretCommandIntent(
    "How to see the recently played songs.",
  );

  assert.equal(createIntent.action, "create");
  assert.equal(createIntent.object, "collection");
  assert.equal(nextIntent.action, "next");
  assert.equal(nextIntent.object, "media");
  assert.equal(inviteIntent.action, "invite");
  assert.equal(inviteIntent.object, "person");
  assert.equal(recentIntent.action, "open");
  assert.equal(recentIntent.object, "media");
});

test("semantic matching requires both the requested action and object", () => {
  const correct = evaluateCandidateSemanticMatch(
    candidate("next", "Next button", {
      nativeHelp: "Skip to the next song",
    }),
    "Play the next song",
  );
  const unrelatedPlus = evaluateCandidateSemanticMatch(
    candidate("plus", "Plus icon", {
      nativeHelp: "Create a new playlist",
    }),
    "Play the next song",
  );
  const ambiguousCreate = evaluateCandidateSemanticMatch(
    candidate("create", "Plus icon"),
    "Create a new playlist",
  );
  const implicitMedia = evaluateCandidateSemanticMatch(
    candidate("next", "Next button"),
    "Play the next song",
  );

  assert.equal(correct.accepted, true);
  assert.deepEqual(correct.matchedActions, ["next"]);
  assert.deepEqual(correct.matchedObjects, ["media"]);
  assert.equal(unrelatedPlus.accepted, false);
  assert.ok(unrelatedPlus.reasons.includes("semantic-action-missing:next"));
  assert.equal(ambiguousCreate.accepted, false);
  assert.ok(
    ambiguousCreate.reasons.includes("semantic-object-missing:collection"),
  );
  assert.equal(implicitMedia.accepted, true);
  assert.ok(implicitMedia.reasons.includes("semantic-object:media"));
});

test("read-only navigation understands media-history targets contextually", () => {
  const recentMedia = evaluateCandidateSemanticMatch(
    candidate("recent-media", "Recently played tab"),
    "How to see the recently played songs.",
  );
  const recentPeople = evaluateCandidateSemanticMatch(
    candidate("recent-people", "Recent profiles tab"),
    "How to see the recently played songs.",
  );
  const playbackAction = evaluateCandidateSemanticMatch(
    candidate("recent-media", "Recently played tab"),
    "Play the next song",
  );

  assert.equal(recentMedia.accepted, true);
  assert.deepEqual(recentMedia.matchedActions, ["open"]);
  assert.deepEqual(recentMedia.matchedObjects, ["media"]);
  assert.equal(recentPeople.accepted, false);
  assert.ok(recentPeople.reasons.includes("semantic-object-missing:media"));
  assert.equal(playbackAction.accepted, false);
  assert.ok(playbackAction.reasons.includes("semantic-action-missing:next"));
});
