// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { agentSkillFiles } from "./agent-skills.js";
import { FliskError } from "./errors.js";
import { suggestClosest } from "./suggestions.js";

/**
 * `flisk connect <host>`: give a coding agent the Flisk runtime. It writes the `flisk mcp` server entry where the host
 * reads MCP servers (the formats in docs/agent-tooling/flisk-mcp-setup.md) and the Flisk skills where the host reads
 * skills (the same files `flisk project` writes). Every write is a merge: other servers and other keys stay, and a
 * second run changes nothing.
 */

export const CONNECT_HOSTS = ["claude", "cursor", "codex"] as const;
export type ConnectHost = (typeof CONNECT_HOSTS)[number];
export type ConnectScope = "project" | "global";

const HOST_ALIASES: Record<string, ConnectHost> = {
  claude: "claude",
  "claude-code": "claude",
  cursor: "cursor",
  codex: "codex",
};

export const MCP_SERVER_NAME = "flisk";

interface HostSpec {
  label: string;
  format: "json" | "toml";
  /** The MCP config file, relative to the project root. */
  projectFile: string;
  /** The MCP config file in the user's home directory, or null when Flisk does not edit the host's user config. */
  globalFile: string | null;
  /** The skill directories the host reads, relative to the project root. */
  skillDirs: readonly string[];
  /** What to do after connecting. */
  next: string[];
}

export const HOST_SPECS: Record<ConnectHost, HostSpec> = {
  claude: {
    label: "Claude Code",
    format: "json",
    projectFile: ".mcp.json",
    // Claude Code keeps user-scope servers in ~/.claude.json next to its own state; `claude mcp add` owns that file.
    globalFile: null,
    skillDirs: [".claude/skills"],
    next: [
      "Start Claude Code in this folder (`claude`) and approve the project server `flisk` when it asks",
      "Run /mcp inside Claude Code to confirm `flisk` is connected",
    ],
  },
  cursor: {
    label: "Cursor",
    format: "json",
    projectFile: ".cursor/mcp.json",
    globalFile: ".cursor/mcp.json",
    skillDirs: [".agents/skills"],
    next: [
      "Open this folder in Cursor and check that the `flisk` MCP server is listed and enabled in its MCP settings",
    ],
  },
  codex: {
    label: "Codex",
    format: "toml",
    projectFile: ".codex/config.toml",
    globalFile: ".codex/config.toml",
    skillDirs: [".agents/skills"],
    next: [
      "Start Codex in this folder (`codex`); it loads a project .codex/config.toml only for trusted projects",
      "Run /mcp inside Codex (or `codex mcp list`) to confirm `flisk` is connected",
    ],
  },
};

/** Resolve a host name or alias, or throw a FliskError that lists the hosts and the closest match. */
export function resolveConnectHost(input: string): ConnectHost {
  const host = HOST_ALIASES[input.trim().toLowerCase()];
  if (host) return host;
  const closest = suggestClosest(input, Object.keys(HOST_ALIASES));
  throw new FliskError(
    `Unknown agent host "${input}". Supported hosts: ${CONNECT_HOSTS.join(", ")}`,
    [
      ...(closest ? [`Did you mean "${closest}"? Run \`flisk connect ${closest}\``] : []),
      `Run \`flisk connect <${CONNECT_HOSTS.join("|")}>\` from your project folder`,
      "Any other MCP client: add the stdio server `flisk mcp` by hand (docs/agent-tooling/flisk-mcp-setup.md)",
    ],
    2,
  );
}

/** The MCP server entry for a JSON config (Claude Code, Cursor). */
/** Cursor's variable for the folder that holds .cursor/mcp.json, written literally into the config. */
export const CURSOR_WORKSPACE_FOLDER = "$" + "{workspaceFolder}";

