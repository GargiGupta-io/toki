import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = join(rootDir, "fixtures", "candidate-page.html");
const html = await readFile(fixturePath, "utf8");
const expectedLabels = [
  "Create project",
  "Delete project",
  "Open settings",
  "Project name",
  "Environment selector",
  "Add notes",
];

const missingLabels = expectedLabels.filter((label) => !html.includes(label));

if (missingLabels.length > 0) {
  throw new Error(`Fixture is missing expected labels: ${missingLabels.join(", ")}`);
}

console.log(`fixture smoke passed: ${expectedLabels.length} labels`);
