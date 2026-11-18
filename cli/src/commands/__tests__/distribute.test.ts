// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProject, runCommandInProcess } from "../../test-support/index.js";
import {
  buildBoard,
  buildKit,
  buildStatusGrid,
  CHANNELS,
  createInitialDistribution,
  type DistributionFile,
  distributionWarnings,
  formatStatusGrid,
  readDistributionFile,
  readToolsAndPrompts,
  slugify,
  URL_PLACEHOLDER,
  writeKit,
} from "../../utils/distribution.js";
import { FliskError } from "../../utils/errors.js";
import { discoverResourcesFromRoot } from "../../utils/services.js";

function project(dist?: DistributionFile): string {
  const root = createTempProject({
    resources: {
      helper: { appType: "mcp", port: 4100, healthCheckPath: "/healthz" },
      api: { appType: "backend", port: 3100, dependsOn: ["helper"] },
    },
  });
  fs.mkdirSync(path.join(root, "services", "helper", "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "services", "helper", "src", "server.ts"),
    'server.registerTool("plan_app", {}); server.registerTool("check_site", {});\nserver.registerPrompt("build_my_app", {});\n',
  );
  if (dist) fs.writeFileSync(path.join(root, "distribution.json"), JSON.stringify(dist));
  return root;
}

const fullDist: DistributionFile = {
  schemaVersion: 1,
  owner: "Flisk",
  githubOwner: "flisk-sh",
  audience: "Developers and their AI",
  launch: "2026-11-01",
  why: "A running app, no account",
  promise: "Free and read-only",
  apps: {
    helper: {
      name: "Helper",
      tagline: "Plan an app in one sentence",
      description: "Plans an app.",
      url: "https://helper.example.com/mcp",
      bestFor: ["people starting an app"],
      channels: {
        "claude-directory": {
          status: "live",
          url: "https://claude.ai/directory/helper",
          date: "2026-10-30",
        },
        toolradar: { status: "review", date: "2026-10-31" },
      },
    },
  },
};

const originalCwd = process.cwd();
let logs: string[] = [];
let warns: string[] = [];
let errors: string[] = [];
beforeEach(() => {
  logs = [];
  warns = [];
  errors = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warns.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.join(" "));
  });
});
afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runDistribute(root: string, args: string[]): Promise<string> {
  process.chdir(root);
  const { distributeCommand } = await import("../distribute.js");
  await distributeCommand.parseAsync(args, { from: "user" });
  return logs.join("\n");
}

