// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCircularDependencies,
  checkDependsOnShape,
  checkSchemaVersions,
  checkServicePorts,
  enforceServiceConfigGate,
  warnSchemaVersions,
} from "../service-config-checks.js";

let root: string;

function service(name: string, extra: Record<string, unknown> = {}, dir = `app/${name}`) {
  const path = join(root, "services", dir);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "service.json"),
    JSON.stringify({ appName: name, appType: "backend", stack: "app", port: 4000, ...extra }),
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tdk-config-checks-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("checkCircularDependencies", () => {
  it("passes when nothing depends on anything", () => {
    service("api");
    expect(checkCircularDependencies(root).didPass).toBe(true);
  });

  it("names both services, the file and the loop when two depend on each other", () => {
    service("api", { dependsOn: ["worker"] });
    service("worker", { dependsOn: ["api"] });
    const result = checkCircularDependencies(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("api -> worker -> api");
    expect(result.message).toContain(join("services", "app", "api", "service.json"));
    expect(result.message).toContain('dependsOn "worker"');
    expect(result.fix).toContain("dependsOn");
  });

  it("finds a longer loop and reports it once", () => {
    service("a", { dependsOn: ["b"] });
    service("b", { dependsOn: ["c"] });
    service("c", { dependsOn: ["a"] });
    const result = checkCircularDependencies(root);
    expect(result.message).toContain("a -> b -> c -> a");
    expect(result.message.match(/circular dependency a ->/g)).toHaveLength(1);
  });

  it("catches a service that depends on itself", () => {
    service("api", { dependsOn: ["api"] });
    expect(checkCircularDependencies(root).message).toContain("api -> api");
  });

  it("reports two separate loops separately", () => {
    service("a", { dependsOn: ["b"] });
    service("b", { dependsOn: ["a"] });
    service("x", { dependsOn: ["y"] });
    service("y", { dependsOn: ["x"] });
    const result = checkCircularDependencies(root);
    expect(result.message).toContain("2 circular dependencies");
    expect(result.message).toContain("a -> b -> a");
    expect(result.message).toContain("x -> y -> x");
  });

  it("does not flag a chain or a diamond", () => {
    service("db");
    service("api", { dependsOn: ["db"] });
    service("worker", { dependsOn: ["db"] });
    service("web", { dependsOn: ["api", "worker"] });
    expect(checkCircularDependencies(root).didPass).toBe(true);
  });

  it("ignores dependsOn names that are not services, such as the shared postgres", () => {
    service("api", { dependsOn: ["postgres", "does-not-exist"] });
    expect(checkCircularDependencies(root).didPass).toBe(true);
  });
});

describe("checkServicePorts", () => {
  it("passes for valid ports and for a service with no port", () => {
    service("api", { port: 4000 });
    service("web", { port: undefined });
    expect(checkServicePorts(root).didPass).toBe(true);
  });

  it.each([
    [99999, "99999"],
    [0, "0"],
    [-1, "-1"],
    [4000.5, "4000.5"],
    ["4000", '"4000"'],
  ])("rejects port %j and shows the value", (port, shown) => {
    service("api", { port });
    const result = checkServicePorts(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain(join("services", "app", "api", "service.json"));
    expect(result.message).toContain(`port ${shown}`);
    expect(result.fix).toContain("1 to 65535");
  });

  it("accepts the lowest and highest valid port", () => {
    service("low", { port: 1 });
    service("high", { port: 65535 });
    expect(checkServicePorts(root).didPass).toBe(true);
  });
});

describe("enforceServiceConfigGate", () => {
  const exit = (code: number): never => {
    throw new Error(`exit ${code}`);
  };

  it("lets a valid project through", () => {
    service("api");
    service("worker", { port: 4001, dependsOn: ["api"] });
    expect(() => enforceServiceConfigGate(root, {}, exit)).not.toThrow();
  });

  it("exits 1 and reports a circular dependency with a fix", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service("api", { dependsOn: ["worker"] });
    service("worker", { port: 4001, dependsOn: ["api"] });
    let reported = "";
    expect(() =>
      enforceServiceConfigGate(root, { onInvalid: (message) => (reported = message) }, exit),
    ).toThrow("exit 1");
    expect(reported).toContain("circular dependency api -> worker -> api");
    expect(reported).toContain("Fix:");
  });

  it("exits 1 for an invalid port", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service("api", { port: 99999 });
    expect(() => enforceServiceConfigGate(root, {}, exit)).toThrow("exit 1");
  });

  it("exits 1 for two services with one name, which doctor already refuses", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    service("api");
    service("api", { port: 4001 }, "other/api-copy");
    expect(() => enforceServiceConfigGate(root, {}, exit)).toThrow("exit 1");
  });

  it("reports every problem at once, not just the first", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    service("api", { dependsOn: ["worker"], port: 99999 });
    service("worker", { port: 4001, dependsOn: ["api"] });
    expect(() => enforceServiceConfigGate(root, {}, exit)).toThrow("exit 1");
    const printed = err.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("circular dependency");
    expect(printed).toContain("not an integer from 1 to 65535");
  });
});