export function jsonServerEntry(
  host: ConnectHost,
  platform: NodeJS.Platform = process.platform,
): Record<string, unknown> {
  if (host === "cursor") {
    // Cursor has no cwd key: the `cd` pins the server to the folder that holds .cursor/mcp.json, as the setup guide
    // describes. Windows has no `sh`, so it gets the plain entry and Cursor's own launch directory.
    if (platform === "win32") return { type: "stdio", command: "flisk", args: ["mcp"] };
    return {
      type: "stdio",
      command: "sh",
      args: ["-c", `cd "${CURSOR_WORKSPACE_FOLDER}" && exec flisk mcp`],
    };
  }
  return { command: "flisk", args: ["mcp"] };
}

/** The `[mcp_servers.flisk]` table for Codex. A project entry pins `cwd` to the project root. */
export function tomlServerBlock(projectRoot: string | null): string {
  const lines = [`[mcp_servers.${MCP_SERVER_NAME}]`, 'command = "flisk"', 'args = ["mcp"]'];
  if (projectRoot) lines.push(`cwd = ${JSON.stringify(projectRoot)}`);
  return `${lines.join("\n")}\n`;
}

export type ChangeAction = "create" | "update" | "unchanged" | "kept";

export interface ConnectChange {
  /** Absolute path of the file. */
  path: string;
  kind: "mcp" | "skill";
  /**
   * create: the file is new. update: the file exists and gains or replaces the flisk entry (or skill text).
   * unchanged: already up to date. kept: a different flisk entry or an edited skill is already there and is left
   * alone; `--force` replaces it.
   */
  action: ChangeAction;
}

export interface ConnectOptions {
  host: ConnectHost;
  scope: ConnectScope;
  projectRoot: string;
  homeDir: string;
  dryRun?: boolean;
  force?: boolean;
  platform?: NodeJS.Platform;
}

export interface ConnectResult {
  host: ConnectHost;
  label: string;
  scope: ConnectScope;
  projectRoot: string;
  dryRun: boolean;
  changes: ConnectChange[];
  next: string[];
}

interface PlannedWrite {
  change: ConnectChange;
  contents?: string;
}

