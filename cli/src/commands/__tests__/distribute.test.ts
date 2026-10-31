// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProject } from "../../test-support/index.js";
import {
  buildBoard,
  buildKit,
  buildStatusGrid,
  CHANNELS,
  createInitialDistribution,
  type DistributionFile,
  formatStatusGrid,
  readDistributionFile,
  URL_PLACEHOLDER,
  writeKit,
} from "../../utils/distribution.js";
import { discoverResourcesFromRoot } from "../../utils/services.js";

function project(dist?: DistributionFile): string {
  const root = createTempProject({
    resources: {
      helper: { appType: "mcp", port: 4100, healthCheckPath: "/healthz" },
      api: { appType: "backend", port: 3100 },
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
beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runCli(root: string, args: string[]): Promise<string> {
  process.chdir(root);
  const { distributeCommand } = await import("../distribute.js");
  await distributeCommand.parseAsync(args, { from: "user" });
  return logs.join("\n");
}

describe("distribute board", () => {
  it("fills cells from service.json and says what is missing without distribution.json", () => {
    const root = project();
    const board = buildBoard(discoverResourcesFromRoot(root), null);
    expect(board.rows.map((r) => r.stage)).toEqual([
      "Idea",
      "Promise",
      "Shape",
      "Ship",
      "Listed",
      "Proof",
    ]);
    const idea = board.rows[0]?.cells;
    expect(idea?.What.text).toBe("2 resources: api (backend), helper (mcp)");
    expect(idea?.Who.isMissing).toBe(true);
    expect(idea?.Who.text).toContain("flisk distribute status --init");
    const shape = board.rows[2]?.cells;
    expect(shape?.Where.text).toBe("api:3100, helper:4100");
    expect(shape?.How.text).toBe("MCP routes: helper /mcp");
    expect(board.rows[3]?.cells.What.text).toBe("api /health, helper /healthz");
  });

  it("fills cells from distribution.json", () => {
    const board = buildBoard(discoverResourcesFromRoot(project(fullDist)), fullDist);
    expect(board.rows[0]?.cells.Who).toEqual({ text: "Developers and their AI", isMissing: false });
    expect(board.rows[1]?.cells.What.text).toBe("helper: Plan an app in one sentence");
    expect(board.rows[4]?.cells.What.text).toContain("✅ 1 live");
    expect(board.rows[4]?.cells.Where.text).toBe("Claude directory, Toolradar");
    expect(board.rows[5]?.cells.Where.text).toBe("https://claude.ai/directory/helper");
  });

  it("--json prints one envelope with six rows of six columns", async () => {
    const out = await runCli(project(), ["board", "--json"]);
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
    expect(() => writeKit(kit, out, false)).toThrow(/already exists/);
    expect(writeKit(kit, out, true)).toHaveLength(4);
  });

  it("--dry-run prints the kit and writes nothing", async () => {
    const root = project(fullDist);
    const out = await runCli(root, ["kit", "helper", "--dry-run"]);
    expect(out).toContain("Dry run - would write 4 files");
    expect(out).toContain("--- server.json ---");
    expect(fs.existsSync(path.join(root, "distribution"))).toBe(false);
  });

  it("writes to distribution/<resource> by default", async () => {
    const root = project(fullDist);
    await runCli(root, ["kit", "helper"]);
    expect(fs.existsSync(path.join(root, "distribution", "helper", "listing.md"))).toBe(true);
    expect(
      fs.existsSync(path.join(root, "distribution", "helper", ".claude-plugin", "plugin.json")),
    ).toBe(true);
  });
});

describe("distribute status", () => {
  it("prints the channel grid with icons", () => {
    const grid = buildStatusGrid(fullDist);
    expect(grid.apps).toEqual(["helper"]);
    const text = formatStatusGrid(grid);
    expect(text).toContain("| Claude directory | ✅ |");
    expect(text).toContain("| Toolradar | ⏳ |");
    expect(text).toContain("| npm | ⬜ |");
    expect(text).toContain("— n/a");
  });

  it("--init lists resources and channels, MCP-only channels n/a for a backend", async () => {
    const root = project();
    await runCli(root, ["status", "--init"]);
    const written = readDistributionFile(root);
    expect(written).toEqual(createInitialDistribution(discoverResourcesFromRoot(root)));
    expect(Object.keys(written?.apps ?? {})).toEqual(["api", "helper"]);
    expect(written?.apps.api?.channels?.["mcp-registry"]?.status).toBe("n/a");
    expect(written?.apps.helper?.channels?.["mcp-registry"]?.status).toBe("todo");
    expect(Object.keys(written?.apps.helper?.channels ?? {})).toEqual(CHANNELS.map((c) => c.id));
  });

  it("--json prints the grid envelope", async () => {
    const out = await runCli(project(fullDist), ["status", "--json"]);
    const envelope = JSON.parse(out);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data.grid.apps).toEqual(["helper"]);
    expect(envelope.data.grid.channels[0]).toMatchObject({
      id: "claude-directory",
      cells: { helper: { status: "live" } },
    });
  });

  it("rejects an unknown status", () => {
    const root = project();
    fs.writeFileSync(
      path.join(root, "distribution.json"),
      JSON.stringify({ apps: { api: { channels: { npm: { status: "done" } } } } }),
    );
    expect(() => readDistributionFile(root)).toThrow(/api \/ npm has status "done"/);
  });
});
