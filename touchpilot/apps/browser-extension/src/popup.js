const statusElement = document.querySelector("#status");
const outputElement = document.querySelector("#output");
const collectButton = document.querySelector("#collect");

function setStatus(value) {
  statusElement.textContent = value;
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

  outputElement.textContent = JSON.stringify(
    {
      url: response.url,
      title: response.title,
      count: response.candidates.length,
      candidates: response.candidates.slice(0, 12),
    },
    null,
    2,
  );
  setStatus(`${response.candidates.length} found`);
}

collectButton.addEventListener("click", () => {
  collectCandidates().catch((error) => {
    setStatus("Error");
    outputElement.textContent = error instanceof Error ? error.message : String(error);
  });
});
