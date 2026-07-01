const TOKI_CANDIDATE_LIMIT = 80;

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function getElementLabel(element) {
  return normalizeText(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.innerText ||
      element.textContent ||
      element.value ||
      "",
  );
}

function getElementRole(element) {
  const explicitRole = normalizeText(element.getAttribute("role")).toLowerCase();
  const tagName = element.tagName.toLowerCase();

  if (explicitRole) {
    return `dom_${explicitRole}`;
  }

  if (tagName === "button") {
    return "dom_button";
  }

  if (tagName === "a") {
    return "dom_link";
  }

  if (tagName === "input") {
    return "dom_input";
  }

  if (tagName === "select") {
    return "dom_select";
  }

  if (tagName === "textarea") {
    return "dom_textarea";
  }

  return "dom_candidate";
}

function isVisibleCandidate(element, rect) {
  const style = window.getComputedStyle(element);

  return (
    rect.width >= 4 &&
    rect.height >= 4 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0
  );
}

function candidateId(label, index) {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "candidate";

  return `dom-${slug}-${index + 1}`;
}

function collectTokiDomCandidates() {
  const selector = [
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='tab']",
    "[role='menuitem']",
    "[aria-label]",
    "[data-testid]",
  ].join(",");
  const candidates = [];

  for (const element of document.querySelectorAll(selector)) {
    if (candidates.length >= TOKI_CANDIDATE_LIMIT) {
      break;
    }

    const rect = element.getBoundingClientRect();

    if (!isVisibleCandidate(element, rect)) {
      continue;
    }

    const label =
      getElementLabel(element) ||
      normalizeText(element.getAttribute("data-testid")) ||
      normalizeText(element.id);

    if (!label) {
      continue;
    }

    candidates.push({
      id: candidateId(label, candidates.length),
      label,
      role: getElementRole(element),
      source: "dom",
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      metadata: {
        tagName: element.tagName.toLowerCase(),
        href: element instanceof HTMLAnchorElement ? element.href : null,
        testId: normalizeText(element.getAttribute("data-testid")) || null,
      },
    });
  }

  return {
    source: "browser-extension",
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio,
    },
    candidates,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TOKI_COLLECT_DOM_CANDIDATES") {
    return false;
  }

  sendResponse(collectTokiDomCandidates());
  return true;
});
