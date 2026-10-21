// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  isRegistryRelatedBuildError,
  parseTiltResourceFailures,
  summarizeTiltBuildError,
} from "../doctor-runtime.js";

const pullDenied = (image: string) =>
  `ImageBuild: ${image}: failed to resolve source metadata for docker.io/library/${image}: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed`;

describe("summarizeTiltBuildError: missing golden base images", () => {
  it.each([
    ["shop-l1:latest", "shop-l1"],
    ["shop-l2:latest", "shop-l2"],
    ["shop-l3-migrator:latest", "shop-l3-migrator"],
    ["shop-l4-backend:latest", "shop-l4-backend"],
    ["shop-l4-backend-node:latest", "shop-l4-backend-node"],
    ["my-erp-system-l3-frontend:latest", "my-erp-system-l3-frontend"],
    ["tdk-project-l1:latest", "tdk-project-l1"],
  ])("names %s and explains the golden layers were missing", (image, name) => {
    const summary = summarizeTiltBuildError(pullDenied(image));
    expect(summary).toContain(`base image ${name} was missing when this build started`);
    expect(summary).toContain("does not retry");
  });

  it("does not mislabel other images that fail to resolve", () => {
    const summary = summarizeTiltBuildError(pullDenied("someorg-private-thing:latest"));
    expect(summary).not.toContain("golden");
  });

  it("does not mislabel a public base image", () => {
    const summary = summarizeTiltBuildError(pullDenied("node:22-alpine"));
    expect(summary).not.toContain("golden");
  });
});

describe("summarizeTiltBuildError: host port conflicts", () => {
  it("extracts port number when bind error is reported", () => {
    const err =
      "Error response from daemon: Bind for 0.0.0.0:8080 failed: port is already allocated";
    expect(summarizeTiltBuildError(err)).toBe("host port 8080 is already allocated");
  });

  it("extracts port number for IPv6 bind errors", () => {
    const err =
      "driver failed programming external connectivity: Bind for :::3000 failed: port is already allocated";
    expect(summarizeTiltBuildError(err)).toBe("host port 3000 is already allocated");
  });

  it("falls back to generic port conflict when exact port is missing", () => {
    const err = "failed to start container: port is already allocated on the host interface";
    expect(summarizeTiltBuildError(err)).toBe("a required host port is already allocated");
  });
});

describe("summarizeTiltBuildError: private registry / ConnectionRefused", () => {
  it("formats single ConnectionRefused package error", () => {
    const raw = "ConnectionRefused downloading package manifest @tdk-landscape/observability";
    const summary = summarizeTiltBuildError(raw);
    expect(summary).toContain(
      "private registry ConnectionRefused for @tdk-landscape/observability",
    );
    expect(summary).toContain("Verdaccio (:4873) is down or unreachable");
  });

  it("deduplicates and lists multiple unique packages up to 4", () => {
    const raw = [
      "ConnectionRefused downloading package manifest @flisk/pkg-a",
      "ConnectionRefused downloading package manifest @flisk/pkg-b",
      "ConnectionRefused downloading package manifest @flisk/pkg-a",
      "ConnectionRefused downloading package manifest @flisk/pkg-c",
    ].join("\n");
    const summary = summarizeTiltBuildError(raw);
    expect(summary).toContain("@flisk/pkg-a, @flisk/pkg-b, @flisk/pkg-c");
    expect(summary).not.toContain("more");
  });

  it("truncates with count when more than 4 unique packages are refused", () => {
    const raw = [
      "ConnectionRefused downloading package manifest @flisk/pkg-1",
      "ConnectionRefused downloading package manifest @flisk/pkg-2",
      "ConnectionRefused downloading package manifest @flisk/pkg-3",
      "ConnectionRefused downloading package manifest @flisk/pkg-4",
      "ConnectionRefused downloading package manifest @flisk/pkg-5",
      "ConnectionRefused downloading package manifest @flisk/pkg-6",
    ].join("\n");
    const summary = summarizeTiltBuildError(raw);
    expect(summary).toContain("@flisk/pkg-1, @flisk/pkg-2, @flisk/pkg-3, @flisk/pkg-4 (+2 more)");
  });
});

