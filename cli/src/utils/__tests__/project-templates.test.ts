// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROJECT_TEMPLATES } from "../project-templates.js";

const exampleRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../examples/tdk-example",
);

describe("PROJECT_TEMPLATES", () => {
  it("offers every public example repo", () => {
    expect(Object.keys(PROJECT_TEMPLATES).sort()).toEqual([
      "agent-stack",
      "ecommerce",
      "erp",
      "example",
      "restaurant",
      "saas",
      "user-management",
    ]);
  });

  it("points ecommerce at tdk-ecommerce-example", () => {
    expect(PROJECT_TEMPLATES.ecommerce.repo).toBe(
      "https://github.com/tdk-landscape/tdk-ecommerce-example.git",
    );
  });

  it("bundles the product example with the CLI package", () => {
    expect(PROJECT_TEMPLATES.example.bundledPath).toBe("examples/tdk-example");
    expect(PROJECT_TEMPLATES.example.description).toContain("NATS worker");
    const manifests = [
      "services/shop/orders-api/service.json",
      "services/shop/orders-worker/service.json",
      "services/shop/orders-app/service.json",
    ].map((path) => JSON.parse(readFileSync(resolve(exampleRoot, path), "utf-8")));
    expect(manifests.map((manifest) => manifest.appType)).toEqual([
      "backend",
      "worker",
      "frontend",
    ]);
    expect(manifests[0].featuresEnabled).toContain("nats");
    expect(manifests[1].featuresEnabled).toContain("nats");
    expect(existsSync(resolve(exampleRoot, "services/platform/messaging/docker-compose.yml"))).toBe(
      true,
    );
    expect(
      readFileSync(resolve(exampleRoot, "services/shop/orders-api/src/index.ts"), "utf-8"),
    ).toContain("INSERT INTO demo_orders");
    expect(
      readFileSync(resolve(exampleRoot, "services/shop/orders-worker/src/index.ts"), "utf-8"),
    ).toContain("UPDATE demo_orders SET worker_seen_at");
  });

  it("gives every template a github repo and a description", () => {
    for (const [name, t] of Object.entries(PROJECT_TEMPLATES)) {
      expect(t.repo, name).toMatch(/^https:\/\/github\.com\/tdk-landscape\/[\w-]+\.git$/);
      expect(t.description, name).not.toBe("");
    }
  });
});
