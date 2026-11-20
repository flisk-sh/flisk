// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, test } from "bun:test";
import {
  COMPOSE_START_TIMEOUT_MS,
  DEFAULT_PROXY_PORT,
  EARLY_RESPONSE_MS,
  MAX_EARLY_RESPONSE_MS,
  RETRY_AFTER_SECONDS,
  TILT_TRIGGER_TIMEOUT_MS,
  decideWakeAction,
  earlyResponseMs,
  evaluateReadiness,
  isGatewayLivenessProbe,
  resolveProxyPort,
  wakeTimeoutMs,
} from "./decide";

describe("decideWakeAction", () => {
  test("never-created resource: tilt trigger only, no Sablier start", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "absent",
      dependencies: [],
    });
    expect(action.tiltTriggerNames).toEqual(["data-governance-api"]);
    expect(action.useSablierStart).toBe(false);
  });

  test("previously-run, now-exited resource: both tilt trigger and Sablier start", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "exited",
      dependencies: [],
    });
    expect(action.tiltTriggerNames).toEqual(["data-governance-api"]);
    expect(action.useSablierStart).toBe(true);
  });

  test("created-but-not-started resource: both paths apply", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "created",
      dependencies: [],
    });
    expect(action.useSablierStart).toBe(true);
  });

  test("already running: no trigger needed", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "running",
      dependencies: [],
    });
    expect(action.tiltTriggerNames).toEqual([]);
    expect(action.useSablierStart).toBe(false);
  });

  test("cold dependency is triggered alongside the resource (task 1.5 finding)", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "absent",
      dependencies: [
        { name: "postgres", state: "running" },
        { name: "data-governance-api-db-migrator", state: "absent" },
      ],
    });
    expect(action.tiltTriggerNames).toEqual([
      "data-governance-api",
      "data-governance-api-db-migrator",
    ]);
  });

  test("never-created resource with compose details: started directly, not queued in Tilt", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "absent",
      dependencies: [{ name: "peer-api", state: "absent" }],
      hasComposeInvocation: true,
    });
    expect(action.useComposeStart).toBe(true);
    // Dependencies carry no compose details, so they still go through Tilt.
    expect(action.tiltTriggerNames).toEqual(["peer-api"]);
    expect(action.useSablierStart).toBe(false);
  });

  test("existing (exited) container keeps the Sablier path even with compose details", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "exited",
      dependencies: [],
      hasComposeInvocation: true,
    });
    expect(action.useComposeStart).toBe(false);
    expect(action.tiltTriggerNames).toEqual(["data-governance-api"]);
    expect(action.useSablierStart).toBe(true);
  });

  test("running dependency is not re-triggered", () => {
    const action = decideWakeAction({
      resourceContainerName: "data-governance-api",
      resourceState: "running",
      dependencies: [{ name: "postgres", state: "running" }],
    });
    expect(action.tiltTriggerNames).toEqual([]);
  });
});

describe("wakeTimeoutMs", () => {
  test("a direct compose start only waits for boot + healthcheck", () => {
    expect(wakeTimeoutMs(true)).toBe(COMPOSE_START_TIMEOUT_MS);
  });

  test("the tilt trigger path allows for an image build, under Bun's 255s idle cap", () => {
    expect(wakeTimeoutMs(false)).toBe(TILT_TRIGGER_TIMEOUT_MS);
    expect(TILT_TRIGGER_TIMEOUT_MS).toBeLessThan(255_000);
  });

  test("an explicit X-Wake-Timeout-Ms wins", () => {
    expect(wakeTimeoutMs(false, 5_000)).toBe(5_000);
  });
});