describe("summarizeTiltBuildError: dependency installation failures", () => {
  it("detects install-deps.sh failures", () => {
    const summary = summarizeTiltBuildError(
      "scripts/install-deps.sh returned non-zero exit code 1",
    );
    expect(summary).toContain("dependency install failed during ImageBuild");
    expect(summary).toContain("Verdaccio (:4873)");
  });

  it("detects bun install and bun install --production failures", () => {
    expect(summarizeTiltBuildError('process "/bin/sh -c bun install" failed')).toContain(
      "dependency install failed during ImageBuild",
    );
    expect(
      summarizeTiltBuildError('process "/bin/sh -c bun install --production" failed'),
    ).toContain("dependency install failed during ImageBuild");
  });

  it("detects npm ci and npm install failures", () => {
    expect(summarizeTiltBuildError("RUN npm ci exited with code 1")).toContain(
      "dependency install failed during ImageBuild",
    );
    expect(summarizeTiltBuildError("RUN npm install failed")).toContain(
      "dependency install failed during ImageBuild",
    );
  });
});

describe("summarizeTiltBuildError: missing Docker images and compose services", () => {
  it("extracts missing image name from No such image", () => {
    const summary = summarizeTiltBuildError("Error: No such image: my-company/backend-api:v2.1");
    expect(summary).toBe(
      "compose run failed because image is missing (my-company/backend-api:v2.1) — wait for the ImageBuild resource to finish, then re-trigger the *-run-only resource",
    );
  });

  it("extracts missing image from pull access denied", () => {
    const summary = summarizeTiltBuildError(
      "Error: pull access denied for custom-infra-db, repository does not exist",
    );
    expect(summary).toBe(
      "compose run failed because image is missing (custom-infra-db) — wait for the ImageBuild resource to finish, then re-trigger the *-run-only resource",
    );
  });

  // The two command-only cases below lock in the current heuristic: a failed
  // `up -d --no-build` (run-only resource) is reported as a missing image even
  // without explicit image evidence. This mirrors the existing contract in
  // commands/__tests__/doctor.test.ts; narrowing it is a runtime change and
  // belongs in its own PR.
  it("identifies compose service from up -d --no-build command (heuristic, no image evidence)", () => {
    const summary = summarizeTiltBuildError(
      'Command "docker compose up -d --no-build billing-service" failed: exit 1',
    );
    expect(summary).toBe(
      "compose run failed because image is missing (billing-service:dev) for billing-service — wait for the ImageBuild resource to finish, then re-trigger the *-run-only resource",
    );
  });

  it("combines explicit missing image with compose service name", () => {
    const summary = summarizeTiltBuildError(
      'Command "docker compose up -d --no-build billing-service" failed: exit 1\nError: No such image: my-company/billing-service:v1.0',
    );
    expect(summary).toBe(
      "compose run failed because image is missing (my-company/billing-service:v1.0) for billing-service — wait for the ImageBuild resource to finish, then re-trigger the *-run-only resource",
    );
  });

  it("handles generic compose up -d --no-build failure (heuristic, no image evidence)", () => {
    const summary = summarizeTiltBuildError(
      "docker compose -f docker-compose.yml up -d --no-build",
    );
    expect(summary).toBe(
      "compose run failed because image is missing (service:dev) — wait for the ImageBuild resource to finish, then re-trigger the *-run-only resource",
    );
  });
});

describe("summarizeTiltBuildError: compile and generic fallbacks", () => {
  it("summarizes bun run build compile failure", () => {
    const summary = summarizeTiltBuildError(
      "error: bun run build failed with exit code 2: TypeScript compilation errors",
    );
    expect(summary).toBe(
      "ImageBuild failed during `bun run build` (compile/typecheck) — open the resource logs in Tilt for the TypeScript/build error",
    );
  });

  it("slices long ImageBuild and Command errors to 220 characters", () => {
    const longMsg = `ImageBuild: ${"x".repeat(300)}`;
    const summary = summarizeTiltBuildError(longMsg);
    expect(summary.length).toBe(220);
    expect(summary.startsWith("ImageBuild:")).toBe(true);

    const longCmd = `Command "${"y".repeat(300)}`;
    expect(summarizeTiltBuildError(longCmd).length).toBe(220);
  });

  it("normalizes whitespace and slices generic error to 220 characters", () => {
    const multiLine = `  custom error line 1   \n\n   line 2   \t   line 3   ${"z".repeat(300)}`;
    const summary = summarizeTiltBuildError(multiLine);
    expect(summary.length).toBe(220);
    expect(summary).not.toContain("\n");
  });
});