describe("distribute board", () => {
  it("fills cells from service.json and says what is missing without distribution.json", () => {
    const root = project();
    const board = buildBoard(discoverResourcesFromRoot(root), null);
    expect(board.rows.map((r) => `${r.perspective}/${r.view}/${r.stage}`)).toEqual([
      "Planner/Scope/Idea",
      "Owner/Business/Promise",
      "Designer/System/Shape",
      "Builder/Technology/Ship",
      "Subcontractor/Component/Listed",
      "User/Operations/Proof",
    ]);
    const scope = board.rows[0]?.cells;
    expect(scope?.What.text).toBe("2 resources: api (backend), helper (mcp)");
    expect(scope?.Who.isMissing).toBe(true);
    expect(scope?.Who.text).toContain("flisk distribute status --init");
    const system = board.rows[2]?.cells;
    expect(system?.Where.text).toBe("api:3100, helper:4100");
    expect(system?.How.text).toBe("MCP routes: helper /mcp");
    expect(system?.When.text).toBe("api: after helper");
    expect(system?.Why.text).toBe("helper: /healthz");
    expect(board.rows[4]?.cells.What.text).toBe("helper/check_site, helper/plan_app");
  });

  it("has no always-filled cell: with no data every distribution cell is missing", () => {
    const board = buildBoard([], null);
    for (const row of board.rows) {
      for (const cell of Object.values(row.cells)) expect(cell.isMissing).toBe(true);
    }
  });

  it("fills cells from distribution.json", () => {
    const board = buildBoard(discoverResourcesFromRoot(project(fullDist)), fullDist);
    expect(board.rows[0]?.cells.Who).toEqual({ text: "Developers and their AI", isMissing: false });
    expect(board.rows[1]?.cells.What.text).toBe("helper: Plan an app in one sentence");
    expect(board.rows[4]?.cells.Where.text).toBe("Claude directory (connector), Toolradar");
    expect(board.rows[5]?.cells.What.text).toBe("1 live listings");
    expect(board.rows[5]?.cells.Where.text).toBe("https://claude.ai/directory/helper");
    expect(board.rows[5]?.cells.When.text).toBe("2026-10-30");
    expect(board.rows[3]?.cells.Who.text).toBe("flisk-sh");
  });

  it("only lists a channel in the plan after it leaves todo", () => {
    const dist: DistributionFile = {
      schemaVersion: 1,
      apps: { helper: { channels: { toolradar: { status: "todo" } } } },
    };
    const resources = discoverResourcesFromRoot(project(dist));
    expect(buildBoard(resources, dist).rows[0]?.cells.Where.isMissing).toBe(true);
    const planned: DistributionFile = {
      schemaVersion: 1,
      apps: { helper: { channels: { toolradar: { status: "draft" } } } },
    };
    expect(buildBoard(resources, planned).rows[0]?.cells.Where).toEqual({
      text: "Toolradar",
      isMissing: false,
    });
  });

  it("--json prints one envelope with six rows of six columns", async () => {
    const out = await runDistribute(project(), ["board", "--json"]);
    const envelope = JSON.parse(out);
    expect(Object.keys(envelope).sort()).toEqual(["data", "errors", "schemaVersion"]);
    expect(envelope.data.board.rows).toHaveLength(6);
    expect(Object.keys(envelope.data.board.rows[0].cells)).toEqual([
      "What",
      "How",
      "Where",
      "Who",
      "When",
      "Why",
    ]);
  });
});

describe("channels", () => {
  it("lists every marketplace we use, MCP-only ones marked", () => {
    expect(CHANNELS.map((c) => c.id)).toEqual([
      "claude-directory",
      "claude-plugin",
      "toolradar",
      "product-hunt",
      "mcp-registry",
      "glama",
      "smithery",
      "mcp-so",
      "pulsemcp",
      "cursor-directory",
      "skills-sh",
      "apify",
      "docker-hub",
      "github-actions",
      "npm",
      "openai",
      "awesome-lists",
    ]);
    expect(CHANNELS.filter((c) => c.isMcpOnly).map((c) => c.id)).toEqual([
      "claude-directory",
      "mcp-registry",
      "glama",
      "smithery",
      "mcp-so",
      "pulsemcp",
      "cursor-directory",
      "openai",
    ]);
    for (const c of CHANNELS) {
      expect(c.submit.length).toBeGreaterThan(0);
      expect(c.limits.length).toBeGreaterThan(0);
    }
    expect(CHANNELS.find((c) => c.id === "smithery")?.limits.join(" ")).toContain("smithery.yaml");
  });
});

