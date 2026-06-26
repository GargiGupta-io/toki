const DEFAULT_OLLAMA_GENERATE_ENDPOINT = "http://127.0.0.1:11434/api/generate";
const DEFAULT_OLLAMA_MODEL = "llava:latest";

function getOllamaGenerateEndpoint() {
  return (
    process.env.TOKI_OLLAMA_ENDPOINT?.trim() ||
    DEFAULT_OLLAMA_GENERATE_ENDPOINT
  );
}

function getOllamaTagsEndpoint(generateEndpoint) {
  const url = new URL(generateEndpoint);
  url.pathname = "/api/tags";
  url.search = "";
  return url.toString();
}

async function fetchJsonWithTimeout(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: `${response.status} ${response.statusText}: ${text}`,
      };
    }

    return {
      ok: true,
      body: JSON.parse(text),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hasModel(tagsBody, modelName) {
  const models = Array.isArray(tagsBody?.models) ? tagsBody.models : [];

  return models.some((model) => {
    if (typeof model?.name !== "string") {
      return false;
    }

    return model.name === modelName || model.name.startsWith(`${modelName}:`);
  });
}

function printNextSteps({ endpoint, model, reason }) {
  console.log("[BLOCKED] local Ollama provider is not ready");
  console.log(`Reason: ${reason}`);
  console.log("");
  console.log("Required before known-screen accuracy can be tested:");
  console.log("1. Install and start Ollama or another compatible local provider.");
  console.log(`2. Pull/run a vision model, for example: ollama pull ${model}`);
  console.log("3. Start the Toki smoke server:");
  console.log("   npm run guidance:smoke:ollama");
  console.log("4. Run the known-screen check with a screenshot:");
  console.log("   TOKI_KNOWN_SCREEN_IMAGE=/path/to/screenshot.png npm run guidance:known-screen");
  console.log("");
  console.log(`Checked endpoint: ${endpoint}`);
}

async function main() {
  const model = process.env.TOKI_OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
  const generateEndpoint = getOllamaGenerateEndpoint();
  const tagsEndpoint = getOllamaTagsEndpoint(generateEndpoint);
  const tags = await fetchJsonWithTimeout(tagsEndpoint);

  console.log("Toki guidance provider readiness");
  console.log("");

  if (!tags.ok) {
    printNextSteps({
      endpoint: tagsEndpoint,
      model,
      reason: tags.error,
    });
    return;
  }

  if (!hasModel(tags.body, model)) {
    printNextSteps({
      endpoint: tagsEndpoint,
      model,
      reason: `Ollama is reachable, but model "${model}" was not found.`,
    });
    return;
  }

  console.log("[READY] local Ollama provider is reachable");
  console.log(`Endpoint: ${generateEndpoint}`);
  console.log(`Model: ${model}`);
  console.log("");
  console.log("Next: run npm run guidance:smoke:ollama, then npm run guidance:known-screen.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
