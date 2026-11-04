// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// In-process cases for `flisk stacks`: the JSON report, the plain and verbose listings, and the empty and
// not-in-project paths. Discovery is a double, so each case states the stacks it lists.

import { tmpdir } from "node:os";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeResource, parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import type { DiscoveredResource, DiscoveryContext } from "../../types/index.js";

const paths = vi.hoisted(() => ({
  findProjectRoot: vi.fn<() => string | null>(),
}));
const discovery = vi.hoisted(() => ({
  createDiscoveryContext: vi.fn<() => DiscoveryContext>(),
}));

vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  ...paths,
}));
vi.mock("../../utils/discovery-context.js", () => discovery);

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes from captured output.
const ANSI = /\u001b\[[0-9;]*m/g;

function contextWith(
  stacks: Array<{ name: string; description: string; resources: DiscoveredResource[] }>,
): DiscoveryContext {
  return {
    resources: stacks.flatMap((stack) => stack.resources),
    problems: [],
    stacks: stacks.map((stack) => ({
      ...stack,
      resourceCount: stack.resources.length,
    })) as unknown as DiscoveryContext["stacks"],
    stackNames: stacks.map((stack) => stack.name),
    unassignedResources: [],
    resourcesByStack: new Map(stacks.map((stack) => [stack.name, stack.resources])),
  };
}

const TWO_STACKS = contextWith([
  {
    name: "shop",
    description: "Storefront and API",
    resources: [makeResource("web", "frontend"), makeResource("orders-api", "backend")],
  },
  { name: "ops", description: "Background jobs", resources: [makeResource("jobs", "worker")] },
]);

/** A fresh module per case: Commander keeps option values on the command object between parses. */
async function loadStacksCommand(): Promise<Command> {
  vi.resetModules();
  return (await import("../stacks.js")).stacksCommand;
}

async function runStacks(args: string[], command?: Command) {
  const target = command ?? (await loadStacksCommand());
  const result = await runCommandInProcess(target, args, tmpdir());
  return { ...result, stdout: result.stdout.replace(ANSI, "") };
}

describe("flisk stacks (in-process)", () => {
  beforeEach(() => {
    paths.findProjectRoot.mockReturnValue("/project");
    discovery.createDiscoveryContext.mockReturnValue(TWO_STACKS);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("--json lists each stack with its resource count only", async () => {
    const run = await runStacks(["--json"]);
    const envelope = parseEnvelope(run.stdout);

    expect(run.status).toBeUndefined();
    expect(envelope.errors).toEqual([]);
    expect(envelope.data).toEqual({
      stacks: [
        { name: "shop", resourceCount: 2 },
        { name: "ops", resourceCount: 1 },
      ],
    });
  });

  it("--json --verbose --services adds descriptions and service names", async () => {
    const run = await runStacks(["--json", "--verbose", "--services"]);

    expect(parseEnvelope(run.stdout).data).toEqual({
      stacks: [
        {
          name: "shop",
          resourceCount: 2,
          description: "Storefront and API",
          services: ["web", "orders-api"],
        },
        { name: "ops", resourceCount: 1, description: "Background jobs", services: ["jobs"] },
      ],
    });
  });

  it("--json honours a --verbose flag set on the parent command", async () => {
    const stacks = await loadStacksCommand();
    const parent = new Command("flisk").option("--verbose", "verbose", false);
    parent.addCommand(stacks);
    parent.parseOptions(["--verbose"]);

    const run = await runStacks(["--json"], stacks);

    expect(parseEnvelope(run.stdout).data.stacks[0]).toEqual({
      name: "shop",
      resourceCount: 2,
      description: "Storefront and API",
    });
  });

  it("--json outside a project writes a COMMAND_FAILED envelope and exits 1", async () => {
    paths.findProjectRoot.mockReturnValue(null);

    const run = await runStacks(["--json"]);
    // The test exit throws, so the command's outer catch writes the envelope again; a real exit stops at the first line.
    const envelope = parseEnvelope(run.stdout.split("\n")[0] as string);

    expect(run.status).toBe(1);
    expect(envelope.data).toBeNull();
    expect(envelope.errors[0]?.code).toBe("COMMAND_FAILED");
    expect(envelope.errors[0]?.message).toContain("Could not find project root");
    expect(discovery.createDiscoveryContext).not.toHaveBeenCalled();
  });

  it("--json turns a discovery failure into an INTERNAL envelope and exits 2", async () => {
    discovery.createDiscoveryContext.mockImplementation(() => {
      throw new Error("manifest scan exploded");
    });

    const run = await runStacks(["--json"]);
    const envelope = parseEnvelope(run.stdout);

    expect(run.status).toBe(2);
    expect(envelope.errors).toEqual([{ code: "INTERNAL", message: "manifest scan exploded" }]);
  });

  it("lists stack names with service counts by default", async () => {
    const run = await runStacks([]);

    expect(run.status).toBeUndefined();
    expect(run.stdout).toContain("Found 2 stacks:");
    expect(run.stdout).toMatch(/ {2}shop\n\s+2 services/);
    expect(run.stdout).toMatch(/ {2}ops\n\s+1 service\b/);
    expect(run.stdout).toContain("Run with --verbose for more details");
  });

  it("counts a stack with no resource entry as zero services", async () => {
    const context = contextWith([{ name: "empty", description: "", resources: [] }]);
    context.resourcesByStack = new Map();
    discovery.createDiscoveryContext.mockReturnValue(context);

    const run = await runStacks([]);

    expect(run.stdout).toContain("Found 1 stack:");
    expect(run.stdout).toMatch(/empty\n\s+0 services/);
  });

  it("--verbose prints each stack's description without services", async () => {
    const run = await runStacks(["--verbose"]);

    expect(run.stdout).toContain("Found 2 stacks:");
    expect(run.stdout).toMatch(/shop\n\s+Storefront and API/);
    expect(run.stdout).toMatch(/ops\n\s+Background jobs/);
    expect(run.stdout).not.toContain("Services:");
    expect(run.stdout).not.toContain("Run with --verbose");
  });

  it("--services lists each stack's services", async () => {
    const run = await runStacks(["--services"]);

    expect(run.stdout).toMatch(
      /shop\n\s+Storefront and API\n\s+Services:\n {4}web\n {4}orders-api/,
    );
    expect(run.stdout).toMatch(/ops\n\s+Background jobs\n\s+Services:\n {4}jobs/);
  });

  it("shows the empty state when the project has no stacks", async () => {
    discovery.createDiscoveryContext.mockReturnValue(contextWith([]));

    const run = await runStacks([]);

    expect(run.status).toBeUndefined();
    expect(run.stdout).toContain("No stacks found.");
    expect(run.stdout).not.toContain("Found");
  });

  it("prints a discovery failure and exits 1 without --json", async () => {
    discovery.createDiscoveryContext.mockImplementation(() => {
      throw new Error("manifest scan exploded");
    });

    const run = await runStacks([]);

    expect(run.status).toBe(1);
    expect(run.stderr.replace(ANSI, "")).toContain("manifest scan exploded");
  });
});
