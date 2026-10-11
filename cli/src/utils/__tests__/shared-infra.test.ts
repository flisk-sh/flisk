// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DiscoveredResource, DiscoveredStack, ResourceConfig } from "../../types/index.js";
import { groupSharedPostgres, readProjectName, usesSharedPostgres } from "../shared-infra.js";

function resource(
  name: string,
  stack: string,
  config: Partial<ResourceConfig> = {},
): DiscoveredResource {
  return {
    name,
    path: `/p/${name}`,
    configPath: `/p/${name}/service.json`,
    stack,
    config: config as ResourceConfig,
  };
}

function stack(name: string, resources: DiscoveredResource[]): DiscoveredStack {
  return { name, resources, resourceCount: resources.length };
}

describe("usesSharedPostgres", () => {
  it("is true for the database-management feature", () => {
    expect(
      usesSharedPostgres(resource("api", "shop", { featuresEnabled: ["database-management"] })),
    ).toBe(true);
  });

  it("is true for either shared-database dependsOn name", () => {
    expect(usesSharedPostgres(resource("api", "shop", { dependsOn: ["postgres"] }))).toBe(true);
    expect(
      usesSharedPostgres(resource("api", "shop", { dependsOn: ["database-management"] })),
    ).toBe(true);
  });

  it("is false for unrelated dependsOn and for resources without config", () => {
    expect(usesSharedPostgres(resource("api", "shop", { dependsOn: ["redis"] }))).toBe(false);
    expect(usesSharedPostgres({ name: "api", path: "/p", configPath: "/p/s.json" })).toBe(false);
  });

  it("ignores malformed featuresEnabled and dependsOn values instead of throwing", () => {
    const malformed = [
      resource("api", "shop", { featuresEnabled: "database-management" as unknown as string[] }),
      resource("api", "shop", { dependsOn: "postgres" as unknown as string[] }),
      resource("api", "shop", { dependsOn: 42 as unknown as string[] }),
    ];
    expect(() => malformed.map(usesSharedPostgres)).not.toThrow();
    expect(malformed.map(usesSharedPostgres)).toEqual([false, false, false]);
  });
});

describe("groupSharedPostgres", () => {
  it("returns null when no stack uses the shared database", () => {
    const stacks = [stack("shop", [resource("web", "shop", { dependsOn: ["api"] })])];
    expect(groupSharedPostgres("pilot", stacks)).toBeNull();
  });

  it("returns null for an empty project", () => {
    expect(groupSharedPostgres("pilot", [])).toBeNull();
  });

  it("names each stack database <project>_<stack> under one postgres instance", () => {
    const stacks = [
      stack("shop", [resource("orders-api", "shop", { dependsOn: ["postgres"] })]),
      stack("billing", [
        resource("billing-api", "billing", { featuresEnabled: ["database-management"] }),
      ]),
    ];
    const group = groupSharedPostgres("pilot", stacks);
    expect(group).toEqual({
      name: "postgres",
      databases: [
        { name: "pilot_billing", stack: "billing", services: ["billing-api"] },
        { name: "pilot_shop", stack: "shop", services: ["orders-api"] },
      ],
    });
  });

  it("converts hyphens in the project and stack names to underscores", () => {
    const stacks = [stack("my-shop", [resource("api", "my-shop", { dependsOn: ["postgres"] })])];
    expect(groupSharedPostgres("auth-user", stacks)?.databases[0]?.name).toBe("auth_user_my_shop");
  });

  it("lists only the services that use the database, and omits stacks without any", () => {
    const stacks = [
      stack("shop", [
        resource("orders-api", "shop", { dependsOn: ["database-management"] }),
        resource("web", "shop", { dependsOn: ["orders-api"] }),
      ]),
      stack("ops", [resource("cron", "ops", { dependsOn: ["redis"] })]),
    ];
    const group = groupSharedPostgres("pilot", stacks);
    expect(group?.databases).toEqual([
      { name: "pilot_shop", stack: "shop", services: ["orders-api"] },
    ]);
  });
});

describe("readProjectName", () => {
  it("reads project.name from .tdk/project.json", () => {
    const root = mkdtempSync(join(tmpdir(), "shared-infra-"));
    try {
      mkdirSync(join(root, ".tdk"));
      writeFileSync(
        join(root, ".tdk", "project.json"),
        JSON.stringify({ project: { name: "auth-user" } }),
      );
      expect(readProjectName(root)).toBe("auth-user");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when the file is missing or has no project name", () => {
    const root = mkdtempSync(join(tmpdir(), "shared-infra-"));
    try {
      expect(readProjectName(root)).toBeNull();
      mkdirSync(join(root, ".tdk"));
      writeFileSync(join(root, ".tdk", "project.json"), "{}");
      expect(readProjectName(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
