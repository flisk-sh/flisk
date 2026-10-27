// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `--json` on the commands that change a project: eject, stack, resource, project and the config subcommands. Each case
 * spawns the built CLI, so stdout is exactly what an agent reads (an in-process run would not see a write that bypasses
 * the console), and so Commander's kept option values cannot leak between cases. parseEnvelope asserts one line.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTempDir,
  createTempProject,
  parseEnvelope,
  runFlisk,
} from "../../test-support/index.js";
import { TILT_UP_COMMAND } from "../eject.js";

const VALID_PROJECT_JSON = {
  version: "1.0",
  project: { name: "json-test", version: "1.0.0" },
  phases: Object.fromEntries(
    ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
      name,
      { name, description: "", enabledStacks: [] },
    ]),
  ),
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
  },
  discovery: { paths: ["services/*/*"] },
};

/** A valid project with generated Tilt files and one backend in the `api` stack. */
const configured = (extra: Parameters<typeof createTempProject>[0] = {}) =>
  createTempProject({
    projectJson: VALID_PROJECT_JSON,
    stacks: { api: { gateway: { appType: "backend", port: 4100 } } },
    generated: { Tiltfile: "# generated\n" },
    ...extra,
  });

// A closed stdin makes a prompt that --json failed to skip end the run instead of hanging it.
const json = (args: string[], cwd: string) =>
  runFlisk([...args, "--json"], { cwd, input: "", timeout: 120_000 });

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf-8"));

/**
 * Stdout is the envelope line and nothing else (parseEnvelope trims, so it would let a stray blank line through), and the
 * human output goes to stderr without colour.
 */
function expectQuietStdout(result: { stdout: string; stderr: string }): void {
  expect(result.stdout).toMatch(/^\{[^\n]*\}\n$/);
  expect(result.stderr).not.toMatch(/^\{/m);
  expect(result.stderr).not.toContain("\u001b[");
}

describe("flisk eject --json", () => {
  it("writes EJECTED.md without a prompt and reports the generated files it left alone", () => {
    const root = configured();
    const result = json(["eject"], root);
    expect(result.status).toBe(0);
    expectQuietStdout(result);
    expect(result.stderr).toContain("Wrote EJECTED.md");
    expect(parseEnvelope(result.stdout)).toEqual({
      schemaVersion: 1,
      data: {
        dryRun: false,
        created: true,
        ejectedFile: "EJECTED.md",
        generatedFiles: [".flisk/.flisk-out/Tiltfile"],
        userFiles: [],
        tiltUpCommand: TILT_UP_COMMAND,
      },
      errors: [],
    });
    expect(existsSync(join(root, "EJECTED.md"))).toBe(true);

    // A second run leaves the existing file and says so.
    const again = parseEnvelope(json(["eject"], root).stdout);
    expect(again.data.created).toBe(false);
  }, 120_000);

  it("reports the plan of a dry run and writes nothing", () => {
    const root = configured({ files: { Tiltfile: "# mine\n" } });
    const result = json(["eject", "--dry-run"], root);
    expect(result.status).toBe(0);
    expect(parseEnvelope(result.stdout).data).toMatchObject({
      dryRun: true,
      created: true,
      userFiles: ["Tiltfile"],
    });
    expect(existsSync(join(root, "EJECTED.md"))).toBe(false);
  }, 120_000);

  it("fails with a COMMAND_FAILED envelope when the generated Tilt files are missing", () => {
    const root = createTempProject({ projectJson: VALID_PROJECT_JSON });
    const result = json(["eject"], root);
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data).toBeNull();
    expect(envelope.errors).toEqual([
      expect.objectContaining({
        code: "COMMAND_FAILED",
        message: expect.stringContaining("Generated Tilt files are missing"),
        suggestions: expect.arrayContaining(["flisk project --yes"]),
      }),
    ]);
  }, 120_000);
});

