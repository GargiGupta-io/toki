import assert from "node:assert/strict";
import test from "node:test";
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
