import type { ScreenCandidate } from "@toki/shared";

export type CandidateAction =
  | "create"
  | "open"
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "select"
  | "search"
  | "download"
  | "invite"
  | "settings"
  | "delete"
  | "submit";

export type CandidateObject =
  | "collection"
  | "media"
  | "person"
  | "file"
  | "settings";

export type InterpretedCommandIntent = {
  objective: string;
  action: CandidateAction | null;
  object: CandidateObject | null;
  actions: CandidateAction[];
  objects: CandidateObject[];
};

export type CandidateSemanticMatch = {
  score: number;
  accepted: boolean;
  command: InterpretedCommandIntent;
  candidateActions: CandidateAction[];
  candidateObjects: CandidateObject[];
  matchedActions: CandidateAction[];
  matchedObjects: CandidateObject[];
  semanticText: string;
  reasons: string[];
};

type IntentLexicon<T extends string> = ReadonlyArray<{
  family: T;
  terms: readonly string[];
}>;

const ACTION_LEXICON: IntentLexicon<CandidateAction> = [
  { family: "create", terms: ["create", "add", "new", "make", "plus"] },
  { family: "open", terms: ["open", "view", "show", "see", "expand"] },
  { family: "play", terms: ["play", "start", "resume"] },
  { family: "pause", terms: ["pause", "stop"] },
  { family: "next", terms: ["next", "forward", "skip"] },
  { family: "previous", terms: ["previous", "back", "rewind"] },
  { family: "select", terms: ["select", "choose", "pick"] },
  { family: "search", terms: ["search", "find", "lookup"] },
  { family: "download", terms: ["download", "save", "export"] },
  { family: "invite", terms: ["invite", "share", "collaborate"] },
  {
    family: "settings",
    terms: ["settings", "preferences", "configure", "privacy", "permission"],
  },
  { family: "delete", terms: ["delete", "remove", "revoke", "trash"] },
  { family: "submit", terms: ["submit", "send", "confirm", "publish"] },
];

const OBJECT_LEXICON: IntentLexicon<CandidateObject> = [
  {
    family: "collection",
    terms: [
      "playlist",
      "playlists",
      "list",
      "lists",
      "collection",
      "collections",
      "library",
      "queue",
      "folder",
      "folders",
    ],
  },
  {
    family: "media",
    terms: [
      "song",
      "songs",
      "track",
      "tracks",
      "music",
      "audio",
      "video",
      "videos",
      "album",
      "albums",
      "episode",
      "episodes",
    ],
  },
  {
    family: "person",
    terms: [
      "collaborator",
      "collaborators",
      "member",
      "members",
      "user",
      "users",
      "person",
      "people",
      "friend",
      "friends",
      "profile",
      "profiles",
    ],
  },
  {
    family: "file",
    terms: [
      "file",
      "files",
      "document",
      "documents",
      "report",
      "reports",
      "attachment",
      "attachments",
      "archive",
      "archives",
    ],
  },
  {
    family: "settings",
    terms: [
      "settings",
      "preferences",
      "permission",
      "permissions",
      "privacy",
      "security",
    ],
  },
];

const PRIMARY_ACTION_PRIORITY: readonly CandidateAction[] = [
  "next",
  "previous",
  "select",
  "pause",
  "delete",
  "invite",
  "download",
  "search",
  "settings",
  "submit",
  "create",
  "open",
  "play",
];

const PRIMARY_OBJECT_PRIORITY: readonly CandidateObject[] = [
  "person",
  "collection",
  "media",
  "file",
  "settings",
];

const CANDIDATE_METADATA_KEYS = [
  "nativeRole",
  "nativeName",
  "nativeDescription",
  "nativeHelp",
  "nativeValue",
  "ariaLabel",
  "title",
  "placeholder",
  "tagName",
  "testId",
  "providerLabel",
  "providerReason",
] as const;

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/\+/g, " plus ")
        .replace(/\s+/g, " ")
    : "";
}

function tokenize(value: unknown): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 2),
  );
}

function matchFamilies<T extends string>(
  text: string,
  lexicon: IntentLexicon<T>,
): Set<T> {
  const tokens = tokenize(text);
  const matches = new Set<T>();

  for (const entry of lexicon) {
    if (entry.terms.some((term) => tokens.has(term))) {
      matches.add(entry.family);
    }
  }

  return matches;
}

function addContextualSemantics(
  text: string,
  actions: Set<CandidateAction>,
  objects: Set<CandidateObject>,
): void {
  const normalized = normalizeText(text);

  if (/\b(tab|page|panel|section|menu|link)\b/.test(normalized)) {
    actions.add("open");
  }

  if (
    /\b(recently played|listening history|playback history|recent(?:ly)? (?:songs?|tracks?|music|audio|videos?|episodes?|albums?))\b/.test(
      normalized,
    )
  ) {
    objects.add("media");
  }
}

