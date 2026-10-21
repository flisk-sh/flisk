// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceSchemaVersionGate } from "../schema-version-gate.js";
import { SERVICE_MANIFEST_SCHEMA_VERSION } from "../service-manifest.js";

let root: string;

function service(name: string, extra: Record<string, unknown>) {
  const path = join(root, "services", "app", name);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "service.json"),
    JSON.stringify({ appName: name, appType: "backend", stack: "app", port: 4000, ...extra }),
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tdk-schema-gate-"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("enforceSchemaVersionGate", () => {
  it("refuses a schemaVersion this flisk does not know, and says which file", () => {
    service("api", { schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION + 1 });
    const seen: string[] = [];
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    expect(() =>
      enforceSchemaVersionGate(root, { onInvalid: (m) => seen.push(m) }, exit as never),
    ).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(seen[0]).toContain("services/app/api/service.json schemaVersion");
    expect(seen[0]).toContain(`this flisk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`);
  });

  it("does not refuse a missing schemaVersion, which only warns", () => {
    service("api", {});
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    enforceSchemaVersionGate(root, {}, exit as never);
    expect(exit).not.toHaveBeenCalled();
  });

  it("does not refuse the supported version", () => {
    service("api", { schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION });
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    enforceSchemaVersionGate(root, {}, exit as never);
    expect(exit).not.toHaveBeenCalled();
  });
});