describe("a dependsOn that is not an array of service names", () => {
  const exit = (code: number): never => {
    throw new Error(`exit ${code}`);
  };

  it.each([
    ['"worker"', "worker"],
    ["7", 7],
    ['{"a":1}', { a: 1 }],
    ['["api",2]', ["api", 2]],
  ])("is reported with the file and the value %s", (shown, dependsOn) => {
    service("api", { dependsOn });
    const result = checkDependsOnShape(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain(join("services", "app", "api", "service.json"));
    expect(result.message).toContain(`dependsOn ${shown}`);
    expect(result.fix).toContain("array");
  });

  it("passes for a missing, empty or valid dependsOn", () => {
    service("db");
    service("api", { dependsOn: ["db"] });
    service("worker", { dependsOn: [] });
    expect(checkDependsOnShape(root).didPass).toBe(true);
  });

  it("does not make the cycle check throw", () => {
    service("api", { dependsOn: "worker" });
    service("worker", { port: 4001, dependsOn: ["api"] });
    expect(() => checkCircularDependencies(root)).not.toThrow();
    expect(checkCircularDependencies(root).didPass).toBe(true);
  });

  it("is refused by the gate with a clear message instead of a crash", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    service("api", { dependsOn: "worker" });
    expect(() => enforceServiceConfigGate(root, {}, exit)).toThrow("exit 1");
    expect(err.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "expected an array of service names",
    );
  });
});

describe("schemaVersion", () => {
  it("passes when every service.json has the supported version", () => {
    service("api", { schemaVersion: 1 });
    service("worker", { port: 4001, schemaVersion: 1 });
    expect(checkSchemaVersions(root).didPass).toBe(true);
  });

  it("warns, rather than fails, when schemaVersion is missing, and points at migrate", () => {
    service("api");
    const result = checkSchemaVersions(root);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain(join("services", "app", "api", "service.json"));
    expect(result.message).toContain("schemaVersion: missing");
    expect(result.fix).toContain("flisk config migrate");
  });

  it.each([
    [99, "99"],
    ["1", '"1"'],
    [0, "0"],
  ])(
    "warns about an unsupported schemaVersion %j without sending people to migrate",
    (version, shown) => {
      service("api", { schemaVersion: version });
      const result = checkSchemaVersions(root);
      expect(result.isWarning).toBe(true);
      expect(result.message).toContain(`schemaVersion ${shown}`);
      expect(result.fix).toContain("upgrade flisk");
      expect(result.fix).not.toContain("flisk config migrate");
      expect(result.fix).not.toMatch(/set schemaVersion/i);
    },
  );

  it("fails instead of warning under --strict, as the flag promises", () => {
    service("api");
    const relaxed = checkSchemaVersions(root);
    const strict = checkSchemaVersions(root, true);
    expect(relaxed).toMatchObject({ didPass: false, isWarning: true });
    expect(strict).toMatchObject({ didPass: false, isWarning: false });
    expect(strict.message).toBe(relaxed.message);
  });

  it("passes under --strict when every file is current", () => {
    service("api", { schemaVersion: 1 });
    expect(checkSchemaVersions(root, true).didPass).toBe(true);
  });

  it("gives both fixes when some files are missing it and others are unsupported", () => {
    service("api");
    service("worker", { port: 4001, schemaVersion: 99 });
    const result = checkSchemaVersions(root);
    expect(result.message).toContain("2 service.json files");
    expect(result.fix).toContain("flisk config migrate");
    expect(result.fix).toContain("upgrade flisk");
  });

  it("never writes to service.json", () => {
    service("api");
    const file = join(root, "services", "app", "api", "service.json");
    const before = readFileSync(file, "utf-8");
    checkSchemaVersions(root);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    warnSchemaVersions(root);
    expect(readFileSync(file, "utf-8")).toBe(before);
  });

  it("warnSchemaVersions prints once for a problem and nothing when all is well", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    service("api", { schemaVersion: 1 });
    warnSchemaVersions(root);
    expect(warn).not.toHaveBeenCalled();

    service("worker", { port: 4001 });
    warnSchemaVersions(root);
    const printed = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("worker");
    expect(printed).toContain("flisk config migrate");
  });

  it("is not part of the up gate, so a project without it still starts", () => {
    service("api");
    const exit = (code: number): never => {
      throw new Error(`exit ${code}`);
    };
    expect(() => enforceServiceConfigGate(root, {}, exit)).not.toThrow();
  });
});