export function getCandidateSemanticText(candidate: ScreenCandidate): string {
  const metadataText = CANDIDATE_METADATA_KEYS.flatMap((key) => {
    const value = candidate.metadata?.[key];
    return typeof value === "string" ? [value] : [];
  });

  return [candidate.label, candidate.role, ...metadataText].join(" ");
}

function addCompositeActions(
  actions: Set<CandidateAction>,
  objects: Set<CandidateObject>,
): void {
  if (actions.has("create") && objects.has("person")) {
    actions.add("invite");
  }
}

function addImpliedObjects(
  actions: Set<CandidateAction>,
  objects: Set<CandidateObject>,
): void {
  if (
    actions.has("play") ||
    actions.has("pause") ||
    actions.has("next") ||
    actions.has("previous")
  ) {
    objects.add("media");
  }

  if (actions.has("invite")) {
    objects.add("person");
  }

  if (actions.has("download")) {
    objects.add("file");
  }

  if (actions.has("settings")) {
    objects.add("settings");
  }
}

function firstIntersection<T>(left: Set<T>, right: Set<T>): T | null {
  for (const value of left) {
    if (right.has(value)) {
      return value;
    }
  }

  return null;
}

function primaryGoalAction(actions: Set<CandidateAction>): CandidateAction | null {
  return PRIMARY_ACTION_PRIORITY.find((action) => actions.has(action)) ?? null;
}

function primaryGoalObject(objects: Set<CandidateObject>): CandidateObject | null {
  return PRIMARY_OBJECT_PRIORITY.find((object) => objects.has(object)) ?? null;
}

export function interpretCommandIntent(goal: string): InterpretedCommandIntent {
  const actions = matchFamilies(goal, ACTION_LEXICON);
  const objects = matchFamilies(goal, OBJECT_LEXICON);

  addContextualSemantics(goal, actions, objects);
  addCompositeActions(actions, objects);
  addImpliedObjects(actions, objects);

  return {
    objective: normalizeText(goal),
    action: primaryGoalAction(actions),
    object: primaryGoalObject(objects),
    actions: [...actions],
    objects: [...objects],
  };
}

/**
 * Words the command and the target have in common, ignoring filler.
 *
 * Deliberately crude: this is asked only when no verb was recognised, and its
 * job is to separate "you asked about the quote reply and I found Quote reply"
 * from "you asked about the quote reply and I found the avatar". A shared
 * distinctive word answers that; anything cleverer would be inventing certainty
 * out of two short strings.
 */
const INTENT_FILLER_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at", "is",
  "are", "was", "were", "be", "this", "that", "these", "those", "it", "its",
  "my", "me", "i", "you", "your", "can", "could", "would", "please", "just",
  "where", "what", "which", "how", "who", "do", "does", "did", "with", "from",
  "there", "here", "some", "any", "get", "got", "want", "need", "thing",
]);

export function sharedDistinctiveWords(
  command: string,
  candidate: string,
): string[] {
  const words = (text: string) =>
    new Set(
      normalizeText(text)
        .split(/[^a-z0-9]+/u)
        .filter((word) => word.length >= 3 && !INTENT_FILLER_WORDS.has(word)),
    );

  const target = words(candidate);

  return [...words(command)].filter((word) => target.has(word));
}

