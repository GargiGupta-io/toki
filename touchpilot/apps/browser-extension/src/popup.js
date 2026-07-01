const statusElement = document.querySelector("#status");
const outputElement = document.querySelector("#output");
const collectButton = document.querySelector("#collect");
const copyButton = document.querySelector("#copy");
const downloadButton = document.querySelector("#download");
let latestPayload = null;

function setStatus(value) {
  statusElement.textContent = value;
}

function createBridgePayload(response) {
  return {
    schemaVersion: 1,
    source: "browser-extension",
    capturedAt: new Date().toISOString(),
    page: {
      url: response.url,
      title: response.title,
    },
    viewport: response.viewport,
    candidates: response.candidates,
  };
}

function setExportEnabled(enabled) {
  copyButton.disabled = !enabled;
  downloadButton.disabled = !enabled;
}

async function collectCandidates() {
  setStatus("Collecting");
  outputElement.textContent = "";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "TOKI_COLLECT_DOM_CANDIDATES",
  });
  latestPayload = createBridgePayload(response);

  outputElement.textContent = JSON.stringify(
    {
      page: latestPayload.page,
      viewport: latestPayload.viewport,
      count: latestPayload.candidates.length,
      candidates: latestPayload.candidates.slice(0, 12),
    },
    null,
    2,
  );
  setExportEnabled(true);
  setStatus(`${response.candidates.length} found`);
}

collectButton.addEventListener("click", () => {
  collectCandidates().catch((error) => {
    setStatus("Error");
    setExportEnabled(false);
    outputElement.textContent = error instanceof Error ? error.message : String(error);
  });
});

copyButton.addEventListener("click", () => {
  if (latestPayload == null) {
    return;
  }

  navigator.clipboard
    .writeText(JSON.stringify(latestPayload, null, 2))
    .then(() => setStatus("Copied"))
    .catch((error) => {
      setStatus("Copy failed");
      outputElement.textContent = error instanceof Error ? error.message : String(error);
    });
});

downloadButton.addEventListener("click", () => {
  if (latestPayload == null) {
    return;
  }

  const blob = new Blob([JSON.stringify(latestPayload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "toki-browser-candidates.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Downloaded");
});
