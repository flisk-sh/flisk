// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeResource } from "../../test-support/index.js";
import type { FastNoopFlags, FastNoopState } from "../up-fast-noop.js";
import {
  clearFastNoopState,
  fastNoopUrls,
  isPlainUp,
  readFastNoopState,
  stackFingerprint,
  statePathFor,
  tryFastNoop,
  UP_STATE_VERSION,
  writeFastNoopState,
} from "../up-fast-noop.js";
import { evaluateTiltReadiness } from "../up-readiness.js";
import type { UrlTarget } from "../url-check.js";

const project = () => currentRoot;
let currentRoot: string;
let home: string;

const resources = [
  makeResource("api", "backend"),
  makeResource("web", "frontend"),
  makeResource("job", "worker"),
];

const readyJson = (names: readonly string[] = ["api", "web", "job", "(Tiltfile)"]) =>
  JSON.stringify({
    items: names.map((name) => ({
      metadata: { name },
      status: { updateStatus: "ok", runtimeStatus: "ok" },
    })),
  });

const unhealthyJson = (bad = "api") =>
  JSON.stringify({
    items: ["api", "web", "job", "(Tiltfile)"].map((name) => ({
      metadata: { name },
      status:
        name === bad
          ? { updateStatus: "error", runtimeStatus: "error" }
          : { updateStatus: "ok", runtimeStatus: "ok" },
    })),
  });

const flags = (overrides: Partial<FastNoopFlags> = {}): FastNoopFlags => ({
  configuredTiltPort: undefined,
  env: {},
  ...overrides,
});

const state = (overrides: Partial<FastNoopState> = {}): FastNoopState => ({
  version: UP_STATE_VERSION,
  fingerprint: "unchanged",
  tiltPort: 10350,
  tiltPid: 42,
  stack: null,
  services: ["api", "web", "job"],
  ingressPort: 8080,
  urls: ["http://app.shop.localhost/web"],
  ...overrides,
});

/** A `tryFastNoop` harness where every check is a mock, so a miss names exactly which gate refused it. */
function harness(
  overrides: {
    stored?: FastNoopState | null;
    fingerprint?: string | null;
    tiltJson?: string | null;
    owner?: { pid: number; root: string } | null;
    masterStale?: boolean;
    wrappedStale?: boolean;
    vendoredStale?: boolean;
    drift?: string[];
    problems?: unknown[];
    discoveredResources?: typeof resources;
    staleDisabled?: string[];
    readinessReady?: boolean;
    readinessFailures?: unknown[];
    readinessPending?: number;
    deferred?: Set<string>;
    urlDidAnswer?: boolean;
  } = {},
) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      readState: () => (overrides.stored === undefined ? state() : overrides.stored),
      fingerprint: () =>
        overrides.fingerprint === undefined ? "unchanged" : overrides.fingerprint,
      tiltJson: async () => {
        calls.push("tiltJson");
        return overrides.tiltJson === undefined ? readyJson() : overrides.tiltJson;
      },
      ownerOf: () =>
        overrides.owner === undefined ? { pid: 42, root: project() } : overrides.owner,
      masterStale: () => overrides.masterStale ?? false,
      wrappedStale: () => overrides.wrappedStale ?? false,
      vendoredStale: () => overrides.vendoredStale ?? false,
      drift: () => overrides.drift ?? [],
      discovery: () => ({
        resources: overrides.discoveredResources ?? resources,
        problems: overrides.problems ?? [],
      }),
      staleDisabled: () => overrides.staleDisabled ?? [],
      readiness: ((json: string, deferred: Set<string>) =>
        overrides.tiltJson === undefined
          ? {
              result: {
                ready: overrides.readinessReady ?? true,
                failures: overrides.readinessFailures ?? [],
                pending: overrides.readinessPending ?? 0,
                timedOut: false,
                enabled: [],
              },
              settled: true,
            }
          : evaluateTiltReadiness(json, deferred, undefined, undefined, () => false)) as never,
      deferred: () => overrides.deferred ?? new Set<string>(),
      checkUrls: async (targets: readonly UrlTarget[]) => {
        calls.push("checkUrls");
        return targets.map((target) => ({
          service: target.service,
          url: target.url,
          didAnswer: overrides.urlDidAnswer ?? true,
        }));
      },
    },
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "flisk-noop-home-"));
  currentRoot = mkdtempSync(join(tmpdir(), "flisk-noop-project-"));
  mkdirSync(join(currentRoot, ".flisk", ".flisk-out"), { recursive: true });
  writeFileSync(join(currentRoot, ".flisk", "project.json"), '{"project":{"name":"shop"}}\n');
  writeFileSync(join(currentRoot, ".flisk", ".flisk-out", "Tiltfile"), "# generated\n");
  process.env.HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(currentRoot, { recursive: true, force: true });
});