export function evaluateCandidateSemanticMatch(
  candidate: ScreenCandidate,
  goal: string,
): CandidateSemanticMatch {
  const command = interpretCommandIntent(goal);
  const semanticText = getCandidateSemanticText(candidate);
  const candidateActions = matchFamilies(semanticText, ACTION_LEXICON);
  const candidateObjects = matchFamilies(semanticText, OBJECT_LEXICON);

  addContextualSemantics(semanticText, candidateActions, candidateObjects);
  addCompositeActions(candidateActions, candidateObjects);
  addImpliedObjects(candidateActions, candidateObjects);

  const matchedActions = command.actions.filter((action) =>
    candidateActions.has(action),
  );
  const matchedObjects = command.objects.filter((object) =>
    candidateObjects.has(object),
  );
  const reasons: string[] = [];
  let score = 0;
  let accepted = true;

  /*
   * Does this control correspond to what was asked about?
   *
   * Agreement between the command's verb and the target's own verbs is the
   * strongest signal, when it exists. It very often does not, and that used to
   * be treated as a refusal in two different ways -- both wrong, and the second
   * worse than the first.
   *
   * An unrecognised verb rejected outright, so most ordinary phrasings failed:
   * "where is the quote reply option", "what is this", or just naming the
   * thing. Six of ten natural phrasings produced no verb, and every one came
   * back as "the requested action could not be interpreted safely".
   *
   * A *recognised* verb was stricter still, because it then demanded the
   * target's own label contain a matching verb -- and labels are nouns. So
   * "quote reply" was accepted while "find the quote reply" was rejected, for
   * the same intent and the same correct target. The verb describes what the
   * person wants; the label names the control. They are not the same vocabulary
   * and requiring them to agree rejects correct answers.
   *
   * So: verb agreement scores well when present, and otherwise the words have
   * to correspond. A target sharing no distinctive word with the request is
   * still refused, which is the check that was actually wanted -- "you asked
   * about the quote reply and I found the avatar" fails on every phrasing.
   *
   * Nothing about danger is relaxed. Whether an action needs confirming is
   * decided by the risk class the model returns, which is a separate gate.
   */
  /*
   * Compared against the label, not the whole semantic text.
   *
   * That text includes the model's own reason for choosing the target, which
   * is prose the model wrote after reading the request -- so it echoes the
   * request's words back and any overlap test against it passes by
   * construction. Asking "Play the next song" and being handed a pause button
   * whose justification mentions "the current song" would match on "song".
   *
   * The label is the claim about what the control *is*, which is the thing
   * being checked.
   */
  const overlap = sharedDistinctiveWords(command.objective, candidate.label ?? "");

  if (command.action != null && candidateActions.has(command.action)) {
    score += 40;
    reasons.push(`semantic-action:${command.action}`);
  } else if (overlap.length > 0) {
    score += 35;
    reasons.push(`lexical-match:${overlap.slice(0, 3).join("+")}`);
  } else {
    accepted = false;
    reasons.push(
      command.action == null
        ? "command-and-target-share-nothing"
        : `semantic-action-missing:${command.action}`,
    );
  }

  if (command.object == null) {
    score += 20;
    reasons.push("semantic-object:not-required");
  } else if (candidateObjects.has(command.object)) {
    score += 30;
    reasons.push(`semantic-object:${command.object}`);
  } else if (overlap.length > 0) {
    // The same reasoning: a control named "Quote reply" belongs to no object
    // family this lexicon knows, and that is a gap in the lexicon rather than a
    // sign the wrong thing was found.
    score += 15;
    reasons.push("semantic-object:by-wording");
  } else {
    accepted = false;
    reasons.push(`semantic-object-missing:${command.object}`);
  }

  if (accepted && command.action != null && command.object != null) {
    score += 10;
    reasons.push("semantic-action-object-pair");
  }

  return {
    score,
    accepted,
    command,
    candidateActions: [...candidateActions],
    candidateObjects: [...candidateObjects],
    matchedActions,
    matchedObjects,
    semanticText,
    reasons,
  };
}

export function scoreCandidateIntent(
  candidate: ScreenCandidate,
  goal: string,
): { score: number; reasons: string[] } {
  const goalActions = matchFamilies(goal, ACTION_LEXICON);
  const goalObjects = matchFamilies(goal, OBJECT_LEXICON);
  const semanticText = getCandidateSemanticText(candidate);
  const candidateActions = matchFamilies(semanticText, ACTION_LEXICON);
  const candidateObjects = matchFamilies(semanticText, OBJECT_LEXICON);
  const reasons: string[] = [];
  let score = 0;

  addContextualSemantics(goal, goalActions, goalObjects);
  addContextualSemantics(
    semanticText,
    candidateActions,
    candidateObjects,
  );
  addCompositeActions(goalActions, goalObjects);
  addCompositeActions(candidateActions, candidateObjects);
  addImpliedObjects(goalActions, goalObjects);
  addImpliedObjects(candidateActions, candidateObjects);

  const matchedAction = firstIntersection(candidateActions, goalActions);
  const matchedObject = firstIntersection(candidateObjects, goalObjects);
  const primaryAction = primaryGoalAction(goalActions);

  if (matchedAction != null) {
    score += 18;
    reasons.push(`intent-action:${matchedAction}`);
  } else if (goalActions.size > 0 && candidateActions.size > 0) {
    score -= 26;
    reasons.push(
      `intent-action-conflict:${[...candidateActions].join("+")}->${[
        ...goalActions,
      ].join("+")}`,
    );
  }

  if (primaryAction != null && candidateActions.has(primaryAction)) {
    score += 10;
    reasons.push(`intent-primary-action:${primaryAction}`);
  }

  if (matchedObject != null) {
    score += 14;
    reasons.push(`intent-object:${matchedObject}`);
  } else if (goalObjects.size > 0 && candidateObjects.size > 0) {
    score -= 8;
    reasons.push(
      `intent-object-conflict:${[...candidateObjects].join("+")}->${[
        ...goalObjects,
      ].join("+")}`,
    );
  }

  if (matchedAction != null && matchedObject != null) {
    score += 10;
    reasons.push("intent-action-object-pair");
  }

  return { score, reasons };
}
