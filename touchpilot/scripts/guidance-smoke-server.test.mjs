import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  handleGuidanceSmokeRequest,
  validateGuidanceProviderRequest,
} from "./guidance-smoke-server.mjs";

const validRequest = {
  goal: "Show me what to click next.",
  screen: {
    display: {
      id: "display-1",
      width: 1440,
      height: 900,
      scaleFactor: 2,
    },
    screenshot: {
      source: "full_screen",
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 2,
      },
      capturedAt: "2026-06-26T00:00:00.000Z",
      format: "png",
      byteLength: 1024,
      imageWidth: 2880,
      imageHeight: 1800,
    },
    screenshotPayload: {
      encoding: "base64",
      format: "png",
      byteLength: 1024,
      imageWidth: 2880,
      imageHeight: 1800,
      imageBase64: "iVBORw0KGgo=",
    },
    calibration: {
      status: "aligned",
      overlayWidth: 1440,
      overlayHeight: 900,
      displayWidth: 1440,
      displayHeight: 900,
      scaleFactor: 2,
      notes: "Test calibration.",
    },
  },
};

function createRequest(method, url, body = "") {
  const request = Readable.from(body ? [body] : []);
  request.method = method;
  request.url = url;
  return request;
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

test("validateGuidanceProviderRequest accepts the smoke contract", () => {
  assert.deepEqual(validateGuidanceProviderRequest(validRequest), []);
});

test("validateGuidanceProviderRequest requires screen evidence", () => {
  assert.deepEqual(validateGuidanceProviderRequest({ goal: "" }), [
    "goal is required",
    "screen is required",
  ]);
});

test("guidance smoke server exposes health check", async () => {
  const response = createResponse();

  await handleGuidanceSmokeRequest(createRequest("GET", "/health"), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().service, "toki-guidance-smoke");
});

test("guidance smoke server returns unavailable until provider is wired", async () => {
  const response = createResponse();

  await handleGuidanceSmokeRequest(
    createRequest("POST", "/api/guidance/smoke", JSON.stringify(validRequest)),
    response,
  );

  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.mode, "unavailable");
  assert.equal(body.providerName, "dev-smoke-server");
  assert.match(body.error, /no real provider is wired yet/);
});