function invalidConfig(file: string, reason: string): FliskError {
  return new FliskError(`Cannot merge into ${file}: ${reason}`, [
    "Fix the file by hand (or move it aside), then run `flisk connect` again",
    "Nothing was written",
  ]);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function planJsonConfig(
  file: string,
  entry: Record<string, unknown>,
  force: boolean,
): PlannedWrite {
  if (!existsSync(file)) {
    const contents = `${JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: entry } }, null, 2)}\n`;
    return { change: { path: file, kind: "mcp", action: "create" }, contents };
  }
  const raw = readFileSync(file, "utf-8");
  let config: unknown;
  try {
    config = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch (error) {
    throw invalidConfig(file, `it is not valid JSON (${(error as Error).message})`);
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw invalidConfig(file, "the top level is not a JSON object");
  }
  const root = config as Record<string, unknown>;
  const servers = root.mcpServers ?? {};
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    throw invalidConfig(file, '"mcpServers" is not an object');
  }
  const existing = (servers as Record<string, unknown>)[MCP_SERVER_NAME];
  if (existing !== undefined && sameJson(existing, entry)) {
    return { change: { path: file, kind: "mcp", action: "unchanged" } };
  }
  if (existing !== undefined && !force) {
    return { change: { path: file, kind: "mcp", action: "kept" } };
  }
  const merged = {
    ...root,
    mcpServers: { ...(servers as Record<string, unknown>), [MCP_SERVER_NAME]: entry },
  };
  return {
    change: { path: file, kind: "mcp", action: "update" },
    contents: `${JSON.stringify(merged, null, 2)}\n`,
  };
}

const TOML_HEADER = /^\s*\[\s*mcp_servers\s*\.\s*(?:flisk|"flisk")\s*\]\s*(?:#.*)?$/;
const TOML_ANY_HEADER = /^\s*\[/;

function planTomlConfig(file: string, block: string, force: boolean): PlannedWrite {
  if (!existsSync(file)) {
    return { change: { path: file, kind: "mcp", action: "create" }, contents: block };
  }
  const raw = readFileSync(file, "utf-8");
  const lines = raw.split("\n");
  const start = lines.findIndex((line) => TOML_HEADER.test(line));
  if (start === -1) {
    const separator = raw === "" || raw.endsWith("\n\n") ? "" : raw.endsWith("\n") ? "\n" : "\n\n";
    return {
      change: { path: file, kind: "mcp", action: "update" },
      contents: `${raw}${separator}${block}`,
    };
  }
  let end = lines.findIndex((line, index) => index > start && TOML_ANY_HEADER.test(line));
  if (end === -1) end = lines.length;
  const current = lines.slice(start, end).join("\n").trim();
  if (current === block.trim()) {
    return { change: { path: file, kind: "mcp", action: "unchanged" } };
  }
  if (!force) return { change: { path: file, kind: "mcp", action: "kept" } };
  const tail = lines.slice(end);
  const replaced = [
    ...lines.slice(0, start),
    ...block.trimEnd().split("\n"),
    ...(tail.length > 0 && tail[0] !== "" ? [""] : []),
    ...tail,
  ];
  return {
    change: { path: file, kind: "mcp", action: "update" },
    contents: replaced.join("\n"),
  };
}

function planSkills(projectRoot: string, dirs: readonly string[], force: boolean): PlannedWrite[] {
  return agentSkillFiles(dirs).map(({ rel, contents }) => {
    const file = path.join(projectRoot, rel);
    if (!existsSync(file))
      return { change: { path: file, kind: "skill", action: "create" }, contents };
    if (readFileSync(file, "utf-8") === contents) {
      return { change: { path: file, kind: "skill", action: "unchanged" } };
    }
    // A skill that differs is either an older Flisk version or the user's own edit; only --force replaces it.
    if (!force) return { change: { path: file, kind: "skill", action: "kept" } };
    return { change: { path: file, kind: "skill", action: "update" }, contents };
  });
}

/**
 * Plan, and unless `dryRun` is set apply, the connection of one host. Writes only to the host's MCP config file
 * (in the project, or with scope `global` in the home directory) and, for scope `project`, to the host's skill
 * directories in the project. Throws before writing anything when a config file cannot be merged.
 */
export function connectAgentHost(options: ConnectOptions): ConnectResult {
  const { host, scope, projectRoot, homeDir } = options;
  const force = options.force === true;
  const spec = HOST_SPECS[host];
  const planned: PlannedWrite[] = [];

  if (scope === "global" && spec.globalFile === null) {
    throw new FliskError(
      `flisk connect ${host} --global is not supported`,
      [
        "Claude Code owns its user config; add the server for every project with: claude mcp add --scope user flisk -- flisk mcp",
        `Or run \`flisk connect ${host}\` (project scope) in each Flisk project`,
      ],
      2,
    );
  }

  const configFile =
    scope === "global"
      ? path.join(homeDir, spec.globalFile as string)
      : path.join(projectRoot, spec.projectFile);
  planned.push(
    spec.format === "json"
      ? planJsonConfig(configFile, jsonServerEntry(host, options.platform), force)
      : planTomlConfig(configFile, tomlServerBlock(scope === "global" ? null : projectRoot), force),
  );
  if (scope === "project") planned.push(...planSkills(projectRoot, spec.skillDirs, force));

  if (!options.dryRun) {
    for (const { change, contents } of planned) {
      if (contents === undefined) continue;
      mkdirSync(path.dirname(change.path), { recursive: true });
      writeFileSync(change.path, contents);
    }
  }

  const next = [...spec.next];
  if (scope === "global")
    next.push(`Skills are per project: run \`flisk connect ${host}\` in a project to add them`);
  return {
    host,
    label: spec.label,
    scope,
    projectRoot,
    dryRun: options.dryRun === true,
    changes: planned.map(({ change }) => change),
    next,
  };
}