describe("earlyResponseMs", () => {
  test("holds a waking request for EARLY_RESPONSE_MS by default", () => {
    expect(earlyResponseMs()).toBe(EARLY_RESPONSE_MS);
  });

  test("the default answers well before Bun's 255s idle cap drops the connection", () => {
    expect(EARLY_RESPONSE_MS).toBeLessThan(255_000);
  });

  test("an explicit X-Wake-Respond-Within-Ms wins, but is capped under Bun's idle limit", () => {
    expect(earlyResponseMs(5_000)).toBe(5_000);
    expect(earlyResponseMs(600_000)).toBe(MAX_EARLY_RESPONSE_MS);
    expect(MAX_EARLY_RESPONSE_MS).toBeLessThan(255_000);
  });

  test("tells the caller to retry soon", () => {
    expect(RETRY_AFTER_SECONDS).toBeGreaterThan(0);
    expect(RETRY_AFTER_SECONDS * 1000).toBeLessThan(EARLY_RESPONSE_MS);
  });
});

describe("evaluateReadiness", () => {
  test("ready once every required name reports healthy", () => {
    const outcome = evaluateReadiness(["a", "b"], { a: true, b: true });
    expect(outcome.ready).toBe(true);
    expect(outcome.pending).toEqual([]);
  });

  test("not ready while some names are still unhealthy", () => {
    const outcome = evaluateReadiness(["a", "b"], { a: true, b: false });
    expect(outcome.ready).toBe(false);
    expect(outcome.pending).toEqual(["b"]);
  });

  test("missing entries count as not healthy", () => {
    const outcome = evaluateReadiness(["a", "b"], { a: true });
    expect(outcome.ready).toBe(false);
    expect(outcome.pending).toEqual(["b"]);
  });
});

describe("isGatewayLivenessProbe", () => {
  test("a bare GET /health from the image HEALTHCHECK is answered by the gateway", () => {
    expect(isGatewayLivenessProbe("GET", "/health", new Headers())).toBe(true);
  });

  test("a backend /health routed through the wake gateway is proxied, not answered", () => {
    const routed = new Headers({ "X-Wake-Resource": "cold-api", "X-Wake-Container": "cold-api-1" });
    expect(isGatewayLivenessProbe("GET", "/health", routed)).toBe(false);
  });

  test("other methods and paths are not liveness probes", () => {
    expect(isGatewayLivenessProbe("POST", "/health", new Headers())).toBe(false);
    expect(isGatewayLivenessProbe("GET", "/health/ready", new Headers())).toBe(false);
  });
});

describe("resolveProxyPort", () => {
  // The route generator writes a deterministic `${FLISK_SERVICE_<NAME>_PORT:-default}` placeholder for an auto port
  // (#4683); the resolved number must never appear in the generated file, so the gateway reads it at proxy time.
  const PLACEHOLDER = "${FLISK_SERVICE_COLD_API_PORT:-4000}";

  test("a fixed-port route passes its number through unchanged", () => {
    expect(resolveProxyPort("4604")).toBe("4604");
  });

  test("an auto-port placeholder resolves to the PORT Compose baked into the container", () => {
    const env = ["NODE_ENV=development", "PORT=4107", "HOSTNAME=0.0.0.0"].join("\n");
    expect(resolveProxyPort(PLACEHOLDER, env)).toBe("4107");
  });

  test("a container that cannot be inspected falls back to the placeholder's own default", () => {
    expect(resolveProxyPort(PLACEHOLDER, undefined)).toBe("4000");
    expect(resolveProxyPort(PLACEHOLDER, "")).toBe("4000");
  });

  test("a container whose PORT is not numeric falls back to the placeholder's default", () => {
    expect(resolveProxyPort(PLACEHOLDER, "PORT=${FLISK_SERVICE_COLD_API_PORT:-4000}\n")).toBe("4000");
  });

  test("a header with no readable port falls back to the default port", () => {
    expect(resolveProxyPort("")).toBe(DEFAULT_PROXY_PORT);
    expect(resolveProxyPort("${UNPARSEABLE")).toBe(DEFAULT_PROXY_PORT);
  });
});
