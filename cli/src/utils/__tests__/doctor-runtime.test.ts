// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  checkHealthRoutes,
  checkIngressPorts,
  checkPrivateNpmRegistry,
  describeTiltFailure,
  findForeignIngressHolders,
  findMissingHealthRoutes,
  getDeferredResourceNames,
  HOST_PORT_FIXES,
  HOST_PORTS,
  INGRESS_PORTS,
  isInfraTiltFailure,
  isOwnIngressContainer,
  isRegistryRelatedBuildError,
  orderTiltFailures,
  parsePublishedPortHolders,
  parseTiltResourceFailures,
  probeContainerRuntimeError,
  projectConfigEnablesVerdaccio,
  projectExpectsVerdaccio,
  resolveHealthPaths,
  shellQuote,
  summarizeAdvertisedProbes,
  summarizeServiceProbes,
  summarizeSmokeResults,
  summarizeTiltBuildError,
  toComposeProjectPrefix,
} from "../doctor-runtime.js";

describe("doctor-runtime utilities", () => {
  describe("shellQuote", () => {
    it("wraps strings in single quotes and escapes inner single quotes", () => {
      expect(shellQuote("simple")).toBe("'simple'");
      expect(shellQuote("it's a test")).toBe("'it'\\''s a test'");
      expect(shellQuote("")).toBe("''");
      expect(shellQuote("$VAR `id` $(echo hi)")).toBe("'$VAR `id` $(echo hi)'");
    });
  });

  describe("toComposeProjectPrefix", () => {
    it("replaces hyphens with underscores", () => {
      expect(toComposeProjectPrefix("my-cool-project")).toBe("my_cool_project");
      expect(toComposeProjectPrefix("a-b-c-d")).toBe("a_b_c_d");
      expect(toComposeProjectPrefix("simple_project")).toBe("simple_project");
      expect(toComposeProjectPrefix("lowercase")).toBe("lowercase");
    });
  });

  describe("parsePublishedPortHolders", () => {
    it("parses container lines and matches requested host ports", () => {
      const psOutput = [
        "c_traefik\t0.0.0.0:80->80/tcp, :::80->80/tcp, 0.0.0.0:443->443/tcp",
        "c_postgres\t127.0.0.1:5432->5432/tcp",
        "c_unrelated\t0.0.0.0:8080->80/tcp, 0.0.0.0:1080->80/tcp",
        "",
      ].join("\n");

      const holders = parsePublishedPortHolders(psOutput, [80, 443]);
      expect(holders).toHaveLength(1);
      expect(holders[0]?.name).toBe("c_traefik");
      expect(holders[0]?.publishedPorts).toEqual([80, 443]);
    });

    it("does not match prefix or suffix numbers that merely contain the port digits", () => {
      const psOutput = "web\t0.0.0.0:1080->80/tcp, 0.0.0.0:8000->80/tcp";
      const holders = parsePublishedPortHolders(psOutput, [80]);
      expect(holders).toHaveLength(0);
    });

    it("matches port without leading IP address (e.g. 80->80/tcp)", () => {
      const psOutput = "simple_proxy\t80->80/tcp";
      const holders = parsePublishedPortHolders(psOutput, [80]);
      expect(holders).toHaveLength(1);
      expect(holders[0]?.publishedPorts).toEqual([80]);
    });

    it("handles empty or whitespace lines gracefully", () => {
      expect(parsePublishedPortHolders("", [80])).toEqual([]);
      expect(parsePublishedPortHolders("   \n\n  \t  \n", [80])).toEqual([]);
    });
  });

  describe("isOwnIngressContainer", () => {
    it("recognizes own Traefik container naming conventions case-insensitively", () => {
      expect(isOwnIngressContainer("my_proj_traefik", "my_proj")).toBe(true);
      expect(isOwnIngressContainer("my_proj_traefik_1", "my_proj")).toBe(true);
      expect(isOwnIngressContainer("my_proj_traefik-1", "my_proj")).toBe(true);
      expect(isOwnIngressContainer("MY_PROJ_TRAEFIK_1", "my_proj")).toBe(true);
      expect(isOwnIngressContainer("my_proj_traefik_web", "my_proj")).toBe(true);
    });

    it("rejects other project containers or unrelated proxies", () => {
      expect(isOwnIngressContainer("other_proj_traefik", "my_proj")).toBe(false);
      expect(isOwnIngressContainer("traefik", "my_proj")).toBe(false);
      expect(isOwnIngressContainer("nginx_proxy", "my_proj")).toBe(false);
      expect(isOwnIngressContainer("my_proj_api", "my_proj")).toBe(false);
    });
  });

  describe("findForeignIngressHolders", () => {
    it("filters out own ingress containers and retains foreign ones", () => {
      const holders = [
        { name: "my_proj_traefik", ports: "80->80/tcp", publishedPorts: [80] },
        { name: "foreign_nginx", ports: "80->80/tcp", publishedPorts: [80] },
      ];
      const foreign = findForeignIngressHolders(holders, "my_proj");
      expect(foreign).toHaveLength(1);
      expect(foreign[0]?.name).toBe("foreign_nginx");
    });
  });

  describe("getDeferredResourceNames", () => {
    it("returns resource names that enable Sablier with deferStart", () => {
      const resources: DiscoveredResource[] = [
        {
          name: "cold-api",
          path: "/path/cold",
          configPath: "/path/cold/service.json",
          stack: "main",
          type: "backend",
          config: {
            appName: "cold-api",
            appType: "backend",
            sablier: { enable: true, deferStart: true },
          },
        },
        {
          name: "always-on",
          path: "/path/always",
          configPath: "/path/always/service.json",
          stack: "main",
          type: "backend",
          config: {
            appName: "always-on",
            appType: "backend",
            sablier: { enable: true, deferStart: false },
          },
        },
        {
          name: "no-sablier",
          path: "/path/none",
          configPath: "/path/none/service.json",
          stack: "main",
          type: "backend",
          config: { appName: "no-sablier", appType: "backend" },
        },
      ];

      const deferred = getDeferredResourceNames(resources);
      expect(deferred.has("cold-api")).toBe(true);
      expect(deferred.has("always-on")).toBe(false);
      expect(deferred.has("no-sablier")).toBe(false);
    });
  });

  describe("parseTiltResourceFailures", () => {
    it("categorizes ok, error, pending, and deferred resources", () => {
      const tiltJson = JSON.stringify({
        items: [
          {
            metadata: { name: "healthy-api" },
            status: { updateStatus: "ok", runtimeStatus: "ok" },
          },
          {
            metadata: { name: "failed-build" },
            status: {
              updateStatus: "error",
              runtimeStatus: "none",
              buildHistory: [{ error: "ImageBuild: syntax error" }],
            },
          },
          {
            metadata: { name: "unhealthy-runtime" },
            status: {
              updateStatus: "ok",
              runtimeStatus: "error",
            },
          },
          {
            metadata: { name: "starting-service" },
            status: { updateStatus: "in_progress", runtimeStatus: "pending" },
          },
          {
            metadata: { name: "lazy-worker" },
            status: { updateStatus: "pending", runtimeStatus: "none" },
          },
          {
            metadata: { name: "(Tiltfile)" },
            status: { updateStatus: "ok", runtimeStatus: "not_applicable" },
          },
        ],
      });

      const deferred = new Set(["lazy-worker"]);
      const parsed = parseTiltResourceFailures(tiltJson, deferred);

      expect(parsed.total).toBe(6);
      expect(parsed.okCount).toBe(2); // healthy-api and (Tiltfile)
      expect(parsed.failures).toHaveLength(2);
      expect(parsed.failures.map((f) => f.name)).toEqual(["failed-build", "unhealthy-runtime"]);
      expect(parsed.deferredCount).toBe(1); // lazy-worker
      expect(parsed.pendingCount).toBe(1); // starting-service
    });
  });

  describe("summarizeTiltBuildError", () => {
    it("summarizes host port already allocated error", () => {
      const err =
        "Error response from daemon: Bind for 0.0.0.0:80 failed: port is already allocated";
      expect(summarizeTiltBuildError(err)).toBe("host port 80 is already allocated");
    });

    it("summarizes private registry ConnectionRefused with package manifests", () => {
      const err =
        "ConnectionRefused downloading package manifest @flisk-sh/sdk ConnectionRefused downloading package manifest @scope/tools";
      const summary = summarizeTiltBuildError(err);
      expect(summary).toContain(
        "private registry ConnectionRefused for @flisk-sh/sdk, @scope/tools",
      );
      expect(summary).toContain("Verdaccio (:4873) is down");
    });

    it("summarizes golden base image pull failure", () => {
      const err =
        "failed to resolve source metadata for docker.io/library/myproject-l1-backend: not found";
      const summary = summarizeTiltBuildError(err);
      expect(summary).toContain("base image myproject-l1-backend was missing");
    });

    it("summarizes dependency install failure during ImageBuild", () => {
      expect(summarizeTiltBuildError("bun install --production failed")).toContain(
        "dependency install failed during ImageBuild",
      );
      expect(summarizeTiltBuildError("install-deps.sh exited with 1")).toContain(
        "dependency install failed during ImageBuild",
      );
      expect(summarizeTiltBuildError("npm ci failed")).toContain(
        "dependency install failed during ImageBuild",
      );
    });

    it("summarizes missing compose image", () => {
      const err =
        "docker compose up -d --no-build orders-api failed: No such image: orders-api:dev";
      const summary = summarizeTiltBuildError(err);
      expect(summary).toContain("compose run failed because image is missing");
      expect(summary).toContain("orders-api");
    });

    it("summarizes bun run build compile failure", () => {
      const err = "ImageBuild: bun run build failed with code 1";
      const summary = summarizeTiltBuildError(err);
      expect(summary).toContain("ImageBuild failed during `bun run build` (compile/typecheck)");
    });
  });

  describe("isRegistryRelatedBuildError", () => {
    it("detects registry-related errors and ignores unrelated errors", () => {
      expect(
        isRegistryRelatedBuildError("ConnectionRefused downloading package manifest @pkg"),
      ).toBe(true);
      expect(isRegistryRelatedBuildError("Verdaccio unreachable")).toBe(true);
      expect(isRegistryRelatedBuildError("private registry timed out")).toBe(true);
      expect(isRegistryRelatedBuildError("dependency install failed during ImageBuild")).toBe(true);
      expect(isRegistryRelatedBuildError("bun install failed")).toBe(true);
      expect(isRegistryRelatedBuildError("SyntaxError: Unexpected token")).toBe(false);
      expect(isRegistryRelatedBuildError("TypeScript check failed: TS2304")).toBe(false);
    });
  });

  describe("projectConfigEnablesVerdaccio & projectExpectsVerdaccio", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "flisk-verdaccio-test-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns true when optional_infra.verdaccio is true in project.json", () => {
      mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
      writeFileSync(
        join(tmpDir, ".tdk", "project.json"),
        JSON.stringify({ optional_infra: { verdaccio: true } }),
      );
      expect(projectConfigEnablesVerdaccio(tmpDir)).toBe(true);
      expect(projectExpectsVerdaccio(tmpDir)).toBe(true);
    });

    it("returns true when a phase includes verdaccio in enabledStacks", () => {
      mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
      writeFileSync(
        join(tmpDir, ".tdk", "project.json"),
        JSON.stringify({ phases: { dev: { enabledStacks: ["app", "verdaccio"] } } }),
      );
      expect(projectConfigEnablesVerdaccio(tmpDir)).toBe(true);
    });

    it("returns true when .npmrc references :4873 even if project.json does not", () => {
      mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
      writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({}));
      writeFileSync(join(tmpDir, ".npmrc"), "registry=http://localhost:4873/");
      expect(projectConfigEnablesVerdaccio(tmpDir)).toBe(false);
      expect(projectExpectsVerdaccio(tmpDir)).toBe(true);
    });

    it("returns false when verdaccio is nowhere configured", () => {
      mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
      writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({}));
      expect(projectConfigEnablesVerdaccio(tmpDir)).toBe(false);
      expect(projectExpectsVerdaccio(tmpDir)).toBe(false);
    });
  });

  describe("checkPrivateNpmRegistry", () => {
    it("skips when Verdaccio is not licensed and not referenced in npmrc", () => {
      const result = checkPrivateNpmRegistry(undefined, "/nonexistent", undefined, false);
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("needs a Premium license");
    });

    it("skips when Verdaccio is not expected for the project", () => {
      const result = checkPrivateNpmRegistry(undefined, "/nonexistent");
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("not enabled for this project");
    });
  });

  describe.skipIf(process.platform === "win32")("checkIngressPorts", () => {
    it("skips when docker command throws", () => {
      const fakeExec = () => {
        throw new Error("docker daemon down");
      };
      const result = checkIngressPorts(
        fakeExec as unknown as typeof execSync,
        "myproject",
        [80, 443],
      );
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("Docker not available");
    });

    it("passes when ingress ports are free", () => {
      const fakeExec = () => "c1\t8080->8080/tcp\n";
      const result = checkIngressPorts(
        fakeExec as unknown as typeof execSync,
        "myproject",
        [80, 443],
      );
      expect(result.didPass).toBe(true);
      expect(result.message).toContain("free for Traefik");
    });

    it("passes when ingress ports are held by own project Traefik", () => {
      const fakeExec = () => "myproject_traefik_1\t0.0.0.0:80->80/tcp\n";
      const result = checkIngressPorts(fakeExec as unknown as typeof execSync, "myproject", [80]);
      expect(result.didPass).toBe(true);
      expect(result.message).toContain("held by this project's Traefik");
    });

    it("fails when ingress ports are held by a foreign container", () => {
      const fakeExec = () => "foreign_proxy\t0.0.0.0:80->80/tcp\n";
      const result = checkIngressPorts(fakeExec as unknown as typeof execSync, "myproject", [80]);
      expect(result.didPass).toBe(false);
      expect(result.message).toContain("foreign_proxy (host ports 80)");
      expect(result.fix).toContain("docker stop foreign_proxy");
    });
  });

  describe("isInfraTiltFailure & orderTiltFailures", () => {
    it("identifies infrastructure failures", () => {
      expect(isInfraTiltFailure("traefik")).toBe(true);
      expect(isInfraTiltFailure("postgres")).toBe(true);
      expect(isInfraTiltFailure("nats-server")).toBe(true);
      expect(isInfraTiltFailure("verdaccio.service")).toBe(true);
      expect(isInfraTiltFailure("proxy")).toBe(true);
      expect(isInfraTiltFailure("user-api")).toBe(false);
      expect(isInfraTiltFailure("frontend-web")).toBe(false);
      expect(isInfraTiltFailure("orders-worker")).toBe(false);
    });

    it("orders infrastructure failures ahead of user services", () => {
      const failures = [
        { name: "web", updateStatus: "error", runtimeStatus: "ok", error: "err" },
        { name: "postgres", updateStatus: "error", runtimeStatus: "ok", error: "err" },
        { name: "api", updateStatus: "error", runtimeStatus: "ok", error: "err" },
        { name: "traefik", updateStatus: "error", runtimeStatus: "ok", error: "err" },
      ];
      const ordered = orderTiltFailures(failures);
      expect(ordered.map((f) => f.name)).toEqual(["postgres", "traefik", "api", "web"]);
    });
  });

  describe("probeContainerRuntimeError & describeTiltFailure", () => {
    it.skipIf(process.platform === "win32")("extracts Kafka unreachable error from logs", () => {
      const fakeExec = (cmd: string) => {
        if (cmd.includes("docker ps")) return "myproj-orders-autogenerated-payment-1\n";
        if (cmd.includes("docker logs")) return "getaddrinfo ENOTFOUND kafka:9092";
        return "";
      };
      const error = probeContainerRuntimeError(
        "payment",
        fakeExec as unknown as typeof execSync,
        "myproj",
      );
      expect(error).toContain("Kafka broker unreachable");
    });

    it.skipIf(process.platform === "win32")("extracts ZodError missing paths from logs", () => {
      const fakeExec = (cmd: string) => {
        if (cmd.includes("docker ps")) return "api\n";
        if (cmd.includes("docker logs")) {
          return 'ZodError: [\n  {\n    "code": "invalid_type",\n    "path": ["DATABASE_URL"]\n  }\n]';
        }
        return "";
      };
      const error = probeContainerRuntimeError(
        "api",
        fakeExec as unknown as typeof execSync,
        "myproj",
      );
      expect(error).toContain("ZodError missing required config/env: DATABASE_URL");
    });

    it("describes tilt failures using build error when available", () => {
      const failure = {
        name: "api",
        updateStatus: "error",
        runtimeStatus: "none",
        error: "Bind for 0.0.0.0:80 failed: port is already allocated",
      };
      expect(describeTiltFailure(failure)).toBe("host port 80 is already allocated");
    });
  });

  describe("resolveHealthPaths & findMissingHealthRoutes", () => {
    it("resolves default /health when unspecified", () => {
      expect(
        resolveHealthPaths({
          appName: "api",
          appType: "backend",
        }),
      ).toEqual({
        container: "/health",
        traefik: "/health",
      });
    });

    it("resolves customized health paths", () => {
      expect(
        resolveHealthPaths({
          appName: "api",
          appType: "backend",
          healthCheckPath: "/ready",
          traefik: { healthCheck: "/ping" },
        }),
      ).toEqual({
        container: "/ready",
        traefik: "/ping",
      });
    });

    it("finds missing health routes when source files do not contain the probe literal", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "flisk-missing-health-"));
      try {
        const srcDir = join(tmpDir, "src");
        mkdirSync(srcDir, { recursive: true });
        writeFileSync(join(srcDir, "index.ts"), 'console.log("No health route here");');

        const resources: DiscoveredResource[] = [
          {
            name: "billing-api",
            path: tmpDir,
            configPath: join(tmpDir, "service.json"),
            stack: "app",
            type: "backend",
            config: {
              appName: "billing-api",
              appType: "backend",
              healthCheckPath: "/health",
            },
          },
        ];

        const missing = findMissingHealthRoutes(resources);
        expect(missing).toHaveLength(1);
        expect(missing[0]?.name).toBe("billing-api");
        expect(missing[0]?.healthPath).toBe("/health");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("passes when source contains the route literal", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "flisk-valid-health-"));
      try {
        const srcDir = join(tmpDir, "src");
        mkdirSync(srcDir, { recursive: true });
        writeFileSync(join(srcDir, "index.ts"), 'app.get("/health", (c) => c.text("ok"));');

        const resources: DiscoveredResource[] = [
          {
            name: "billing-api",
            path: tmpDir,
            configPath: join(tmpDir, "service.json"),
            stack: "app",
            type: "backend",
            config: {
              appName: "billing-api",
              appType: "backend",
              healthCheckPath: "/health",
            },
          },
        ];

        const missing = findMissingHealthRoutes(resources);
        expect(missing).toHaveLength(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("checks health routes from empty project root without backends", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "flisk-check-health-"));
      try {
        const result = checkHealthRoutes(tmpDir);
        expect(result.name).toBe("Health Routes");
        expect(result.didPass).toBe(true);
        expect(result.isSkipped).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("summarizeSmokeResults", () => {
    it("handles empty, passing and failing smoke check results", () => {
      const skipped = summarizeSmokeResults([]);
      expect(skipped.isSkipped).toBe(true);
      expect(skipped.didPass).toBe(true);

      const passed = summarizeSmokeResults([{ name: "orders-api", ok: true }]);
      expect(passed.didPass).toBe(true);
      expect(passed.message).toContain("pass their smoke checks");

      const failed = summarizeSmokeResults([
        { name: "orders-api", ok: false, failure: "orders-api: 404 Not Found" },
      ]);
      expect(failed.didPass).toBe(false);
      expect(failed.message).toContain("1 service failing a smoke check");
      expect(failed.fix).toContain("service.json");
    });
  });

  describe("summarizeServiceProbes", () => {
    it("skips when no services answered", () => {
      const result = summarizeServiceProbes([
        { name: "api", appType: "backend", url: "http://api.local/health", ok: false },
      ]);
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("No services responded");
    });

    it("passes when all responding services are ok", () => {
      const result = summarizeServiceProbes([
        { name: "api", appType: "backend", url: "http://api.local/health", ok: true, status: 200 },
      ]);
      expect(result.didPass).toBe(true);
      expect(result.message).toContain("All 1 service responding on /health");
    });

    it("fails when a service returns 404 or 502 with helpful diagnosis", () => {
      const result = summarizeServiceProbes([
        { name: "api", appType: "backend", url: "http://api.local/health", ok: false, status: 404 },
        { name: "web", appType: "frontend", url: "http://web.local/health", ok: true, status: 200 },
      ]);
      expect(result.didPass).toBe(false);
      expect(result.message).toContain("1 service not healthy (1/2 healthy)");
      expect(result.message).toContain("Traefik is answering but has no route");
      expect(result.fix).toContain("images may still be building");
    });
  });

  describe("summarizeAdvertisedProbes", () => {
    it("skips when no advertised services responded", () => {
      const result = summarizeAdvertisedProbes([
        { name: "api", appType: "backend", url: "http://api.local/", ok: false },
      ]);
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
    });

    it("passes when all responding endpoints are reachable (non-404)", () => {
      const result = summarizeAdvertisedProbes([
        { name: "api", appType: "backend", url: "http://api.local/", ok: true, status: 200 },
        { name: "docs", appType: "frontend", url: "http://docs.local/", ok: true, status: 302 },
      ]);
      expect(result.didPass).toBe(true);
      expect(result.message).toBe("2 advertised endpoints reachable");
    });

    it("warns when an advertised endpoint returns 404", () => {
      const result = summarizeAdvertisedProbes([
        { name: "api", appType: "backend", url: "http://api.local/", ok: false, status: 404 },
      ]);
      expect(result.didPass).toBe(true);
      expect(result.isWarning).toBe(true);
      expect(result.message).toContain("1 advertised link returns 404");
    });
  });

  describe("constants verification", () => {
    it("exports standard port maps and fixes", () => {
      expect(INGRESS_PORTS).toEqual([80, 443]);
      expect(HOST_PORTS[80]).toBe("HTTP");
      expect(HOST_PORTS[443]).toBe("HTTPS");
      expect(HOST_PORTS[5432]).toBe("Postgres");
      expect(HOST_PORT_FIXES.port80).toContain("Stop the process bound to port 80");
      expect(HOST_PORT_FIXES.port5432).toContain("Stop local Postgres");
    });
  });
});
