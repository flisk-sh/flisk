// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createTempDir, createTempProject, runTdk } from "../../test-support/index.js";

const commandsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One row per command that prints `--json` and can run in a temp project without Docker, Tilt or prompts.
 * Each row is checked against the `--json` contract, both in a project and outside one.
 */
const JSON_MATRIX: Array<{ command: string[]; project: Parameters<typeof createTempProject>[0] }> =
  [
    {
      command: ["stacks"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    {
      command: ["resources"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    { command: ["projects"], project: { resources: { api: { runtime: "node" } } } },
    {
      command: ["status"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    {
      command: ["networks"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    { command: ["config", "verify"], project: {} },
  ];

const VALID_PROJECT_JSON = {
  version: "1.0.0",
  project: { name: "test", version: "1.0.0" },
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
  discovery: { paths: ["services/**"] },
};

/** A valid project with generated Tilt files and one backend, so the commands below reach their plan. */
const CONFIGURED_PROJECT: Parameters<typeof createTempProject>[0] = {
  projectJson: VALID_PROJECT_JSON,
  stacks: { api: { gateway: { appType: "backend", port: 3100 } } },
  generated: { Tiltfile: "# generated\n", "docker-compose.yml": "services: {}\n" },
};

/**
 * One row per command that prints a dry-run plan without Docker or Tilt. `expect` is the text the plan prints.
 * `eject` prints no "Dry run" line; its plan is the list of files it would leave and write.
 */
const DRY_RUN_MATRIX: Array<{
  site: string;
  command: string[];
  project: Parameters<typeof createTempProject>[0];
  expect: string;
}> = [
  {
    site: "config regenerate --dry-run",
    command: ["config", "regenerate"],
    project: CONFIGURED_PROJECT,
    expect: "Dry run",
  },
  { site: "down --dry-run", command: ["down"], project: CONFIGURED_PROJECT, expect: "Dry run" },
  {
    site: "eject --dry-run",
    command: ["eject"],
    project: CONFIGURED_PROJECT,
    expect: "Files written:",
  },
  { site: "up --dry-run", command: ["up"], project: CONFIGURED_PROJECT, expect: "Dry run" },
];

/**
 * One row per command that runs non-interactively with `--yes` in a temp project. Each runs with stdin closed,
 * so a prompt that ignores `--yes` ends the run with an error instead of hanging.
 */
const YES_MATRIX: Array<{
  site: string;
  command: string[];
  project: Parameters<typeof createTempProject>[0];
}> = [
  { site: "eject --yes", command: ["eject"], project: CONFIGURED_PROJECT },
  {
    site: "stack --yes",
    command: ["stack", "api", "--resources", "web"],
    project: {
      ...CONFIGURED_PROJECT,
      resources: { web: { appType: "backend", port: 4000 } },
    },
  },
  {
    site: "resource --yes",
    command: ["resource", "web", "--type", "backend"],
    project: CONFIGURED_PROJECT,
  },
  { site: "project --yes", command: ["project"], project: CONFIGURED_PROJECT },
];

/**
 * `agent sessions --json` fails before any request when the session id is missing, so its error envelope runs in a
 * temp project with no agent process. The `site` names the command the same way the completeness check does.
 */
const AGENT_SESSIONS_JSON: {
  site: string;
  command: string[];
  project: Parameters<typeof createTempProject>[0];
} = {
  site: "agent sessions --json",
  command: ["agent", "sessions", "assistant"],
  project: { stacks: { api: { assistant: { appType: "agent", port: 3200 } } } },
};

/**
 * Commands and subcommands that register one of the three flags but have no matrix row yet. Each entry says why.
 * Shrinking this list is the work; a new entry needs a reason.
 */
const EXEMPT: Record<string, string> = {
  "doctor --json":
    "checks the host toolchain and probes ports; its exit status depends on the host, and its own test file covers the report",
  "doctor --dry-run":
    "only applies with --fix, which plans repairs by querying Docker networks; the plan depends on the host's Docker",
  "doctor --yes":
    "only applies with --fix, which removes Docker networks; a test run would act on the host's Docker",
  "down --json": "stops Tilt and containers; needs Tilt and a running stack",
  "logs --json": "reads container logs; needs a running stack",
  "restart --json": "restarts containers; needs a running stack",
  "runtime --json":
    "prints its own asset-check object, not the one-envelope shape this contract asserts; needs its own contract",
  "up --json": "starts containers; needs Docker",
  "upgrade --dry-run":
    "compares the install with origin/HEAD over git; its dry-run path prints no Dry run line",
  "upgrade --yes":
    "updates the installed CLI checkout, so a test run would rebuild the repo under test",
};

interface FlagSite {
  key: string;
  flags: string[];
}

/**
 * `--json` prints one envelope. Some commands pretty-print it over several lines, so the whole of stdout must parse
 * as one JSON value rather than one line.
 */
function parseOneEnvelope(stdout: string): {
  schemaVersion: number;
  data: unknown;
  errors: unknown[];
} {
  const envelope = JSON.parse(stdout) as {
    schemaVersion: number;
    data: unknown;
    errors: unknown[];
  };
  expect(Object.keys(envelope).sort()).toEqual(["data", "errors", "schemaVersion"]);
  return envelope;
}

/** Walks a Commander command and its subcommands, returning each one that registers a contract flag. */
function collectFlagSites(command: Command, prefix: string[] = []): FlagSite[] {
  const name = [...prefix, command.name()].filter(Boolean);
  const sites: FlagSite[] = [];
  for (const option of command.options) {
    if (option.long === "--json" || option.long === "--dry-run" || option.long === "--yes") {
      sites.push({ key: `${name.join(" ")} ${option.long}`, flags: [option.long] });
    }
  }
  for (const sub of command.commands) {
    sites.push(...collectFlagSites(sub, name));
  }
  return sites;
}

/** Every file under `dir` as a map of root-relative path to content, so a test can prove nothing was written. */
function snapshotTree(root: string, dir = root, out: Record<string, string> = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshotTree(root, full, out);
    else out[path.relative(root, full)] = fs.readFileSync(full, "utf-8");
  }
  return out;
}

/** The `<command> <flag>` sites that have a matrix row. */
function coveredSites(): Set<string> {
  return new Set([
    ...JSON_MATRIX.map((row) => `${row.command.join(" ")} --json`),
    ...DRY_RUN_MATRIX.map((row) => row.site),
    ...YES_MATRIX.map((row) => row.site),
    AGENT_SESSIONS_JSON.site,
  ]);
}

async function loadAllCommands(): Promise<Command[]> {
  const files = fs
    .readdirSync(commandsDir)
    .filter((file) => file.endsWith(".ts") && !file.includes(".test."));
  const commands: Command[] = [];
  for (const file of files) {
    const mod = (await import(path.join(commandsDir, file))) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (value && typeof value === "object" && "options" in value && "commands" in value) {
        commands.push(value as Command);
      }
    }
  }
  return commands;
}

describe("flag contract: --json", () => {
  it.each(JSON_MATRIX)(
    "tdk $command --json prints one envelope in a project",
    ({ command, project }) => {
      const root = createTempProject(project);
      const result = runTdk([...command, "--json"], { cwd: root });
      expect(result.stderr).not.toMatch(/^\{/m);
      const envelope = parseOneEnvelope(result.stdout);
      expect(envelope.schemaVersion).toBe(1);
      expect(Array.isArray(envelope.errors)).toBe(true);
    },
  );

  it.each(JSON_MATRIX)(
    "tdk $command --json outside a project fails with a null-data envelope",
    ({ command }) => {
      const result = runTdk([...command, "--json"], { cwd: createTempDir() });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Could not find project root");
      expect(result.stderr).not.toMatch(/^\{/m);
      const envelope = parseOneEnvelope(result.stdout);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
    },
  );
});

describe("flag contract: --json error envelope for agent sessions", () => {
  it(`${AGENT_SESSIONS_JSON.site} without --session-id fails with a null-data envelope`, () => {
    const root = createTempProject(AGENT_SESSIONS_JSON.project);
    const result = runTdk([...AGENT_SESSIONS_JSON.command, "--json"], { cwd: root });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toMatch(/^\{/m);
    const envelope = parseOneEnvelope(result.stdout);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.data).toBeNull();
    expect(envelope.errors).toEqual([expect.objectContaining({ code: "SESSION_ID_REQUIRED" })]);
  });
});

describe("flag contract: completeness", () => {
  it("every command that registers --json, --dry-run or --yes has a matrix row or an exemption", async () => {
    const sites = (await loadAllCommands()).flatMap((command) => collectFlagSites(command));
    expect(sites.length).toBeGreaterThan(0);

    const covered = coveredSites();
    const missing = sites
      .map((site) => site.key)
      .filter((key) => !covered.has(key) && !(key in EXEMPT));
    expect(missing).toEqual([]);
  });

  it("does not keep an exemption for a site that now has a matrix row", () => {
    const covered = coveredSites();
    expect(Object.keys(EXEMPT).filter((key) => covered.has(key))).toEqual([]);
  });

  it("flags an exemption that no longer matches a real flag, so the list cannot go stale", async () => {
    const sites = new Set(
      (await loadAllCommands())
        .flatMap((command) => collectFlagSites(command))
        .map((site) => site.key),
    );
    const stale = [...Object.keys(EXEMPT), ...coveredSites()].filter((key) => !sites.has(key));
    expect(stale).toEqual([]);
  });
});

describe("flag contract: --dry-run", () => {
  it.each(DRY_RUN_MATRIX)(
    "tdk $site prints its plan and writes nothing",
    ({ command, project, expect: line }) => {
      const root = createTempProject(project);
      const before = snapshotTree(root);
      const result = runTdk([...command, "--dry-run"], { cwd: root, input: "", timeout: 60_000 });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(line);
      expect(snapshotTree(root)).toEqual(before);
    },
  );
});

describe("flag contract: --yes", () => {
  it.each(YES_MATRIX)(
    "tdk $site runs without a prompt when stdin is closed",
    ({ command, project }) => {
      const root = createTempProject(project);
      const result = runTdk([...command, "--yes"], { cwd: root, input: "", timeout: 60_000 });
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/\(y\/n\)|\[y\/N\]/i);
    },
  );
});
