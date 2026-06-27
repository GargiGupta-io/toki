import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_ACCESSIBILITY_CANDIDATES = 30;
const MIN_CANDIDATE_SIZE = 4;

function slugCandidateId(label, index) {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug.length > 0 ? `ax-${slug}-${index + 1}` : `ax-candidate-${index + 1}`;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeAccessibilityCandidate(candidate, index, options = {}) {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const label =
    normalizeText(candidate.label) ||
    normalizeText(candidate.name) ||
    normalizeText(candidate.description) ||
    normalizeText(candidate.value);

  if (label.length === 0) {
    return null;
  }

  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const width = Number(candidate.width);
  const height = Number(candidate.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < MIN_CANDIDATE_SIZE ||
    height < MIN_CANDIDATE_SIZE
  ) {
    return null;
  }

  const displayWidth = Number(options.displayWidth);
  const displayHeight = Number(options.displayHeight);

  if (
    Number.isFinite(displayWidth) &&
    Number.isFinite(displayHeight) &&
    (x < 0 || y < 0 || x + width > displayWidth || y + height > displayHeight)
  ) {
    return null;
  }

  return {
    id: normalizeText(candidate.id) || slugCandidateId(label, index),
    label,
    role: normalizeText(candidate.role) || "unknown",
    x,
    y,
    width,
    height,
  };
}

export function parseMacAccessibilityOutput(stdout, options = {}) {
  const parsed = JSON.parse(stdout);
  const rawCandidates = Array.isArray(parsed) ? parsed : parsed.candidates;

  if (!Array.isArray(rawCandidates)) {
    return [];
  }

  return rawCandidates
    .map((candidate, index) =>
      normalizeAccessibilityCandidate(candidate, index, options),
    )
    .filter(Boolean)
    .slice(0, MAX_ACCESSIBILITY_CANDIDATES);
}

function parseMacAccessibilityMetadata(stdout) {
  const parsed = JSON.parse(stdout);

  if (Array.isArray(parsed)) {
    return {};
  }

  return {
    appName: normalizeText(parsed.appName),
    windowCount: Number.isFinite(parsed.windowCount) ? parsed.windowCount : 0,
    visitedCount: Number.isFinite(parsed.visitedCount) ? parsed.visitedCount : 0,
    errors: Array.isArray(parsed.errors)
      ? parsed.errors.filter((error) => normalizeText(error).length > 0)
      : [],
  };
}

function createAccessibilityScript(appName) {
  const appNameLiteral = JSON.stringify(normalizeText(appName));

  return `
function run() {
  var appName = ${appNameLiteral};
  var systemEvents = Application("System Events");
  var errors = [];
  var visitedCount = 0;

  function readSafely(read, fallback, context) {
    try {
      return read();
    } catch (error) {
      if (context) {
        errors.push(context + ": " + String(error));
      }
      return fallback;
    }
  }

  function getProcess() {
    if (appName.length > 0) {
      var named = systemEvents.processes.whose({ name: appName });
      if (named.length > 0) {
        return named[0];
      }
    }

    var frontmost = systemEvents.processes.whose({ frontmost: true });
    return frontmost.length > 0 ? frontmost[0] : null;
  }

  function findLabel(items) {
    for (var index = 0; index < items.length; index += 1) {
      if (typeof items[index] === "string" && items[index].trim().length > 0) {
        return items[index];
      }
    }

    return "";
  }

  var process = getProcess();
  var candidates = [];

  function addElement(element, depth) {
    if (candidates.length >= ${MAX_ACCESSIBILITY_CANDIDATES} || depth > 5) {
      return;
    }

    var name = readSafely(function () { return element.name(); }, "");
    var description = readSafely(function () { return element.description(); }, "");
    var value = readSafely(function () { return String(element.value()); }, "");
    var role = readSafely(function () { return element.role(); }, "unknown");
    var position = readSafely(function () { return element.position(); }, null);
    var size = readSafely(function () { return element.size(); }, null);
    var label = findLabel([name, description, value]);

    if (
      label &&
      Array.isArray(position) &&
      Array.isArray(size) &&
      Number(size[0]) >= ${MIN_CANDIDATE_SIZE} &&
      Number(size[1]) >= ${MIN_CANDIDATE_SIZE}
    ) {
      candidates.push({
        label,
        role,
        x: Number(position[0]),
        y: Number(position[1]),
        width: Number(size[0]),
        height: Number(size[1]),
      });
    }

    visitedCount += 1;

    var children = readSafely(
      function () { return element.uiElements(); },
      [],
      "read children"
    );

    for (var index = 0; index < children.length; index += 1) {
      addElement(children[index], depth + 1);
    }
  }

  if (process) {
    var windows = readSafely(
      function () { return process.windows(); },
      [],
      "read windows"
    );

    for (var index = 0; index < windows.length; index += 1) {
      addElement(windows[index], 0);
    }
  }

  return JSON.stringify({
    appName: process ? readSafely(function () { return process.name(); }, "", "read process name") : "",
    windowCount: windows ? windows.length : 0,
    visitedCount: visitedCount,
    errors: errors,
    candidates: candidates
  });
}
`;
}

function createVisibleProcessesScript() {
  return `
function run() {
  var systemEvents = Application("System Events");
  var processes = systemEvents.processes.whose({ visible: true });
  var items = [];

  function readSafely(read, fallback) {
    try {
      return read();
    } catch (_) {
      return fallback;
    }
  }

  for (var index = 0; index < processes.length; index += 1) {
    items.push({
      name: readSafely(function () { return processes[index].name(); }, ""),
      frontmost: readSafely(function () { return processes[index].frontmost(); }, false)
    });
  }

  return JSON.stringify(items);
}
`;
}

export async function listMacAccessibilityProcesses(options = {}) {
  const platform = options.platform ?? process.platform;

  if (platform !== "darwin") {
    return {
      source: "unsupported",
      processes: [],
      error: "macOS accessibility process listing is only available on darwin",
    };
  }

  const execFileImpl = options.execFileImpl ?? execFileAsync;

  try {
    const result = await execFileImpl(
      "osascript",
      ["-l", "JavaScript", "-e", createVisibleProcessesScript()],
      {
        timeout: options.timeoutMs ?? 5000,
        maxBuffer: 512 * 1024,
      },
    );
    const stdout = typeof result === "string" ? result : result.stdout;
    const parsed = JSON.parse(stdout);

    return {
      source: "macos-accessibility",
      processes: Array.isArray(parsed)
        ? parsed
            .filter((process) => normalizeText(process.name).length > 0)
            .map((process) => ({
              name: normalizeText(process.name),
              frontmost: process.frontmost === true,
            }))
        : [],
    };
  } catch (error) {
    return {
      source: "macos-accessibility",
      processes: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectMacAccessibilityCandidates(options = {}) {
  const platform = options.platform ?? process.platform;

  if (platform !== "darwin") {
    return {
      source: "unsupported",
      candidates: [],
      error: "macOS accessibility candidates are only available on darwin",
    };
  }

  const execFileImpl = options.execFileImpl ?? execFileAsync;

  try {
    const result = await execFileImpl(
      "osascript",
      ["-l", "JavaScript", "-e", createAccessibilityScript(options.appName)],
      {
        timeout: options.timeoutMs ?? 5000,
        maxBuffer: 1024 * 1024,
      },
    );
    const stdout = typeof result === "string" ? result : result.stdout;
    const metadata = parseMacAccessibilityMetadata(stdout);
    const candidates = parseMacAccessibilityOutput(stdout, options);

    return {
      source: "macos-accessibility",
      ...metadata,
      candidates,
      error:
        candidates.length === 0 && metadata.errors.length > 0
          ? metadata.errors.join("; ")
          : undefined,
    };
  } catch (error) {
    return {
      source: "macos-accessibility",
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