describe("isRegistryRelatedBuildError", () => {
  it("returns true for matching registry error patterns", () => {
    expect(
      isRegistryRelatedBuildError("ConnectionRefused downloading package manifest @flisk/foo"),
    ).toBe(true);
    expect(isRegistryRelatedBuildError("Verdaccio (:4873) is down or unreachable")).toBe(true);
    expect(isRegistryRelatedBuildError("private registry error")).toBe(true);
    expect(isRegistryRelatedBuildError("dependency install failed during ImageBuild")).toBe(true);
    expect(isRegistryRelatedBuildError("error running install-deps.sh")).toBe(true);
    expect(isRegistryRelatedBuildError("failed during bun install")).toBe(true);
  });

  it("returns false for non-registry errors", () => {
    expect(isRegistryRelatedBuildError("host port 8080 is already allocated")).toBe(false);
    expect(isRegistryRelatedBuildError("SyntaxError: Unexpected token")).toBe(false);
    expect(isRegistryRelatedBuildError("No such image: redis:alpine")).toBe(false);
  });
});

describe("parseTiltResourceFailures: error extraction from Tilt output", () => {
  it("handles empty items list and valid items", () => {
    const result = parseTiltResourceFailures(JSON.stringify({ items: [] }));
    expect(result).toEqual({
      failures: [],
      pendingCount: 0,
      deferredCount: 0,
      okCount: 0,
      total: 0,
    });
  });

  it("extracts failures from updateStatus error with build history", () => {
    const json = JSON.stringify({
      items: [
        {
          metadata: { name: "api-service" },
          status: {
            updateStatus: "error",
            runtimeStatus: "none",
            buildHistory: [{ error: "ImageBuild: failed to compile \n  at main.ts:10" }],
          },
        },
      ],
    });
    const result = parseTiltResourceFailures(json);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].name).toBe("api-service");
    expect(result.failures[0].updateStatus).toBe("error");
    expect(result.failures[0].error).toBe("ImageBuild: failed to compile at main.ts:10");
    expect(result.total).toBe(1);
  });

  it("identifies runtimeStatus error and applies unhealthy container message when buildError is absent", () => {
    const json = JSON.stringify({
      items: [
        {
          metadata: { name: "db-service" },
          status: {
            updateStatus: "ok",
            runtimeStatus: "ok",
            composeResourceInfo: { healthStatus: "unhealthy" },
          },
        },
      ],
    });
    const result = parseTiltResourceFailures(json);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].name).toBe("db-service");
    expect(result.failures[0].runtimeStatus).toBe("error");
    expect(result.failures[0].error).toContain(
      "container is running, but its health check is failing",
    );
  });

  it("counts ok, pending, and sablier deferred resources correctly", () => {
    const json = JSON.stringify({
      items: [
        {
          metadata: { name: "worker-ok" },
          status: { updateStatus: "ok", runtimeStatus: "ok" },
        },
        {
          metadata: { name: "tool-na" },
          status: { updateStatus: "ok", runtimeStatus: "not_applicable" },
        },
        {
          metadata: { name: "pending-service" },
          status: { updateStatus: "in_progress", runtimeStatus: "none" },
        },
        {
          metadata: { name: "deferred-service" },
          status: { updateStatus: "pending", runtimeStatus: "none" },
        },
        {
          metadata: { name: "(Tiltfile)" },
          status: { updateStatus: "in_progress", runtimeStatus: "none" },
        },
      ],
    });
    const deferredSet = new Set(["deferred-service"]);
    const result = parseTiltResourceFailures(json, deferredSet);
    expect(result.okCount).toBe(2);
    expect(result.pendingCount).toBe(1);
    expect(result.deferredCount).toBe(1);
    expect(result.total).toBe(5);
  });
});