describe("flisk stack --json", () => {
  const withUnassigned = () =>
    configured({ resources: { web: { appType: "backend", port: 4101 } } });

  it("--list reports the stacks and the resources without one", () => {
    const root = withUnassigned();
    const result = json(["stack", "--list"], root);
    expect(result.status).toBe(0);
    expectQuietStdout(result);
    expect(parseEnvelope(result.stdout).data).toEqual({
      stacks: [{ name: "api", resourceCount: 1 }],
      unassigned: [{ name: "web", configPath: join(root, "services", "web", "service.json") }],
      stack: null,
      assigned: [],
    });
  }, 120_000);

  it("assigns the named resources without asking and reports the project after the run", () => {
    const root = withUnassigned();
    const result = json(["stack", "api", "--resources", "web"], root);
    expect(result.status).toBe(0);
    const configPath = join(root, "services", "web", "service.json");
    expect(parseEnvelope(result.stdout).data).toEqual({
      stacks: [{ name: "api", resourceCount: 2 }],
      unassigned: [],
      stack: "api",
      assigned: [{ name: "web", configPath }],
    });
    expect(readJson(configPath).stack).toBe("api");
  }, 120_000);

  it("refuses to prompt for resources and changes nothing", () => {
    const root = withUnassigned();
    const result = json(["stack", "api"], root);
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors).toEqual([
      expect.objectContaining({
        code: "COMMAND_FAILED",
        message: "Interactive resource selection requires a TTY.",
      }),
    ]);
    expect(readJson(join(root, "services", "web", "service.json")).stack).toBeUndefined();
  }, 120_000);

  it("names a resource it cannot find", () => {
    const result = json(["stack", "api", "--resources", "nope"], withUnassigned());
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors[0]?.message).toBe('Resource "nope" not found');
  }, 120_000);
});

describe("flisk resource --json", () => {
  it("scaffolds a backend without prompts and reports where it went", () => {
    const root = configured();
    const result = json(["resource", "orders-api", "--type", "backend", "--stack", "shop"], root);
    expect(result.status).toBe(0);
    expectQuietStdout(result);
    expect(result.stderr).toContain("Resource created successfully");
    const { data } = parseEnvelope(result.stdout);
    expect(data).toEqual({
      action: "created",
      name: "orders-api",
      type: "backend",
      stack: "shop",
      port: expect.any(Number),
      path: "services/shop/orders-api",
      framework: "hono",
      language: "bun",
      discovered: true,
    });
    expect(readJson(join(root, "services", "shop", "orders-api", "service.json")).port).toBe(
      data.port,
    );
  }, 120_000);

  it("reports registering a directory that already has a service.json", () => {
    const root = configured();
    const result = json(["resource", "gateway", "--stack", "api"], root);
    expect(result.status).toBe(0);
    expect(parseEnvelope(result.stdout).data).toMatchObject({
      action: "registered",
      name: "gateway",
      path: "services/api/gateway",
    });
  }, 120_000);

  it("needs a name, since it cannot ask for one", () => {
    const result = json(["resource"], configured());
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors).toEqual([
      {
        code: "COMMAND_FAILED",
        message: "A resource name is required when using --json.",
        suggestions: ["Pass the name explicitly, for example: flisk resource api --json."],
      },
    ]);
  }, 120_000);

  it("reports a directory that exists without a service.json as COMMAND_FAILED", () => {
    const root = configured();
    mkdirSync(join(root, "services", "shop", "taken"), { recursive: true });
    writeFileSync(join(root, "services", "shop", "taken", "README.md"), "x\n");
    const result = json(["resource", "taken", "--stack", "shop"], root);
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors[0]).toMatchObject({
      code: "COMMAND_FAILED",
      message: expect.stringContaining("Directory already exists"),
    });
  }, 120_000);

  it("prints the framework inventory with --frameworks", () => {
    const root = createTempDir();
    const frontend = parseEnvelope(json(["resource", "--frameworks"], root).stdout).data;
    expect(frontend.type).toBe("frontend");
    expect(frontend.frameworks).toContainEqual(expect.objectContaining({ id: "react" }));
    const backend = parseEnvelope(
      json(["resource", "--type", "backend", "--frameworks"], root).stdout,
    ).data;
    expect(backend).toMatchObject({ type: "backend", language: "bun" });
    expect(backend.frameworks).toContainEqual(
      expect.objectContaining({ id: "hono", compatible: true }),
    );
  }, 120_000);
});

describe("flisk project --json", () => {
  it("creates a project with the defaults, then refreshes it on a second run", () => {
    const dir = createTempDir("flisk-json-project-");
    const created = json(["project", "--no-agent-skills"], dir);
    expect(created.status).toBe(0);
    expectQuietStdout(created);
    expect(parseEnvelope(created.stdout).data).toMatchObject({
      action: "created",
      projectRoot: dir,
      projectName: basename(dir),
      generatedFiles: ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"],
      env: { created: true, added: [] },
      agentSkills: [],
      runtime: { hasDockerCli: expect.any(Boolean), hasTiltCli: expect.any(Boolean) },
    });
    expect(existsSync(join(dir, ".flisk", "project.json"))).toBe(true);

    const refreshed = json(["project"], dir);
    expect(refreshed.status).toBe(0);
    expect(parseEnvelope(refreshed.stdout).data).toMatchObject({
      action: "regenerated",
      projectRoot: dir,
    });
  }, 240_000);

  it("--check exits 1 with PROJECT_INCOMPLETE and the missing files", () => {
    const root = createTempProject({ projectJson: VALID_PROJECT_JSON });
    const result = json(["project", "--check"], root);
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout)).toMatchObject({
      data: {
        action: "check",
        valid: false,
        hasProjectJson: true,
        missingFiles: ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"],
      },
      errors: [{ code: "PROJECT_INCOMPLETE" }],
    });
  }, 120_000);

  it("refuses an unknown template before cloning anything", () => {
    const result = json(["project", "no-such-template"], createTempDir());
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors[0]).toMatchObject({
      code: "COMMAND_FAILED",
      message: 'Unknown template: "no-such-template"',
    });
  }, 120_000);
});

