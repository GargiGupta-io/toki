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

/*
 * Refusing to point at the right thing.
 *
 * The vision-only path asked whether the command and the target agreed, and
 * answered it with a thirteen-family verb lexicon. That rejected most ordinary
 * ways of asking -- and then, when a verb *was* recognised, rejected harder,
 * because it went on to demand the target's own label contain a matching verb.
 * Labels are nouns.
 *
 * So "quote reply" was accepted and "find the quote reply" was refused, for the
 * same intent and the same correct target, and both came back to the person as
 * "the requested action could not be interpreted safely".
 */

const quoteReply = {
  id: "vision-model-target",
  label: "Quote reply",
  role: "button",
  source: "vision",
  x: 100,
  y: 100,
  width: 40,
  height: 20,
};

test("every ordinary way of asking for a control is accepted", () => {
  for (const phrasing of [
    "find the quote reply option for the changes reviewed",
    "where is the quote reply option",
    "show me the quote reply button",
    "how do I quote reply to this review",
    "quote reply",
    "what is the quote reply option",
    "can you point at the quote reply",
    "I want to quote reply to the changes reviewed",
  ]) {
    const match = evaluateCandidateSemanticMatch(quoteReply, phrasing);
    assert.equal(match.accepted, true, phrasing);
  }
});

test("naming a thing and asking to find it behave the same", () => {
  // These differed only in whether a verb happened to be in the lexicon, and
  // they came out opposite ways round.
  const bare = evaluateCandidateSemanticMatch(quoteReply, "quote reply");
  const asked = evaluateCandidateSemanticMatch(
    quoteReply,
    "find the quote reply option",
  );

  assert.equal(bare.accepted, asked.accepted);
});

test("a target sharing nothing with the request is still refused", () => {
  // The check that was actually wanted. Loosening the verb rule must not turn
  // this into a gate that accepts anything the model returns.
  const wrong = { ...quoteReply, label: "Profile avatar" };

  for (const phrasing of [
    "find the quote reply option for the changes reviewed",
    "where is the quote reply option",
    "how do I quote reply to this review",
  ]) {
    assert.equal(
      evaluateCandidateSemanticMatch(wrong, phrasing).accepted,
      false,
      phrasing,
    );
  }
});

test("filler words alone are not correspondence", () => {
  // "the", "this", "where" and friends appear in everything. Matching on them
  // would accept any target for any request.
  const match = evaluateCandidateSemanticMatch(
    { ...quoteReply, label: "The other thing" },
    "where is the thing for this",
  );

  assert.equal(match.accepted, false);
});
