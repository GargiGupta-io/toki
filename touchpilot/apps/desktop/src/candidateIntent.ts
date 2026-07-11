import type { ScreenCandidate } from "@toki/shared";

export type CandidateAction =
  | "create"
  | "open"
  | "play"
  | "pause"
  | "next"
  | "previous"
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

type IntentLexicon<T extends string> = ReadonlyArray<{
  family: T;
  terms: readonly string[];
}>;

const ACTION_LEXICON: IntentLexicon<CandidateAction> = [
  { family: "create", terms: ["create", "add", "new", "make", "plus"] },
  { family: "open", terms: ["open", "view", "show", "expand"] },
  { family: "play", terms: ["play", "start", "resume"] },
  { family: "pause", terms: ["pause", "stop"] },
  { family: "next", terms: ["next", "forward", "skip"] },
  { family: "previous", terms: ["previous", "back", "rewind"] },
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

function candidateSemanticText(candidate: ScreenCandidate): string {
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

export function scoreCandidateIntent(
  candidate: ScreenCandidate,
  goal: string,
): { score: number; reasons: string[] } {
  const goalActions = matchFamilies(goal, ACTION_LEXICON);
  const goalObjects = matchFamilies(goal, OBJECT_LEXICON);
  const semanticText = candidateSemanticText(candidate);
  const candidateActions = matchFamilies(semanticText, ACTION_LEXICON);
  const candidateObjects = matchFamilies(semanticText, OBJECT_LEXICON);
  const reasons: string[] = [];
  let score = 0;

  addCompositeActions(goalActions, goalObjects);
  addCompositeActions(candidateActions, candidateObjects);

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