describe("distribute kit", () => {
  it("writes plugin.json, .mcp.json, server.json and listing.md for an MCP resource", () => {
    const root = project(fullDist);
    const helper = discoverResourcesFromRoot(root).find((r) => r.name === "helper");
    if (!helper) throw new Error("no helper");
    const kit = buildKit(helper, fullDist);
    expect(kit.files.map((f) => f.path)).toEqual([
      ".claude-plugin/plugin.json",
      ".mcp.json",
      "server.json",
      "listing.md",
    ]);
    const mcp = JSON.parse(kit.files[1]?.content ?? "");
    expect(mcp.mcpServers.helper).toEqual({ type: "http", url: "https://helper.example.com/mcp" });
    const server = JSON.parse(kit.files[2]?.content ?? "");
    expect(server.name).toBe("io.github.flisk-sh/helper");
    expect(server.remotes).toEqual([
      { type: "streamable-http", url: "https://helper.example.com/mcp" },
    ]);
    const listing = kit.files[3]?.content ?? "";
    expect(listing).toContain("`plan_app`");
    expect(listing).toContain("`check_site`");
    expect(listing).toContain("`build_my_app`");
    for (const channel of CHANNELS) expect(listing).toContain(channel.name);
    expect(listing).toContain("Tagline at most 60 characters.");
    expect(kit.warnings).toEqual([]);
  });

  it("uses a placeholder URL and warns about a long tagline", () => {
    const dist: DistributionFile = {
      schemaVersion: 1,
      apps: { helper: { tagline: "x".repeat(61), description: "d" } },
    };
    const helper = discoverResourcesFromRoot(project(dist)).find((r) => r.name === "helper");
    if (!helper) throw new Error("no helper");
    const kit = buildKit(helper, dist);
    expect(JSON.parse(kit.files[1]?.content ?? "").mcpServers.helper.url).toBe(URL_PLACEHOLDER);
    expect(kit.warnings.some((w) => w.includes("61 characters") && w.includes("60"))).toBe(true);
    expect(kit.warnings.some((w) => w.includes("No public URL"))).toBe(true);
  });

  it("warns on every per-channel limit", () => {
    const dist: DistributionFile = {
      schemaVersion: 1,
      apps: {
        helper: {
          name: "N".repeat(31),
          tagline: "t".repeat(40),
          description: "d".repeat(261),
          url: "https://helper.example.com/mcp",
        },
      },
    };
    const helper = discoverResourcesFromRoot(project(dist)).find((r) => r.name === "helper");
    if (!helper) throw new Error("no helper");
    const w = buildKit(helper, dist).warnings.join("\n");
    expect(w).toContain("OpenAI allows 30 for shortDescription");
    expect(w).toContain("Product Hunt allows 260");
    expect(w).toContain("MCP Registry allows 100");
    expect(w).toContain("OpenAI allows 30 for displayName");
    expect(w).toContain('No GitHub owner: add "githubOwner"');
    expect(w).toContain('No owner: add "owner"');
  });

  it("uses the slug in plugin.json, .mcp.json and server.json", () => {
    expect(slugify("My_Helper.App")).toBe("my-helper-app");
    const root = project(fullDist);
    const helper = discoverResourcesFromRoot(root).find((r) => r.name === "helper");
    if (!helper) throw new Error("no helper");
    const kit = buildKit({ ...helper, name: "Helper_X" }, fullDist);
    expect(JSON.parse(kit.files[0]?.content ?? "").name).toBe("helper-x");
    expect(Object.keys(JSON.parse(kit.files[1]?.content ?? "").mcpServers)).toEqual(["helper-x"]);
    expect(JSON.parse(kit.files[2]?.content ?? "").name).toBe("io.github.flisk-sh/helper-x");
  });

  it("finds tools and prompts only on MCP server objects", () => {
    const dir = fs.mkdtempSync(path.join(project(), "tools-"));
    fs.writeFileSync(
      path.join(dir, "a.ts"),
      [
        'foo.tool("not_a_tool");',
        'server.registerTool({ name: "object_tool", title: "x" }, handler);',
        'mcp.tool("short_tool", {});',
        'server.registerPrompt({ name: "object_prompt" });',
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(dir, "b.py"),
      "@mcp.tool\ndef bare_tool():\n    pass\n\n@mcp.prompt()\nasync def py_prompt():\n    pass\n",
    );
    expect(readToolsAndPrompts(dir)).toEqual({
      tools: ["bare_tool", "object_tool", "short_tool"],
      prompts: ["object_prompt", "py_prompt"],
    });
  });

  it("writes no .mcp.json or server.json for a backend", () => {
    const api = discoverResourcesFromRoot(project()).find((r) => r.name === "api");
    if (!api) throw new Error("no api");
    expect(buildKit(api, null).files.map((f) => f.path)).toEqual([
      ".claude-plugin/plugin.json",
      "listing.md",
    ]);
  });

  it("refuses to overwrite without --force", () => {
    const root = project(fullDist);
    const helper = discoverResourcesFromRoot(root).find((r) => r.name === "helper");
    if (!helper) throw new Error("no helper");
    const kit = buildKit(helper, fullDist);
    const out = path.join(root, "kit");
    writeKit(kit, out, false);
    fs.writeFileSync(path.join(out, "listing.md"), "edited by hand");
    expect(() => writeKit(kit, out, false)).toThrow(FliskError);
    expect(() => writeKit(kit, out, false)).toThrow(/already exists/);
    expect(fs.readFileSync(path.join(out, "listing.md"), "utf-8")).toBe("edited by hand");
    expect(writeKit(kit, out, true)).toHaveLength(4);
  });

  it("--dry-run prints the kit and writes nothing", async () => {
    const root = project(fullDist);
    const before = fs.readdirSync(root).sort();
    const out = await runDistribute(root, ["kit", "helper", "--dry-run"]);
    expect(fs.readdirSync(root).sort()).toEqual(before);
    expect(out).toContain("Dry run - would write 4 files");
    expect(out).toContain("--- server.json ---");
    expect(fs.existsSync(path.join(root, "distribution"))).toBe(false);
  });

  it("writes to distribution/<resource> by default", async () => {
    const root = project(fullDist);
    await runDistribute(root, ["kit", "helper"]);
    expect(fs.existsSync(path.join(root, "distribution", "helper", "listing.md"))).toBe(true);
    expect(
      fs.existsSync(path.join(root, "distribution", "helper", ".claude-plugin", "plugin.json")),
    ).toBe(true);
  });
  it("shows usage examples in the kit help text", async () => {
    const { distributeCommand } = await import("../distribute.js");
    const kit = distributeCommand.commands.find((c) => c.name() === "kit");
    expect(kit).toBeDefined();
    let out = "";
    kit?.configureOutput({
      writeOut: (s) => {
        out += s;
      },
    });
    kit?.outputHelp();
    expect(out).toContain("Examples:");
    expect(out).toContain("flisk distribute kit my-resource --dry-run");
    expect(out).toContain("flisk distribute kit my-resource --out ./listing");
    expect(out).toContain("flisk distribute kit my-resource --force");
  });
});

describe("distribute status", () => {
  it("prints the channel grid with icons", () => {
    const grid = buildStatusGrid(fullDist);
    expect(grid.apps).toEqual(["helper"]);
    const text = formatStatusGrid(grid);
    expect(text).toContain("| Claude directory (connector) | ✅ |");
    expect(text).toContain("| Toolradar | ⏳ |");
    expect(text).toContain("| npm | ⬜ |");
    expect(text).toContain("— n/a");
  });

  it("--init lists resources and channels, MCP-only channels n/a for a backend", async () => {
    const root = project();
    await runDistribute(root, ["status", "--init"]);
    const written = readDistributionFile(root);
    expect(written).toEqual(createInitialDistribution(discoverResourcesFromRoot(root)));
    expect(Object.keys(written?.apps ?? {})).toEqual(["api", "helper"]);
    expect(written?.apps.api?.channels?.["mcp-registry"]?.status).toBe("n/a");
    expect(written?.apps.helper?.channels?.["mcp-registry"]?.status).toBe("todo");
    expect(Object.keys(written?.apps.helper?.channels ?? {})).toEqual(CHANNELS.map((c) => c.id));
  });

  it("--json prints the grid envelope", async () => {
    const out = await runDistribute(project(fullDist), ["status", "--json"]);
    const envelope = JSON.parse(out);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data.grid.apps).toEqual(["helper"]);
    expect(envelope.data.grid.channels[0]).toMatchObject({
      id: "claude-directory",
      cells: { helper: { status: "live" } },
    });
  });

  it("--init refuses an existing file; --init --force merges and keeps entries", async () => {
    const root = project();
    const file = path.join(root, "distribution.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        owner: "Flisk",
        apps: {
          helper: { tagline: "kept", channels: { npm: { status: "live", url: "https://x" } } },
          gone: { channels: {} },
        },
      }),
    );
    const before = fs.readFileSync(file, "utf-8");
    await expect(runDistribute(root, ["status", "--init"])).rejects.toThrow();
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    await runDistribute(root, ["status", "--init", "--force"]);
    const merged = readDistributionFile(root);
    expect(merged?.owner).toBe("Flisk");
    expect(merged?.apps.helper?.tagline).toBe("kept");
    expect(merged?.apps.helper?.channels?.npm).toEqual({ status: "live", url: "https://x" });
    expect(merged?.apps.helper?.channels?.smithery?.status).toBe("todo");
    expect(Object.keys(merged?.apps ?? {})).toEqual(["api", "gone", "helper"]);
  });

  it("rejects malformed shapes and warns on unknown channel ids", () => {
    const root = project();
    const file = path.join(root, "distribution.json");
    fs.writeFileSync(file, "{ not json");
    expect(() => readDistributionFile(root)).toThrow(/not valid JSON/);
    fs.writeFileSync(file, JSON.stringify({ apps: { api: { channels: "npm" } } }));
    expect(() => readDistributionFile(root)).toThrow(/"channels" must be an object/);
    fs.writeFileSync(file, JSON.stringify({ apps: { api: { channels: [] } } }));
    expect(() => readDistributionFile(root)).toThrow(/"channels" must be an object/);
    fs.writeFileSync(file, JSON.stringify({ apps: { api: "x" } }));
    expect(() => readDistributionFile(root)).toThrow(/app api must be an object/);
    fs.writeFileSync(
      file,
      JSON.stringify({ apps: { api: { channels: { producthunt: { status: "todo" } } } } }),
    );
    expect(distributionWarnings(readDistributionFile(root))).toEqual([
      expect.stringContaining('api has unknown channel "producthunt"'),
    ]);
  });

  it("rejects an unknown status", () => {
    const root = project();
    fs.writeFileSync(
      path.join(root, "distribution.json"),
      JSON.stringify({ apps: { api: { channels: { npm: { status: "done" } } } } }),
    );
    expect(() => readDistributionFile(root)).toThrow(/api \/ npm has status "done"/);
  });

  it("--init --merge keeps existing entries and adds missing apps and channels", async () => {
    const root = project();
    const file = path.join(root, "distribution.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        owner: "Flisk",
        apps: {
          helper: { tagline: "kept", channels: { npm: { status: "live", url: "https://x" } } },
          gone: { channels: {} },
        },
      }),
    );
    await runDistribute(root, ["status", "--init", "--merge"]);
    const merged = readDistributionFile(root);
    expect(merged?.owner).toBe("Flisk");
    expect(merged?.apps.helper?.tagline).toBe("kept");
    expect(merged?.apps.helper?.channels?.npm).toEqual({ status: "live", url: "https://x" });
    expect(merged?.apps.helper?.channels?.smithery?.status).toBe("todo");
    expect(Object.keys(merged?.apps ?? {})).toEqual(["api", "gone", "helper"]);
  });

  it("--init --force still merges but points at --merge and --reset", async () => {
    const root = project();
    fs.writeFileSync(
      path.join(root, "distribution.json"),
      JSON.stringify({ apps: { helper: { tagline: "kept", channels: {} } } }),
    );
    await runDistribute(root, ["status", "--init", "--force"]);
    expect(readDistributionFile(root)?.apps.helper?.tagline).toBe("kept");
    expect(warns.join("\n")).toContain("--merge");
    expect(warns.join("\n")).toContain("--reset");
  });

  it("--init --reset replaces the existing entries", async () => {
    const root = project();
    fs.writeFileSync(
      path.join(root, "distribution.json"),
      JSON.stringify({ owner: "Old", apps: { helper: { tagline: "kept", channels: {} } } }),
    );
    await runDistribute(root, ["status", "--init", "--reset"]);
    const fresh = readDistributionFile(root);
    expect(fresh?.owner).toBeUndefined();
    expect(fresh?.apps.helper?.tagline).toBe("");
    expect(Object.keys(fresh?.apps ?? {})).toEqual(["api", "helper"]);
  });

  it("--init --dry-run writes nothing and prints the additions", async () => {
    const root = project();
    const file = path.join(root, "distribution.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        apps: { helper: { tagline: "kept", channels: { npm: { status: "live" } } } },
      }),
    );
    const before = fs.readFileSync(file, "utf-8");
    const out = await runDistribute(root, ["status", "--init", "--merge", "--dry-run"]);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    expect(out).toContain("Dry run");
    expect(out).toContain("add app: api");
    expect(out).toContain("add channel: helper/smithery");
    expect(out).toContain("nothing written");
  });

  it("--init --dry-run --json prints a machine envelope and writes nothing", async () => {
    const root = project();
    const file = path.join(root, "distribution.json");
    const before = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
    const { distributeCommand } = await import("../distribute.js");
    const result = await runCommandInProcess(
      distributeCommand,
      ["status", "--init", "--dry-run", "--json"],
      root,
    );
    expect(result.status).toBeUndefined();
    const envelope = JSON.parse(result.stdout);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data.dryRun).toBe(true);
    expect(Object.keys(envelope.data.distribution.apps).sort()).toEqual(["api", "helper"]);
    expect(fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null).toBe(before);
  });

  it("--init --reset overwrites a corrupt distribution.json without stale warnings", async () => {
    const root = project();
    const file = path.join(root, "distribution.json");
    fs.writeFileSync(file, "{ not json");
    const out = await runDistribute(root, ["status", "--init", "--reset"]);
    expect(out).toContain("Reset distribution.json");
    expect(warns.join("\n")).toBe("");
    expect(Object.keys(readDistributionFile(root)?.apps ?? {})).toEqual(["api", "helper"]);
  });

  it("--init --force on a fresh project does not emit the existing-file merge hint", async () => {
    const root = project();
    await runDistribute(root, ["status", "--init", "--force"]);
    expect(warns.join("\n")).not.toContain("--force now merges");
    expect(Object.keys(readDistributionFile(root)?.apps ?? {})).toEqual(["api", "helper"]);
  });

  for (const flag of ["--merge", "--reset", "--force", "--dry-run"]) {
    it(`${flag} without --init is a usage error`, async () => {
      const root = project(fullDist);
      const { distributeCommand } = await import("../distribute.js");
      const result = await runCommandInProcess(distributeCommand, ["status", flag], root);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("only with --init");
    });

    it(`${flag} --json without --init writes a machine error envelope`, async () => {
      const root = project(fullDist);
      const { distributeCommand } = await import("../distribute.js");
      const result = await runCommandInProcess(distributeCommand, ["status", flag, "--json"], root);
      expect(result.status).toBe(2);
      const envelope = JSON.parse(result.stdout);
      expect(envelope.data).toBeNull();
      expect(envelope.errors[0].message).toContain("only with --init");
    });
  }

  it("the already-exists hint names --merge and --reset", async () => {
    const root = project();
    fs.writeFileSync(path.join(root, "distribution.json"), JSON.stringify({ apps: {} }));
    await expect(runDistribute(root, ["status", "--init"])).rejects.toThrow();
    const shown = errors.join("\n");
    expect(shown).toContain("--merge");
    expect(shown).toContain("--reset");
  });

  it("the --init help documents --merge, --reset and --dry-run", async () => {
    const { distributeCommand } = await import("../distribute.js");
    const status = distributeCommand.commands.find((c) => c.name() === "status");
    expect(status).toBeDefined();
    let out = "";
    status?.configureOutput({
      writeOut: (s) => {
        out += s;
      },
    });
    status?.outputHelp();
    expect(out).toContain("--merge");
    expect(out).toContain("--reset");
    expect(out).toContain("--dry-run");
  });
});
