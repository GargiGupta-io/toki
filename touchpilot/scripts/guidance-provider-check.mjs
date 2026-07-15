import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function candidateBinaries() {
  return [
    process.env.TOKI_CODEX_BIN,
    join(homedir(), ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "codex",
  ].filter(Boolean);
}

function findCodexBinary() {
  for (const candidate of candidateBinaries()) {
    if (candidate.includes("/") && !existsSync(candidate)) {
      continue;
    }

    const result = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    if (result.status === 0) {
      return {
        binary: candidate,
        version: result.stdout.trim() || result.stderr.trim(),
      };
    }
  }

  return null;
}

const installation = findCodexBinary();

if (installation == null) {
  console.error("[BLOCKED] Codex CLI was not found.");
  console.error("Install Codex, sign in with ChatGPT, and retry this check.");
  process.exitCode = 1;
} else {
  const auth = spawnSync(installation.binary, ["login", "status"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  if (auth.status !== 0) {
    console.error(`[BLOCKED] ${installation.version}`);
    console.error(auth.stderr.trim() || "Codex is installed but not signed in.");
    process.exitCode = 1;
  } else {
    console.log(`[READY] ${installation.version}`);
    console.log(auth.stdout.trim() || "Codex subscription authentication is ready.");
  }
}
