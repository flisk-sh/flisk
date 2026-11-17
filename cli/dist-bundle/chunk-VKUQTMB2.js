import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  agentSkillFiles
} from "./chunk-KTRTHNLE.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  FliskError,
  findProjectRoot,
  runCommand,
  source_default,
  suggestClosest
} from "./chunk-73W4Y4TI.js";

// dist/commands/connect.js
import { homedir } from "node:os";
import path2 from "node:path";
import { Command } from "commander";

// dist/utils/agent-connect.js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
var CONNECT_HOSTS = ["claude", "cursor", "codex"];
var HOST_ALIASES = {
  claude: "claude",
  "claude-code": "claude",
  cursor: "cursor",
  codex: "codex"
};
var MCP_SERVER_NAME = "flisk";
var HOST_SPECS = {
  claude: {
    label: "Claude Code",
    format: "json",
    projectFile: ".mcp.json",
    // Claude Code keeps user-scope servers in ~/.claude.json next to its own state; `claude mcp add` owns that file.
    globalFile: null,
    skillDirs: [".claude/skills"],
    next: [
      "Start Claude Code in this folder (`claude`) and approve the project server `flisk` when it asks",
      "Run /mcp inside Claude Code to confirm `flisk` is connected"
    ]
  },
  cursor: {
    label: "Cursor",
    format: "json",
    projectFile: ".cursor/mcp.json",
    globalFile: ".cursor/mcp.json",
    skillDirs: [".agents/skills"],
    next: [
      "Open this folder in Cursor and check that the `flisk` MCP server is listed and enabled in its MCP settings"
    ]
  },
  codex: {
    label: "Codex",
    format: "toml",
    projectFile: ".codex/config.toml",
    globalFile: ".codex/config.toml",
    skillDirs: [".agents/skills"],
    next: [
      "Start Codex in this folder (`codex`); it loads a project .codex/config.toml only for trusted projects",
      "Run /mcp inside Codex (or `codex mcp list`) to confirm `flisk` is connected"
    ]
  }
};
function resolveConnectHost(input) {
  const host = HOST_ALIASES[input.trim().toLowerCase()];
  if (host)
    return host;
  const closest = suggestClosest(input, Object.keys(HOST_ALIASES));
  throw new FliskError(`Unknown agent host "${input}". Supported hosts: ${CONNECT_HOSTS.join(", ")}`, [
    ...closest ? [`Did you mean "${closest}"? Run \`flisk connect ${closest}\``] : [],
    `Run \`flisk connect <${CONNECT_HOSTS.join("|")}>\` from your project folder`,
    "Any other MCP client: add the stdio server `flisk mcp` by hand (docs/agent-tooling/flisk-mcp-setup.md)"
  ], 2);
}
var CURSOR_WORKSPACE_FOLDER = "${workspaceFolder}";
function jsonServerEntry(host, platform = process.platform) {
  if (host === "cursor") {
    if (platform === "win32")
      return { type: "stdio", command: "flisk", args: ["mcp"] };
    return {
      type: "stdio",
      command: "sh",
      args: ["-c", `cd "${CURSOR_WORKSPACE_FOLDER}" && exec flisk mcp`]
    };
  }
  return { command: "flisk", args: ["mcp"] };
}
function tomlServerBlock() {
  const lines = [`[mcp_servers.${MCP_SERVER_NAME}]`, 'command = "flisk"', 'args = ["mcp"]'];
  return `${lines.join("\n")}
`;
}
function invalidConfig(file, reason) {
  return new FliskError(`Cannot merge into ${file}: ${reason}`, [
    "Fix the file by hand (or move it aside), then run `flisk connect` again",
    "Nothing was written"
  ]);
}
function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function planJsonConfig(file, entry, force) {
  if (!existsSync(file)) {
    const contents = `${JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: entry } }, null, 2)}
`;
    return { change: { path: file, kind: "mcp", action: "create" }, contents };
  }
  const raw = readFileSync(file, "utf-8");
  let config;
  try {
    config = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch (error) {
    throw invalidConfig(file, `it is not valid JSON (${error.message})`);
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw invalidConfig(file, "the top level is not a JSON object");
  }
  const root = config;
  const servers = root.mcpServers ?? {};
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    throw invalidConfig(file, '"mcpServers" is not an object');
  }
  const existing = servers[MCP_SERVER_NAME];
  if (existing !== void 0 && sameJson(existing, entry)) {
    return { change: { path: file, kind: "mcp", action: "unchanged" } };
  }
  if (existing !== void 0 && !force) {
    return { change: { path: file, kind: "mcp", action: "kept" } };
  }
  const merged = {
    ...root,
    mcpServers: { ...servers, [MCP_SERVER_NAME]: entry }
  };
  return {
    change: { path: file, kind: "mcp", action: "update" },
    contents: `${JSON.stringify(merged, null, 2)}
`
  };
}
var TOML_HEADER = /^\s*\[\s*mcp_servers\s*\.\s*(?:flisk|"flisk")\s*\]\s*(?:#.*)?$/;
var TOML_ANY_HEADER = /^\s*\[/;
function planTomlConfig(file, block, force) {
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
      contents: `${raw}${separator}${block}`
    };
  }
  let end = lines.findIndex((line, index) => index > start && TOML_ANY_HEADER.test(line));
  if (end === -1)
    end = lines.length;
  const current = lines.slice(start, end).join("\n").trim();
  if (current === block.trim()) {
    return { change: { path: file, kind: "mcp", action: "unchanged" } };
  }
  if (!force)
    return { change: { path: file, kind: "mcp", action: "kept" } };
  const tail = lines.slice(end);
  const replaced = [
    ...lines.slice(0, start),
    ...block.trimEnd().split("\n"),
    ...tail.length > 0 && tail[0] !== "" ? [""] : [],
    ...tail
  ];
  return {
    change: { path: file, kind: "mcp", action: "update" },
    contents: replaced.join("\n")
  };
}
function globalCodexSetsCwd(homeDir) {
  const file = path.join(homeDir, ".codex/config.toml");
  if (!existsSync(file))
    return false;
  const lines = readFileSync(file, "utf-8").split("\n");
  const start = lines.findIndex((line) => TOML_HEADER.test(line));
  if (start === -1)
    return false;
  let end = lines.findIndex((line, index) => index > start && TOML_ANY_HEADER.test(line));
  if (end === -1)
    end = lines.length;
  return lines.slice(start + 1, end).some((line) => /^\s*cwd\s*=/.test(line));
}
function planSkills(projectRoot, dirs, force) {
  return agentSkillFiles(dirs).map(({ rel, contents }) => {
    const file = path.join(projectRoot, rel);
    if (!existsSync(file))
      return { change: { path: file, kind: "skill", action: "create" }, contents };
    if (readFileSync(file, "utf-8") === contents) {
      return { change: { path: file, kind: "skill", action: "unchanged" } };
    }
    if (!force)
      return { change: { path: file, kind: "skill", action: "kept" } };
    return { change: { path: file, kind: "skill", action: "update" }, contents };
  });
}
function connectAgentHost(options) {
  const { host, scope, projectRoot, homeDir } = options;
  const force = options.force === true;
  const spec = HOST_SPECS[host];
  const planned = [];
  if (scope === "global" && spec.globalFile === null) {
    throw new FliskError(`flisk connect ${host} --global is not supported`, [
      "Claude Code owns its user config; add the server for every project with: claude mcp add --scope user flisk -- flisk mcp",
      `Or run \`flisk connect ${host}\` (project scope) in each Flisk project`
    ], 2);
  }
  const configFile = scope === "global" ? path.join(homeDir, spec.globalFile) : path.join(projectRoot, spec.projectFile);
  planned.push(spec.format === "json" ? planJsonConfig(configFile, jsonServerEntry(host, options.platform), force) : planTomlConfig(configFile, tomlServerBlock(), force));
  if (scope === "project")
    planned.push(...planSkills(projectRoot, spec.skillDirs, force));
  if (!options.dryRun) {
    for (const { change, contents } of planned) {
      if (contents === void 0)
        continue;
      mkdirSync(path.dirname(change.path), { recursive: true });
      writeFileSync(change.path, contents);
    }
  }
  const next = [...spec.next];
  if (host === "codex" && scope === "project" && globalCodexSetsCwd(homeDir)) {
    next.push("Warning: ~/.codex/config.toml sets `cwd` on the flisk server, and Codex applies it to this project entry too, so tools may act on the wrong project. Remove that `cwd` from the global entry");
  }
  if (scope === "global")
    next.push(`Skills are per project: run \`flisk connect ${host}\` in a project to add them`);
  return {
    host,
    label: spec.label,
    scope,
    projectRoot,
    dryRun: options.dryRun === true,
    changes: planned.map(({ change }) => change),
    next
  };
}

