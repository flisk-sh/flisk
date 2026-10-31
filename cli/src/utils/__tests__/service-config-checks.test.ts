// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCircularDependencies,
  checkCustomDockerfiles,
  checkDependsOnShape,
  checkNetworkPorts,
  checkRequiredSecrets,
  checkSchemaVersions,
  checkServiceFields,
  checkServicePorts,
  checkSidecars,
  checkVolumes,
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
  root = mkdtempSync(join(tmpdir(), "flisk-config-checks-"));
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

  it("handles object, boolean, and null schemaVersions as unsupported", () => {
    service("svc-obj", { schemaVersion: { version: 1 } });
    service("svc-bool", { schemaVersion: true });
    service("svc-null", { schemaVersion: null });
    const result = checkSchemaVersions(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("3 service.json files without a supported schemaVersion");
    expect(result.message).toContain('schemaVersion {"version":1}');
    expect(result.message).toContain("schemaVersion true");
    expect(result.message).toContain("schemaVersion null");
  });

  it("supports pre-discovered resources passed to checkSchemaVersions and warnSchemaVersions", () => {
    const resources = [
      {
        name: "custom-api",
        path: join(root, "apps/custom-api"),
        configPath: join(root, "apps/custom-api/service.json"),
        config: {
          appName: "custom-api",
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
        } as never,
      },
    ];
    expect(checkSchemaVersions(root, false, resources).didPass).toBe(true);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnSchemaVersions(root, resources);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("additional edge cases across service config checks", () => {
  const exit = (code: number): never => {
    throw new Error(`exit ${code}`);
  };

  it("orders a multi-node cycle alphabetically starting from the lowest name", () => {
    // Cycle: d -> c -> b -> a -> d
    service("d", { dependsOn: ["c"] });
    service("c", { dependsOn: ["b"] });
    service("b", { dependsOn: ["a"] });
    service("a", { dependsOn: ["d"] });

    const result = checkCircularDependencies(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("a -> d -> c -> b -> a");
  });

  it("formats plural message when multiple services have invalid dependsOn", () => {
    service("svc-1", { dependsOn: "single-string" });
    service("svc-2", { dependsOn: [123, null] });

    const result = checkDependsOnShape(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("2 invalid dependsOn:\n");
    expect(result.message).toContain('dependsOn "single-string"');
    expect(result.message).toContain("dependsOn [123,null]");
  });

  it("rejects non-finite, boolean, and object ports with plural count", () => {
    service("svc-nan", { port: Number.NaN });
    service("svc-inf", { port: Number.POSITIVE_INFINITY });
    service("svc-bool", { port: true });
    service("svc-obj", { port: { val: 4000 } });

    const result = checkServicePorts(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("4 invalid ports:\n");
    expect(result.message).toContain("port null"); // JSON.stringify(NaN) and JSON.stringify(Infinity) are null
    expect(result.message).toContain("port true");
    expect(result.message).toContain('port {"val":4000}');
  });

  it("passes pre-discovered resources to enforceServiceConfigGate without reading root", () => {
    const validPreDiscovered = [
      {
        name: "pre-api",
        path: join(root, "apps/pre-api"),
        configPath: join(root, "apps/pre-api/service.json"),
        config: {
          appName: "pre-api",
          appType: "backend",
          stack: "app",
          port: 3000,
          dependsOn: [],
          schemaVersion: 1,
        } as never,
      },
    ];

    expect(() =>
      enforceServiceConfigGate(root, { resources: validPreDiscovered }, exit),
    ).not.toThrow();
  });

  it("reports all 4 gate failures simultaneously when all checks fail", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // 1. Duplicate resource name: two services named "shared-name"
    service("shared-name", { port: 99999, dependsOn: "invalid-shape" }, "app/svc1");
    service("shared-name", { port: 88888, dependsOn: ["loop-b"] }, "app/svc2");
    // 2. Circular dependency: loop-a <-> loop-b
    service("loop-a", { dependsOn: ["loop-b"] }, "app/loop-a");
    service("loop-b", { dependsOn: ["loop-a"] }, "app/loop-b");

    let reported = "";
    expect(() =>
      enforceServiceConfigGate(root, { onInvalid: (message) => (reported = message) }, exit),
    ).toThrow("exit 1");

    // Check duplicate names reported
    expect(reported).toContain("appName used by more than one resource");
    // Check invalid dependsOn reported
    expect(reported).toContain("invalid dependsOn");
    // Check circular dependencies reported
    expect(reported).toContain("circular dependency");
    // Check invalid ports reported
    expect(reported).toContain("invalid port");
  });
});

describe("checkServiceFields", () => {
  it("passes names Docker can use", () => {
    service("orders-api");
    service("orders2", { stack: "back_office" }, "bo/orders2");
    expect(checkServiceFields(root).didPass).toBe(true);
  });
  it.each(["Orders", "my service", "orders/", "-orders", "orders-", "orders:tag", "a".repeat(60)])(
    "refuses the appName %j, which Docker cannot name an image after",
    (name) => {
      service(name);
      const result = checkServiceFields(root);
      expect(result.didPass).toBe(false);
      expect(result.message).toContain("appName");
    },
  );
  it("refuses a stack with an uppercase letter", () => {
    service("orders", { stack: "Shop" });
    expect(checkServiceFields(root).message).toContain("stack");
  });
  it("leaves a local-process service alone: it never reaches Docker", () => {
    service("Orders", { command: "node server.js" });
    expect(checkServiceFields(root).didPass).toBe(true);
  });
  it("refuses a field of the wrong type, which would stop the Tiltfile", () => {
    service("orders", { traefik: "x" });
    expect(checkServiceFields(root).message).toContain("traefik: expected an object");
  });
  it("does not require schemaVersion or stack, which old projects lack", () => {
    service("orders", { stack: undefined });
    expect(checkServiceFields(root).didPass).toBe(true);
  });
  it("is part of the gate flisk up applies", () => {
    service("Orders");
    const exit = vi.fn(() => {
      throw new Error("exit");
    }) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => enforceServiceConfigGate(root, {}, exit)).toThrow("exit");
  });
});

describe("circular dependencies through stacks and backendName", () => {
  it("finds a cycle that runs through a frontend's backendName", () => {
    service("api", { dependsOn: ["ui"] });
    service("ui", { appType: "frontend", backendName: "api" });
    expect(checkCircularDependencies(root).didPass).toBe(false);
  });
  it("finds a cycle through a stack name", () => {
    service("a", { dependsOn: ["core"], stack: "edge" }, "edge/a");
    service("b", { dependsOn: ["a"], stack: "core" }, "core/b");
    expect(checkCircularDependencies(root).didPass).toBe(false);
  });
  it("does not call a service that depends on its own stack a cycle", () => {
    service("a", { dependsOn: ["app"] });
    service("b");
    expect(checkCircularDependencies(root).didPass).toBe(true);
  });
});

describe("checkCustomDockerfiles", () => {
  it("passes when no custom dockerfile is declared", () => {
    service("api");
    expect(checkCustomDockerfiles(root).didPass).toBe(true);
  });
  it("passes when the file exists, relative to the service or to its buildContext", () => {
    service("api", { dockerfile: "docker/Dockerfile.dev" });
    mkdirSync(join(root, "services/app/api/docker"), { recursive: true });
    writeFileSync(join(root, "services/app/api/docker/Dockerfile.dev"), "FROM scratch\n");
    service("web", { dockerfile: "Dockerfile", buildContext: "ctx" });
    mkdirSync(join(root, "services/app/web/ctx"), { recursive: true });
    writeFileSync(join(root, "services/app/web/ctx/Dockerfile"), "FROM scratch\n");
    expect(checkCustomDockerfiles(root).didPass).toBe(true);
  });
  it("treats a directory as missing: the loader checks for a regular file", () => {
    service("api", { dockerfile: "docker" });
    mkdirSync(join(root, "services/app/api/docker"), { recursive: true });
    expect(checkCustomDockerfiles(root).didPass).toBe(false);
  });
  it("names a missing file", () => {
    service("api", { dockerfile: "does/not/exist/Dockerfile" });
    const result = checkCustomDockerfiles(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("services/app/api/service.json dockerfile");
  });
  it("is part of the gate flisk up applies", () => {
    service("api", { dockerfile: "missing" });
    const exit = vi.fn(() => {
      throw new Error("exit");
    }) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => enforceServiceConfigGate(root, {}, exit)).toThrow("exit");
  });
});

describe("the gate accepts what `flisk import` writes for a Compose app", () => {
  // Found by the compose-import journey: the gate refused buildContext "../../../api" (a Dockerfile that stays where the Compose
  // file had it, outside the service directory), `flisk up` exited before starting anything and the journey timed out.
  it("an api built from a tree outside its service directory, and a database from an image", () => {
    mkdirSync(join(root, "api"), { recursive: true });
    writeFileSync(join(root, "api/Dockerfile"), "FROM node:22-alpine\n");
    // `flisk import` copies the password of the Compose file into .env, which the required-secrets check then finds.
    writeFileSync(join(root, ".env"), "POSTGRES_PASSWORD=example\n");
    service(
      "api",
      {
        appType: "backend",
        stack: "composeapp",
        port: 3000,
        healthCheckPath: "/",
        dependsOn: ["db"],
        buildContext: "../../../api",
        dockerfile: "Dockerfile",
      },
      "composeapp/api",
    );
    service(
      "db",
      {
        appType: "bring-your-own",
        stack: "composeapp",
        port: 4000,
        image: "postgres:16-alpine",
        exposeViaProxy: false,
        secrets: { required: ["POSTGRES_PASSWORD"] },
      },
      "composeapp/db",
    );
    const exit = vi.fn(() => {
      throw new Error("exit");
    }) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => enforceServiceConfigGate(root, {}, exit)).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });

  it("still refuses a build context that is an absolute path, which the loader cannot resolve", () => {
    service("api", { buildContext: "/srv/api", dockerfile: "Dockerfile" });
    expect(checkServiceFields(root).message).toContain(
      "buildContext: must be a path relative to the service directory",
    );
  });
});

describe("checkRequiredSecrets", () => {
  it("fails for a required secret with no value, naming the file and the secret", () => {
    service("api", { secrets: { required: ["SECRET_KEY"], optional: ["TOKEN"] } });
    const result = checkRequiredSecrets(root, undefined, {});
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("secret SECRET_KEY has no value");
    expect(result.message).not.toContain("TOKEN");
    expect(result.fix).toContain(".env");
  });

  it("passes when the project .env or the environment has a value, and fails for an empty one", () => {
    service("api", { secrets: { required: ["A_KEY", "B_KEY"] } });
    writeFileSync(join(root, ".env"), "A_KEY=1\nB_KEY=\n");
    expect(checkRequiredSecrets(root, undefined, {}).message).toContain("B_KEY");
    expect(checkRequiredSecrets(root, undefined, {}).message).not.toContain("A_KEY");
    expect(checkRequiredSecrets(root, undefined, { B_KEY: "2" }).didPass).toBe(true);
  });

  it("reads the env file selected for the run instead of the project .env", () => {
    service("api", { secrets: { required: ["A_KEY"] } });
    writeFileSync(join(root, ".env"), "A_KEY=1\n");
    writeFileSync(join(root, "other.env"), "X=1\n");
    expect(
      checkRequiredSecrets(root, undefined, { FLISK_ENV_FILE: join(root, "other.env") }).didPass,
    ).toBe(false);
  });

  it("leaves the names to the provider with FLISK_SECRET_PROVIDER=infisical", () => {
    service("api", { secrets: { required: ["A_KEY"] } });
    expect(
      checkRequiredSecrets(root, undefined, { FLISK_SECRET_PROVIDER: "infisical" }).didPass,
    ).toBe(true);
  });

  it("is part of the gate, so flisk up refuses it before Tilt starts", () => {
    service("api", { secrets: { required: ["A_KEY"] } });
    const exit = vi.fn((code: number) => {
      throw new Error(`exit ${code}`);
    }) as unknown as (code: number) => never;
    const messages: string[] = [];
    const saved = process.env.A_KEY;
    delete process.env.A_KEY;
    expect(() =>
      enforceServiceConfigGate(root, { onInvalid: (m) => messages.push(m) }, exit),
    ).toThrow("exit 1");
    if (saved !== undefined) process.env.A_KEY = saved;
    expect(messages.join("\n")).toContain("secret A_KEY has no value");
  });
});

describe("checkSidecars", () => {
  const byo = { appType: "bring-your-own", image: "example/x:1" };

  it("passes for a sidecar of a resource in the same stack, and when there are none", () => {
    service("api");
    expect(checkSidecars(root).didPass).toBe(true);
    service("tubehaus", byo);
    service("bgutil", { ...byo, sidecarOf: "tubehaus" });
    expect(checkSidecars(root).didPass).toBe(true);
  });

  it("names a host that does not exist", () => {
    service("bgutil", { ...byo, sidecarOf: "tubehaus" });
    const result = checkSidecars(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('sidecarOf "tubehaus": no resource has that name');
    expect(result.fix).toContain("same stack");
  });

  it("names a host in another stack", () => {
    service("tubehaus", { ...byo, stack: "media" }, "media/tubehaus");
    service("bgutil", { ...byo, sidecarOf: "tubehaus" });
    const result = checkSidecars(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('is in stack "media", not "app"');
  });

  it("stops flisk up through the config gate", () => {
    service("bgutil", { ...byo, sidecarOf: "missing" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.fn() as never;
    enforceServiceConfigGate(root, {}, exit);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("checkVolumes", () => {
  const byo = { appType: "bring-your-own", image: "example/x:1" };

  it("passes for named volumes and bind mounts inside the project", () => {
    service("api", {
      ...byo,
      volumes: [
        { source: "data", target: "/data" },
        { source: "../../../web", target: "/srv/web", readOnly: true },
      ],
    });
    expect(checkVolumes(root).didPass).toBe(true);
  });

  it("refuses a bind mount that leaves the project and stops flisk up", () => {
    service("api", { ...byo, volumes: [{ source: "../../../../etc", target: "/host-etc" }] });
    const result = checkVolumes(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("volumes[0].source: must stay inside the project");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.fn() as never;
    enforceServiceConfigGate(root, {}, exit);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("checkNetworkPorts", () => {
  const byo = { appType: "bring-your-own", image: "caddy:2" };

  it("passes when every extra port stays on this machine", () => {
    service("caddy", { ...byo, extraPorts: [{ port: 80 }, { port: 443, bind: "127.0.0.1" }] });
    expect(checkNetworkPorts(root).didPass).toBe(true);
  });

  it("warns, without failing, about a port opened to the network", () => {
    service("caddy", { ...byo, extraPorts: [{ port: 80, bind: "0.0.0.0" }, { port: 443 }] });
    const result = checkNetworkPorts(root);
    expect(result).toMatchObject({ didPass: false, isWarning: true });
    expect(result.message).toContain("caddy 0.0.0.0:80/tcp");
    expect(result.message).not.toContain("443");
  });
});