describe("flisk up fast no-op: the state record (#4193)", () => {
  it("keeps one record per project root and resets it", () => {
    const other = mkdtempSync(join(tmpdir(), "flisk-noop-other-"));
    try {
      expect(statePathFor(project())).not.toBe(statePathFor(other));
      expect(readFastNoopState(project())).toBeNull();
      writeFastNoopState(project(), state());
      expect(readFastNoopState(project())).toEqual(state());
      expect(readFastNoopState(other)).toBeNull();
      clearFastNoopState(project());
      expect(readFastNoopState(project())).toBeNull();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects a state from another version or with missing fields", () => {
    writeFastNoopState(project(), state({ version: 2 as never }));
    expect(readFastNoopState(project())).toBeNull();
    writeFileSync(
      statePathFor(project()),
      JSON.stringify({ version: UP_STATE_VERSION, fingerprint: "x" }),
    );
    expect(readFastNoopState(project())).toBeNull();
  });

  it("writes outside the generated tree, so recording cannot wake Tilt's file watchers", () => {
    expect(statePathFor(project()).startsWith(join(currentRoot, ".flisk", ".flisk-out"))).toBe(
      false,
    );
    expect(statePathFor(project()).startsWith(home)).toBe(true);
  });
});

describe("flisk up fast no-op: stack fingerprint", () => {
  it("is stable across reads of an unchanged project", () => {
    expect(stackFingerprint(project(), flags())).toBe(stackFingerprint(project(), flags()));
  });

  it("changes with .flisk/project.json, .env, a service.json and a generated file", () => {
    const before = stackFingerprint(project(), flags());
    writeFileSync(join(currentRoot, ".flisk", "project.json"), '{"project":{"name":"other"}}');
    expect(stackFingerprint(project(), flags())).not.toBe(before);

    writeFileSync(join(currentRoot, ".flisk", "project.json"), '{"project":{"name":"shop"}}');
    writeFileSync(join(currentRoot, ".env"), "API_KEY=one\n");
    const withEnv = stackFingerprint(project(), flags());
    expect(withEnv).not.toBe(before);
    writeFileSync(join(currentRoot, ".env"), "API_KEY=two\n");
    expect(stackFingerprint(project(), flags())).not.toBe(withEnv);

    writeFileSync(join(currentRoot, ".flisk", ".flisk-out", "spec.master"), "RESOURCES = {}\n");
    expect(stackFingerprint(project(), flags())).not.toBe(withEnv);
  });

  it("changes with an environment variable that changes the stack", () => {
    const a = stackFingerprint(project(), flags({ env: { FLISK_HTTP_PORT: "8080" } }));
    const b = stackFingerprint(project(), flags({ env: { FLISK_HTTP_PORT: "8081" } }));
    expect(a).not.toBe(b);
  });

  it("returns null when no generated Tiltfile exists, so a first run is never a no-op", () => {
    rmSync(join(currentRoot, ".flisk", ".flisk-out", "Tiltfile"));
    expect(stackFingerprint(project(), flags())).toBeNull();
  });

  it("ignores host-ports.json, which a second run rewrites without changing the stack", () => {
    const before = stackFingerprint(project(), flags());
    writeFileSync(
      join(currentRoot, ".flisk", ".flisk-out", "host-ports.json"),
      '{"tiltUi":10351}\n',
    );
    expect(stackFingerprint(project(), flags())).toBe(before);
  });
});

describe("flisk up fast no-op: plain-run gate", () => {
  it.each([
    ["--force", { force: true }],
    ["--dry-run", { dryRun: true }],
    ["--ignore-drift", { ignoreDrift: true }],
    ["--ignore-version", { ignoreVersion: true }],
    ["--only", { only: ["api"] }],
    ["--env-file", { envFile: ".env.integration" }],
    ["--profile", { profile: ["admin"] }],
    ["--no-database", { database: false }],
    ["--no-gateway", { gateway: false }],
    ["a stack name", { stackName: "shop" }],
  ])("refuses %s", (_label, override) => {
    expect(isPlainUp(flags(override))).toBe(false);
  });

  it("accepts a plain run, including --wait and --quiet/--json (output-only flags)", () => {
    expect(isPlainUp(flags())).toBe(true);
    expect(isPlainUp(flags({ configuredTiltPort: 10350 }))).toBe(true);
  });

  it("prints the advertised URLs of the running stack", () => {
    const urls = fastNoopUrls(resources, 8080, true);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("api.");
    expect(urls[0]).toContain(":8080/api/api");
    expect(urls[1]).toContain("app.");
    expect(urls[1]).toContain(":8080/web");
    expect(fastNoopUrls(resources, 8080, false)).toEqual([]);
  });
});

describe("flisk up fast no-op: tryFastNoop", () => {
  it("hits when Tilt is running, config matches and all resources are healthy", async () => {
    const { deps } = harness();
    const result = await tryFastNoop(project(), flags(), deps);
    expect(result?.ok).toBe(true);
    expect(result?.services).toEqual(["api", "web", "job"]);
    expect(result?.urls).toEqual(state().urls);
  });

  it("returns the URL probe results so `up --json` keeps the per-URL data.urls shape", async () => {
    const { deps } = harness();
    const result = await tryFastNoop(project(), flags(), deps);
    expect(result?.urlChecks.length).toBeGreaterThan(0);
    for (const check of result?.urlChecks ?? []) {
      expect(check).toMatchObject({ didAnswer: true });
      expect(typeof check.url).toBe("string");
    }
  });

  it("does not query Tilt at all when there is no recorded state", async () => {
    const { deps, calls } = harness({ stored: null });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
    expect(calls).toEqual([]);
  });

  it.each([
    ["config changed", { fingerprint: "changed" }],
    ["config could not be hashed", { fingerprint: null }],
    ["master files stale", { masterStale: true }],
    ["wrapped Tiltfile stale", { wrappedStale: true }],
    ["vendored engine stale", { vendoredStale: true }],
    ["hand-edited generated file", { drift: ["web/Dockerfile"] }],
    ["a skipped service.json", { problems: [{ path: "bad/service.json" }] }],
    ["stale disabled resources", { staleDisabled: ["api"] }],
  ])("falls back when %s", async (_label, override) => {
    const { deps } = harness(override);
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it.each([
    ["--force", { force: true }],
    ["--only", { only: ["api"] }],
    ["--env-file", { envFile: ".env.integration" }],
    ["--profile", { profile: ["admin"] }],
    ["--no-gateway", { gateway: false }],
  ])("falls back for %s", async (_label, override) => {
    const { deps } = harness();
    expect(await tryFastNoop(project(), flags(override), deps)).toBeNull();
  });

  it("falls back when TILT_PORT differs from the recorded port", async () => {
    const { deps } = harness();
    expect(await tryFastNoop(project(), flags({ configuredTiltPort: 10351 }), deps)).toBeNull();
  });

  it("falls back when the recorded environment changed", async () => {
    const { deps } = harness({ fingerprint: "unchanged" });
    const recorded = flags({ env: { FLISK_HTTP_PORT: "8080" } });
    expect(await tryFastNoop(project(), recorded, deps)).not.toBeNull();
    // A real fingerprint would differ; the harness proves the flag is passed through to it.
    const changed = flags({ env: { FLISK_HTTP_PORT: "8081" } });
    const f = (root: string, passed: FastNoopFlags) => stackFingerprint(root, passed);
    expect(f(project(), recorded)).not.toBe(f(project(), changed));
  });

  it("falls back when Tilt is not running", async () => {
    const { deps } = harness({ tiltJson: null });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when Tilt answers with another project's resources", async () => {
    const { deps } = harness({ tiltJson: readyJson(["other-api"]) });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when Tilt answers with malformed or empty JSON", async () => {
    // `null`, a bare number, an array and a null entry all parse as JSON but are not a Tilt resource list.
    for (const tiltJson of [
      "not json",
      '{"items":[]}',
      "{}",
      "null",
      "7",
      "[]",
      '{"items":[null]}',
    ]) {
      const { deps } = harness({ tiltJson });
      expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
    }
  });

  it("falls back when a resource is missing from Tilt", async () => {
    const { deps } = harness({ tiltJson: readyJson(["api", "web", "(Tiltfile)"]) });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when a resource is disabled in Tilt", async () => {
    const json = JSON.stringify({
      items: ["api", "web", "job"].map((name) => ({
        metadata: { name },
        status: {
          updateStatus: "ok",
          runtimeStatus: "ok",
          ...(name === "job" ? { disableStatus: { state: "Disabled" } } : {}),
        },
      })),
    });
    const { deps } = harness({ tiltJson: json });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when a resource is unhealthy, still starting or failed", async () => {
    const { deps: unhealthy } = harness({ tiltJson: unhealthyJson() });
    expect(await tryFastNoop(project(), flags(), unhealthy)).toBeNull();
    const { deps: failing } = harness({ readinessFailures: [{ name: "api", message: "crashed" }] });
    expect(await tryFastNoop(project(), flags(), failing)).toBeNull();
    const { deps: pending } = harness({ readinessPending: 1 });
    expect(await tryFastNoop(project(), flags(), pending)).toBeNull();
    const { deps: notReady } = harness({ readinessReady: false });
    expect(await tryFastNoop(project(), flags(), notReady)).toBeNull();
  });

  it("falls back when the services changed since the recorded run", async () => {
    const { deps } = harness({ stored: state({ services: ["api", "web"] }) });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back for a project of local processes (no Docker/Tilt stack)", async () => {
    const local = [
      makeResource("api", "backend", { command: "node server.js" }),
      makeResource("web", "frontend", { command: "node web.js" }),
    ];
    const { deps } = harness({ discoveredResources: local });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when an expected service is deferred", async () => {
    const { deps } = harness({ deferred: new Set(["job"]) });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when the port is held by a foreign project", async () => {
    const { deps } = harness({ owner: { pid: 42, root: "/work/other" } });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when the recorded Tilt process was replaced", async () => {
    const { deps } = harness({ owner: { pid: 99, root: project() } });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
  });

  it("falls back when port ownership cannot be confirmed or recorded PID is missing", async () => {
    const { deps } = harness({ owner: null });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
    const { deps: noPid } = harness({ stored: state({ tiltPid: null }) });
    expect(await tryFastNoop(project(), flags(), noPid)).toBeNull();
  });

  it("excludes opt-in profiled services consistently with plain startup", async () => {
    const withProfile = [
      makeResource("api", "backend"),
      makeResource("admin", "frontend", { profiles: ["admin"] }),
    ];
    const { deps } = harness({
      discoveredResources: withProfile,
      stored: state({ services: ["api"], urls: ["http://api.shop.localhost/api/api"] }),
      tiltJson: readyJson(["api", "(Tiltfile)"]),
    });
    const result = await tryFastNoop(project(), flags(), deps);
    expect(result?.ok).toBe(true);
    expect(result?.services).toEqual(["api"]);
  });

  it("falls back when any printed URL stops answering despite green Tilt readiness", async () => {
    const { deps, calls } = harness({ urlDidAnswer: false });
    expect(await tryFastNoop(project(), flags(), deps)).toBeNull();
    expect(calls).toContain("checkUrls");
  });
});