// dist/commands/connect.js
var ACTION_COLORS = {
  create: source_default.green,
  update: source_default.yellow,
  unchanged: source_default.gray,
  kept: source_default.magenta
};
function displayPath(file, projectRoot) {
  const home = homedir();
  const rel = path2.relative(projectRoot, file);
  if (!rel.startsWith("..") && !path2.isAbsolute(rel))
    return rel;
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}
function printResult(result) {
  const isUpToDate = result.changes.every((change) => change.action === "unchanged");
  const where = result.scope === "global" ? "user config" : result.projectRoot;
  const heading = result.dryRun ? `Dry run - would connect Flisk to ${result.label} (${where})` : isUpToDate ? `Flisk is already connected to ${result.label} (${where}); nothing changed` : `Connected Flisk to ${result.label} (${where})`;
  console.log(heading);
  const mcp = result.changes.filter((change) => change.kind === "mcp");
  for (const change of mcp) {
    const action = ACTION_COLORS[change.action](change.action.padEnd(9));
    console.log(`  ${action} ${displayPath(change.path, result.projectRoot)}  (MCP server "flisk")`);
  }
  const skills = result.changes.filter((change) => change.kind === "skill");
  const dirs = [...new Set(skills.map((change) => path2.dirname(path2.dirname(change.path))))];
  for (const dir of dirs) {
    const inDir = skills.filter((change) => path2.dirname(path2.dirname(change.path)) === dir);
    for (const action of ["create", "update", "unchanged", "kept"]) {
      const count = inDir.filter((change) => change.action === action).length;
      if (count === 0)
        continue;
      const label = ACTION_COLORS[action](action.padEnd(9));
      console.log(`  ${label} ${displayPath(dir, result.projectRoot)}/  (${count} Flisk skill${count === 1 ? "" : "s"})`);
    }
  }
  if (result.changes.some((change) => change.action === "kept")) {
    console.log(source_default.gray("  kept = a different version is already there; rerun with --force to replace it"));
  }
  if (result.dryRun) {
    console.log("No files were written. Run again without --dry-run to apply.");
    return;
  }
  console.log("\nNext:");
  for (const line of result.next)
    console.log(`  - ${line}`);
  console.log(`  - Then ask the agent: "Run Flisk doctor, then start this project's stack and check its status."`);
}
var connectCommand = new Command("connect").description("Connect a coding agent to Flisk: write the flisk mcp server entry and the Flisk skills").argument("<host>", `Agent host: ${CONNECT_HOSTS.join(", ")}`).option("--project [path]", "Write into the specified Flisk project (default: current project)").option("--global", "Write the MCP entry to the host's user config instead (no skills)").option("--dry-run", "Print what would be written, without changing any file", false).option("--force", "Replace an existing, different flisk entry or edited Flisk skill", false).option("--json", "Print the result as a JSON envelope").addHelpText("after", "\nExamples:\n  flisk connect cursor --dry-run\n  flisk connect cursor\n  flisk connect cursor --global").action(async (hostArg, options, command) => {
  const target = options.project ?? command.optsWithGlobals().project;
  const run = () => {
    const host = resolveConnectHost(hostArg);
    if (options.global && target) {
      throw new FliskError("Choose one of --project and --global", [
        `Run \`flisk connect ${host}\` for this project, or \`flisk connect ${host} --global\` for your user config`
      ], 2);
    }
    const targetPath = typeof target === "string" ? path2.resolve(target) : void 0;
    const root = findProjectRoot(targetPath);
    if (targetPath && !root) {
      throw new FliskError(`No Flisk project at ${targetPath}`, [`Run \`flisk project\` there first, or point --project at an existing Flisk project`], 2);
    }
    const projectRoot = root ?? process.cwd();
    return connectAgentHost({
      host,
      scope: options.global ? "global" : "project",
      projectRoot,
      homeDir: homedir(),
      dryRun: options.dryRun === true,
      force: options.force === true
    });
  };
  if (options.json) {
    let result;
    try {
      result = run();
    } catch (error) {
      writeMachineError(error);
    }
    console.log(JSON.stringify(createMachineEnvelope({ ok: true, ...result })));
    return;
  }
  await runCommand(async () => printResult(run()));
});

export {
  connectCommand
};