describe("flisk config --json", () => {
  it("regenerate --dry-run reports each master file's change and writes nothing", () => {
    const root = createTempProject({ projectJson: VALID_PROJECT_JSON });
    const result = json(["config", "regenerate", "--dry-run"], root);
    expect(result.status).toBe(0);
    expect(parseEnvelope(result.stdout).data).toEqual({
      dryRun: true,
      hasChanges: true,
      changes: [
        { file: "TILT_TECH_STACK.star", status: "new", lineDiff: 0 },
        { file: "TILT_RESOURCE_DEFAULTS.star", status: "new", lineDiff: 0 },
        { file: "spec.master", status: "new", lineDiff: 0 },
      ],
    });
    expect(existsSync(join(root, ".flisk", ".flisk-out", "spec.master"))).toBe(false);
  }, 120_000);

  it("regenerate writes the files, after which a dry run finds nothing to change", () => {
    const root = createTempProject({ projectJson: VALID_PROJECT_JSON });
    const written = json(["config", "regenerate"], root);
    expect(written.status).toBe(0);
    expectQuietStdout(written);
    expect(parseEnvelope(written.stdout).data).toMatchObject({ dryRun: false, hasChanges: true });
    expect(existsSync(join(root, ".flisk", ".flisk-out", "spec.master"))).toBe(true);

    const again = parseEnvelope(json(["config", "regenerate", "--dry-run"], root).stdout).data;
    expect(again.hasChanges).toBe(false);
    expect(again.changes.map((change: { status: string }) => change.status)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
  }, 120_000);

  it("migrate reports the files it moved to the current schema", () => {
    const root = createTempProject({
      projectJson: VALID_PROJECT_JSON,
      stacks: { api: { gateway: { appType: "backend", port: 4100 } } },
    });
    const result = json(["config", "migrate"], root);
    expect(result.status).toBe(0);
    expect(parseEnvelope(result.stdout).data).toEqual({
      schemaVersion: 1,
      migrated: ["services/api/gateway/service.json"],
      warnings: [],
    });
    expect(readJson(join(root, "services", "api", "gateway", "service.json")).schemaVersion).toBe(
      1,
    );
  }, 120_000);

  it("migrate writes nothing and reports MIGRATE_FAILED when a file cannot be migrated", () => {
    const root = createTempProject({
      projectJson: VALID_PROJECT_JSON,
      stacks: {
        api: {
          gateway: { appType: "backend", port: 4100 },
          future: { appType: "backend", port: 4101, schemaVersion: 99 },
        },
      },
    });
    const gateway = join(root, "services", "api", "gateway", "service.json");
    const before = readFileSync(gateway, "utf-8");
    const result = json(["config", "migrate"], root);
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data).toBeNull();
    expect(envelope.errors).toEqual([
      expect.objectContaining({
        code: "MIGRATE_FAILED",
        message: expect.stringContaining("cannot migrate unsupported version 99"),
      }),
    ]);
    expect(readFileSync(gateway, "utf-8")).toBe(before);
  }, 120_000);

  it("enable-infra and disable-infra report the new and the previous value", () => {
    const root = createTempProject({ projectJson: VALID_PROJECT_JSON });
    const enabled = json(["config", "enable-infra", "monitoring"], root);
    expect(enabled.status).toBe(0);
    expect(parseEnvelope(enabled.stdout).data).toEqual({
      service: "monitoring",
      enabled: true,
      wasEnabled: false,
    });
    expect(readJson(join(root, ".flisk", "project.json")).optional_infra.monitoring).toBe(true);

    const disabled = json(["config", "disable-infra", "monitoring"], root);
    expect(parseEnvelope(disabled.stdout).data).toEqual({
      service: "monitoring",
      enabled: false,
      wasEnabled: true,
    });
  }, 120_000);

  it("enable-infra refuses an unknown service with a suggestion", () => {
    const result = json(["config", "enable-infra", "bogus"], createTempProject({}));
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors).toEqual([
      {
        code: "COMMAND_FAILED",
        message:
          "Invalid service. Must be one of: monitoring, elk, debezium, golden_image, verdaccio",
        suggestions: ["flisk config enable-infra monitoring"],
      },
    ]);
  }, 120_000);
});
