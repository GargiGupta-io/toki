import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mib = 1024 * 1024;

export const footprintBudgets = Object.freeze({
  installedAppBytes: 64 * mib,
  installedExecutableBytes: 64 * mib,
  webDistBytes: 56 * mib,
  productionJavaScriptBytes: 1 * mib,
  productionCssBytes: 128 * 1024,
  mediaPipeAssetsBytes: 48 * mib,
});

function pathSize(path) {
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) {
      return stat.size;
    }

    return readdirSync(path).reduce(
      (total, entry) => total + pathSize(join(path, entry)),
      0,
    );
  } catch {
    return null;
  }
}

function extensionSize(path, extension) {
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) {
      return path.endsWith(extension) ? stat.size : 0;
    }

    return readdirSync(path).reduce(
      (total, entry) => total + extensionSize(join(path, entry), extension),
      0,
    );
  } catch {
    return null;
  }
}

function readProcesses() {
  let processIds = [];

  try {
    processIds = execFileSync("pgrep", ["-x", "toki-desktop"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    // Managed shells can deny pgrep's process-table access even though
    // launchd still exposes the registered macOS application instances.
  }

  if (processIds.length === 0 && process.platform === "darwin") {
    try {
      const launchServices = execFileSync(
        "launchctl",
        ["print", `gui/${process.getuid()}`],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      processIds = Array.from(
        new Set(
          launchServices
            .split("\n")
            .map((line) =>
              line.match(
                /^\s*(\d+)\s+\S+\s+application\.app\.toki\.desktop\./,
              )?.[1],
            )
            .filter(Boolean),
        ),
      );
    } catch {
      // A missing application service means there is no process to report.
    }
  }

  if (processIds.length === 0) {
    return [];
  }

  try {
    return execFileSync(
      "ps",
      [
        "-o",
        "pid=,%cpu=,%mem=,rss=,etime=,command=",
        "-p",
        processIds.join(","),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim());
  } catch {
    return processIds.map(
      (processId) =>
        `${processId} application.app.toki.desktop (launchd; detailed metrics unavailable)`,
    );
  }
}

export function evaluateFootprint(footprint) {
  const checks = [
    ["installedAppBytes", footprint.installedAppBytes],
    ["installedExecutableBytes", footprint.installedExecutableBytes],
    ["webDistBytes", footprint.webDistBytes],
    ["productionJavaScriptBytes", footprint.productionJavaScriptBytes],
    ["productionCssBytes", footprint.productionCssBytes],
    ["mediaPipeAssetsBytes", footprint.mediaPipeAssetsBytes],
  ].map(([name, actual]) => ({
    name,
    actual,
    budget: footprintBudgets[name],
    pass: actual == null || actual <= footprintBudgets[name],
  }));

  return {
    pass: checks.every((check) => check.pass),
    checks,
  };
}

export function readRuntimeFootprint({
  installedAppPath = "/Applications/Toki.app",
  webDistPath,
} = {}) {
  const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const repositoryRoot = resolve(scriptDirectory, "..");
  const resolvedWebDistPath =
    webDistPath ?? join(repositoryRoot, "apps", "desktop", "dist");
  const installedExecutablePath = join(
    installedAppPath,
    "Contents",
    "MacOS",
    "toki-desktop",
  );

  const footprint = {
    installedAppPath,
    installedAppBytes: pathSize(installedAppPath),
    installedExecutableBytes: pathSize(installedExecutablePath),
    webDistPath: resolvedWebDistPath,
    webDistBytes: pathSize(resolvedWebDistPath),
    productionJavaScriptBytes: extensionSize(
      join(resolvedWebDistPath, "assets"),
      ".js",
    ),
    productionCssBytes: extensionSize(
      join(resolvedWebDistPath, "assets"),
      ".css",
    ),
    mediaPipeAssetsBytes: pathSize(
      join(resolvedWebDistPath, "mediapipe"),
    ),
    processes: readProcesses(),
  };

  return {
    ...footprint,
    evaluation: evaluateFootprint(footprint),
  };
}

function formatMib(bytes) {
  return bytes == null ? "not found" : `${(bytes / mib).toFixed(2)} MiB`;
}

function printHumanReport(report) {
  console.log(`Installed app: ${formatMib(report.installedAppBytes)}`);
  console.log(
    `Installed executable: ${formatMib(report.installedExecutableBytes)}`,
  );
  console.log(`Production web dist: ${formatMib(report.webDistBytes)}`);
  console.log(
    `Production JavaScript: ${formatMib(report.productionJavaScriptBytes)}`,
  );
  console.log(`Production CSS: ${formatMib(report.productionCssBytes)}`);
  console.log(`Offline MediaPipe: ${formatMib(report.mediaPipeAssetsBytes)}`);
  console.log(
    `Running processes: ${report.processes.length === 0 ? "none detected" : report.processes.join("\n  ")}`,
  );
  for (const check of report.evaluation.checks) {
    console.log(
      `${check.pass ? "PASS" : "FAIL"} ${check.name}: ${formatMib(check.actual)} / ${formatMib(check.budget)}`,
    );
  }
}

const isMain =
  process.argv[1] != null &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const report = readRuntimeFootprint();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (process.argv.includes("--enforce") && !report.evaluation.pass) {
    process.exitCode = 1;
  }
}
