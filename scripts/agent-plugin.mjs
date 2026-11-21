// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Packages Flisk as a plugin that every coding agent with a plugin format can install: the Flisk skills (the ones
// `flisk project` writes, from cli/templates/agent-skills) and the `flisk mcp` server. This script writes
//   plugins/flisk/plugin.json, mcp.json        the open Agent Plugins format (agent-plugins.org): Codex and ChatGPT,
//                                              Cursor and GitHub Copilot CLI load these
//   plugins/flisk/.mcp.json                    the same server for Claude Code and older Codex and Copilot builds
//   plugins/flisk/.claude-plugin/plugin.json   Claude Code
//   plugins/flisk/hooks/                       Claude Code hooks: guard generated files, verify service.json edits
//   plugins/flisk/agents/flisk-verifier.md     Claude Code read-only subagent for status, logs and doctor
//   plugins/flisk/.codex-plugin/plugin.json    Codex builds that predate the root plugin.json
//   plugins/flisk/.cursor-plugin/plugin.json   Cursor marketplace entries
//   plugins/flisk/skills/<name>/SKILL.md       copies of cli/templates/agent-skills, with docs/ links made absolute
//   .claude-plugin/marketplace.json            marketplace for Claude Code, pointing at plugins/flisk-claude (and Copilot CLI, which reads it too)
//   .agents/plugins/marketplace.json           marketplace for Codex
//   .cursor-plugin/marketplace.json            marketplace for Cursor
//   plugins/flisk-claude/.mcp.json             the same server for Claude Code, through a portable Node launcher
//   plugins/flisk-claude/scripts/flisk-mcp.mjs  that launcher: starts `flisk mcp` on POSIX and native Windows alike
//   plugins/flisk-claude/                      the Claude Code plugin: the same skills and the launcher above
//   gemini-extension.json                      Gemini CLI extension (it must sit at the repository root)
// plugins/flisk/README.md, plugins/flisk/assets/ and gemini/GEMINI.md are hand-written and kept as they are.
//   node scripts/agent-plugin.mjs [--root <repo dir>]                 write everything
//   node scripts/agent-plugin.mjs [--root <repo dir>] --check         exit 1 when anything is out of date (run by D6 in
//                                                                     tests/e2e/static/skills-and-docs.sh)
//   node scripts/agent-plugin.mjs [--root <repo dir>] --openai-zip <file>
//                                                                     the skills-only package for the ChatGPT and Codex
//                                                                     plugin directory (platform.openai.com/plugins)
//   node scripts/agent-plugin.mjs [--root <repo dir>] --mcp-registry <file> [--version <x.y.z>]
//                                                                     server.json for the official MCP Registry
//                                                                     (registry.modelcontextprotocol.io), for the version
//                                                                     in package.json unless --version is given; the
//                                                                     release workflow writes and publishes it
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_DIR = "plugins/flisk";
export const CLAUDE_PLUGIN_DIR = "plugins/flisk-claude";
export const SKILLS_SOURCE = "cli/templates/agent-skills";
const GENERATOR = "scripts/agent-plugin.mjs";
const DOCS_URL = "https://github.com/flisk-sh/flisk/blob/main/docs/";

export const PLUGIN = {
  name: "flisk",
  version: "1.0.0",
  description:
    "Flisk App Builder. Tell your AI what app you want (an online shop, a website, a booking app, an AI helper) and it builds the whole app and runs it on your own computer with one command.",
  author: { name: "Flisk", url: "https://flisk.sh" },
  homepage: "https://flisk.sh",
  repository: "https://github.com/flisk-sh/flisk",
  license: "MIT",
  keywords: ["flisk", "local-development", "dev-environment", "microservices", "docker", "tilt", "mcp", "agents"],
};

// What the ChatGPT and Codex plugin directory shows. Limits from developers.openai.com/plugins/deploy/submission:
// displayName and shortDescription at most 30 characters, up to three starter prompts of at most 128.
export const OPENAI_INTERFACE = {
  displayName: "Flisk",
  shortDescription: "Run your whole app locally",
  longDescription:
    "Flisk runs your whole app on your own computer with one command: frontends, APIs, workers, AI agents and MCP servers, with their databases. Ask for a shop, a SaaS or an AI agent and your agent scaffolds the services with flisk resource, starts them with flisk up, checks every URL and fixes what fails with flisk doctor. Free and open source (MIT), no signup and no API key. Flisk never calls a model itself. Needs the Flisk CLI on your computer: npm install -g @flisk-sh/flisk.",
  developerName: "Flisk",
  category: "Developer Tools",
  capabilities: ["Interactive", "Read", "Write"],
  websiteURL: "https://flisk.sh",
  defaultPrompt: [
    "Build me a small online shop with a storefront and an orders API, and run it on my laptop with Flisk.",
    "Start my Flisk stack and tell me which URLs are up.",
    "My Flisk app is broken: run flisk doctor, find the cause and fix it.",
  ],
  brandColor: "#1f9d6b",
  composerIcon: "./assets/logo.svg",
  logo: "./assets/logo.png",
  screenshots: [],
};

// The server every host starts: the Flisk CLI's own stdio server, run in the user's project.
const SERVER = { command: "flisk", args: ["mcp"] };

// The Claude plugin cannot use a shell launcher: Windows does not read a `#!` line and not every machine has /bin/sh.
// It starts the same server through `node` (a CLI prerequisite) and a small launcher shipped with the plugin. On Windows
// npm installs a flisk.cmd shim, so the launcher spawns through a shell there. The other hosts, the MCP Registry and
// Glama keep the plain `flisk mcp`. A Claude Code user who installs the server by hand can still run:
// claude mcp add flisk -- flisk mcp

// What the Claude plugin directory shows on the listing. It reads these from plugin.json; without them it guesses
// (the first docs link in the README, the last issue template) and has no privacy policy.
const CLAUDE_LISTING = {
  displayName: "Flisk App Builder",
  icon: "./.claude-plugin/icon.png",
  documentationUrl: "https://flisk.sh/docs",
  supportUrl: "https://github.com/flisk-sh/flisk/issues",
  privacyPolicyUrl: "https://github.com/flisk-sh/flisk/blob/main/docs/security.md#what-flisk-sends-over-the-network",
};

// The Claude Code MCP config names the runtime, not a POSIX script: Node is already required by the CLI (22.12+).
const CLAUDE_SERVER = { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/flisk-mcp.mjs"] };

// Written next to the config so the launch code stays reviewable in the plugin tree. `shell` is needed on Windows
// because npm installs flisk as flisk.cmd there, which Node cannot spawn directly on current Node versions.
const CLAUDE_LAUNCHER = `// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Written by scripts/agent-plugin.mjs. Starts the Flisk CLI's own stdio server in the folder the agent started in.
// Needs Node 22.12+ and the Flisk CLI: npm install -g @flisk-sh/flisk. Reads no credential and uses no network.
import { spawn } from "node:child_process";

const options = { stdio: "inherit" };
// npm installs flisk.cmd on Windows; Node can start .cmd files only through a shell.
if (process.platform === "win32") options.shell = true;
const child = spawn("flisk", ["mcp"], options);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(\`flisk mcp could not start: \${error.message}\`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
`;

// The name the MCP Registry lists Flisk under. The io.github.flisk-sh/ namespace is proven by publishing from a
// flisk-sh GitHub Actions run, and the registry checks that the npm package's mcpName (root package.json) matches it.
export const MCP_REGISTRY_NAME = "io.github.flisk-sh/flisk";
const NPM_PACKAGE = "@flisk-sh/flisk";

/** server.json for the official MCP Registry: the npm package, run as `flisk mcp` over stdio. */
export function mcpRegistryServer(version) {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: MCP_REGISTRY_NAME,
    title: OPENAI_INTERFACE.displayName,
    // The registry allows at most 100 characters.
    description: "Run your whole app on your computer with one command: build, start, check and fix a local stack.",
    repository: { url: PLUGIN.repository, source: "github" },
    websiteUrl: PLUGIN.homepage,
    version,
    packages: [
      {
        registryType: "npm",
        identifier: NPM_PACKAGE,
        version,
        transport: { type: "stdio" },
        packageArguments: SERVER.args.map((value) => ({ type: "positional", value })),
      },
    ],
  };
}

// One-click install links for editors that take an MCP server from a URL. Both open the editor's own
// "add this server" prompt; the user confirms there.
export const INSTALL_LINKS = {
  cursor: `https://cursor.com/en/install-mcp?name=flisk&config=${Buffer.from(JSON.stringify(SERVER)).toString("base64")}`,
  vscode: `https://vscode.dev/redirect/mcp/install?name=flisk&config=${encodeURIComponent(JSON.stringify({ type: "stdio", ...SERVER }))}`,
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// In the repository the skills link to docs/ with relative paths; inside an installed plugin those point nowhere.
// Same rule as rewriteSkillLinks in cli/src/utils/agent-skills.ts.
export function absoluteDocLinks(markdown) {
  return markdown.replace(/\]\((?:\.\.\/)+docs\//g, `](${DOCS_URL}`);
}

// Claude Code hooks run commands, so they live only in the self-hosted plugin, never in the directory-listed one.
// Both hooks use exec form: `node` plus one script path, with no shell to quote on Windows. The guard uses the same
// rules as the project hook in cli/templates/agent-hooks, plus every path under .flisk/ and .flisk-out/.
const PLUGIN_HOOKS = {
  hooks: {
    PreToolUse: [
      {
        matcher: "Edit|MultiEdit|Write|NotebookEdit",
        hooks: [
          {
            type: "command",
            command: "node",
            args: ["${CLAUDE_PLUGIN_ROOT}/hooks/flisk-generated-guard.mjs"],
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Edit|MultiEdit|Write|NotebookEdit",
        hooks: [
          {
            type: "command",
            command: "node",
            args: ["${CLAUDE_PLUGIN_ROOT}/hooks/flisk-config-verify.mjs"],
          },
        ],
      },
    ],
  },
};

const PLUGIN_GENERATED_GUARD = `// Written by scripts/agent-plugin.mjs. Claude Code PreToolUse hook: deny edits to the files Flisk generates.
// They are rewritten on flisk up, so an edit there is lost. Tell the agent which source file to change instead.
import { readFileSync } from "node:fs";
import path from "node:path";

/** The source to edit instead when rel (project-relative, "/" separated) is Flisk-generated, else null. */
export function generatedSource(rel) {
  const parts = rel.split("/").filter(Boolean);
  if (!parts.length || parts[0] === "..") return null;
  if (parts.some((part) => part === ".autogenerated" || part === ".flisk" || part === ".flisk-out")) {
    return "service.json (or add a service with flisk resource)";
  }
  const p = parts.join("/");
  if (
    p === "shared-platform-engineering/docker-templates" ||
    p.startsWith("shared-platform-engineering/docker-templates/") ||
    p.startsWith("product_autogenerated_resource_manifests/") ||
    p.startsWith("product_autogenerated_services_list/") ||
    p === "Tiltfile" ||
    /^TILT_[^/]+\\.star$/.test(p) ||
    p === ".tiltignore" ||
    p === "services/platform/database-management/docker-compose.yml"
  ) {
    return "service.json (or add a service with flisk resource)";
  }
  return null;
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return 0;
  }
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== "string" || !file) return 0;
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
  const source = generatedSource(rel);
  if (!source) return 0;
  process.stderr.write(
    rel +
      " is generated by Flisk, and flisk up writes it again, so this edit would be lost. " +
      "Change " + source + " (then run flisk up) or your own code instead. " +
      "To see where a file comes from: flisk config explain " + rel + "\\n",
  );
  return 2;
}

if (process.argv[1] && path.basename(process.argv[1]) === "flisk-generated-guard.mjs")
  process.exit(main());
`;

const PLUGIN_CONFIG_VERIFY = `// Written by scripts/agent-plugin.mjs. Claude Code PostToolUse hook: after a service.json edit, run
// flisk config verify --json and hand the report back so drift is visible before flisk up regenerates files.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Only edits to a Flisk service manifest need a verify run. */
export function isServiceManifest(rel) {
  const parts = rel.split("/").filter(Boolean);
  return parts.length > 0 && parts[parts.length - 1] === "service.json" && !parts.includes(".autogenerated");
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return 0;
  }
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== "string" || !file) return 0;
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
  if (rel.startsWith("..") || !isServiceManifest(rel)) return 0;
  const options = { cwd: root, encoding: "utf8" };
  // npm installs flisk.cmd on Windows; Node can start it only through a shell.
  if (process.platform === "win32") options.shell = true;
  const result = spawnSync("flisk", ["config", "verify", "--json"], options);
  if (result.error) {
    process.stderr.write("flisk config verify --json could not run: " + result.error.message +
      ". Install the CLI with npm install -g @flisk-sh/flisk.\\n");
    return 0;
  }
  const report = (result.stdout || "").trim();
  if (report) process.stdout.write("flisk config verify --json after " + rel + ":\\n" + report + "\\n");
  if ((result.stderr || "").trim()) process.stderr.write(result.stderr.trimEnd() + "\\n");
  // The edit already happened: report the drift, but never fail the tool call.
  return 0;
}

if (process.argv[1] && path.basename(process.argv[1]) === "flisk-config-verify.mjs")
  process.exit(main());
`;

const PLUGIN_VERIFIER_AGENT = `---
name: flisk-verifier
description: Read-only health check for a local Flisk stack. Use when asked whether services are up, which URLs answer or why a service fails; returns a short verdict instead of dumping long logs into the main session.
tools:
  - Read
  - Glob
  - Grep
  - Bash(flisk status:*)
  - Bash(flisk logs:*)
  - Bash(flisk networks --json)
  - Bash(flisk doctor)
  - Bash(flisk doctor --json)
  - mcp__flisk__status
  - mcp__flisk__logs
  - mcp__flisk__doctor
  - mcp__flisk__resource_list
  - mcp__flisk__agent_list
  - mcp__flisk__agent_sessions
  - mcp__flisk__stack_list
  - mcp__flisk__project_info
  - mcp__flisk__project_templates
  - mcp__flisk__network_list
  - mcp__flisk__config_verify
  - mcp__flisk__config_explain
  - mcp__flisk__runtime_check
model: haiku
---

You are a read-only Flisk verifier. Check the running stack and report a short verdict. Long status and log output stays in your own context, not the main session's.

## Workflow

1. Prefer the \`mcp__flisk__*\` tools when they are available. Otherwise use the matching CLI commands above from the project root.
2. Call \`status\` (or \`flisk status --json\`) and \`network_list\` (or \`flisk networks --json\`) for the state and every service URL.
3. Check each URL reported as running. For a failure, read only that service's \`logs\` (or \`flisk logs -s <service> --json\`) and call \`doctor\` (or \`flisk doctor --json\`) for host and project checks.
4. Call \`config_verify\` when generated files may be stale: read \`data.errors\` and \`data.diffs\`, but do not regenerate them.
5. Return a compact verdict: healthy, degraded or down; one line per failing service with the cause and the exact fix the tools named; and the URLs that answer. Say so when a tool was unavailable or a field was missing.

## Guardrails

- Never change files or container state: no \`Edit\`, \`Write\`, \`flisk up\`, \`flisk down\`, \`resource_*\` writes, \`config_regenerate\`, \`doctor --fix\` or \`resource_run\`.
- Do not guess from Docker output: report what the Flisk tools show. Keep secrets and full log lines out of the verdict.
- If the MCP tools are missing, tell the caller to run \`flisk connect claude\`, then answer with the CLI commands instead.
`;

// The directory-listed Claude plugin has no server of its own. Tell its skills how to add one when tools are missing.
const CLAUDE_SKILL_MCP_NOTE = `
## MCP tools

If a \`mcp__flisk__*\` tool is missing, run \`flisk connect claude\` in the project folder and restart Claude Code. The CLI commands in this skill work without MCP as well.
`;

/** The skill names shipped in cli/templates/agent-skills, sorted. */
export function skillNames(root) {
  const dir = path.join(root, SKILLS_SOURCE);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d) => d.name)
    .sort();
}

/** Every generated file: a repo-relative path and its contents. */
export function plan(root) {
  const files = [];
  const add = (rel, contents) => files.push({ rel, contents });
  const inPlugin = (rel) => `${PLUGIN_DIR}/${rel}`;
  const owner = { name: PLUGIN.author.name, url: PLUGIN.author.url };

  add(
    inPlugin("plugin.json"),
    json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      ...PLUGIN,
      extensions: { "com.openai": { interface: OPENAI_INTERFACE } },
    }),
  );
  add(
    inPlugin("mcp.json"),
    json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { flisk: { type: "stdio", ...SERVER } },
    }),
  );
  add(inPlugin(".mcp.json"), json({ mcpServers: { flisk: SERVER } }));
  add(inPlugin(".claude-plugin/plugin.json"), json({ ...PLUGIN, hooks: "./hooks/hooks.json" }));
  add(inPlugin("hooks/hooks.json"), json(PLUGIN_HOOKS));
  add(inPlugin("hooks/flisk-generated-guard.mjs"), PLUGIN_GENERATED_GUARD);
  add(inPlugin("hooks/flisk-config-verify.mjs"), PLUGIN_CONFIG_VERIFY);
  add(inPlugin("agents/flisk-verifier.md"), PLUGIN_VERIFIER_AGENT);
  add(
    inPlugin(".codex-plugin/plugin.json"),
    json({ ...PLUGIN, skills: "./skills/", mcpServers: "./.mcp.json", interface: OPENAI_INTERFACE }),
  );
  add(inPlugin(".cursor-plugin/plugin.json"), json({ ...PLUGIN, logo: "assets/logo.svg" }));
  add(`${CLAUDE_PLUGIN_DIR}/.claude-plugin/plugin.json`, json({ ...PLUGIN, ...CLAUDE_LISTING }));
  add(`${CLAUDE_PLUGIN_DIR}/.mcp.json`, json({ mcpServers: { flisk: CLAUDE_SERVER } }));
  add(`${CLAUDE_PLUGIN_DIR}/scripts/flisk-mcp.mjs`, CLAUDE_LAUNCHER);
  for (const name of skillNames(root)) {
    const source = absoluteDocLinks(readFileSync(path.join(root, SKILLS_SOURCE, name, "SKILL.md"), "utf8"));
    add(inPlugin(`skills/${name}/SKILL.md`), source);
    // Only the directory-listed plugin needs the note: it cannot ship an MCP server of its own.
    add(`${CLAUDE_PLUGIN_DIR}/skills/${name}/SKILL.md`, source + CLAUDE_SKILL_MCP_NOTE);
  }

  const entry = { name: PLUGIN.name, description: PLUGIN.description };
  add(
    ".claude-plugin/marketplace.json",
    json({
      name: "flisk",
      owner,
      metadata: { description: "Flisk App Builder: tell your AI what app you want and it builds and runs it on your computer" },
      plugins: [
        { ...entry, source: `./${CLAUDE_PLUGIN_DIR}`, homepage: PLUGIN.homepage, license: PLUGIN.license, category: "development" },
      ],
    }),
  );
  add(
    ".agents/plugins/marketplace.json",
    json({
      name: "flisk",
      interface: { displayName: "Flisk" },
      plugins: [
        {
          name: PLUGIN.name,
          source: { source: "local", path: `./${PLUGIN_DIR}` },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: OPENAI_INTERFACE.category,
        },
      ],
    }),
  );
  add(".cursor-plugin/marketplace.json", json({ name: "flisk", owner, plugins: [{ ...entry, source: PLUGIN_DIR }] }));
  add(
    "gemini-extension.json",
    json({
      name: PLUGIN.name,
      version: "1.0.0",
      description: PLUGIN.description,
      contextFileName: "gemini/GEMINI.md",
      mcpServers: { flisk: SERVER },
    }),
  );
  return files;
}

/** Generated skill folders whose source skill is gone: { rel } of each, to delete. */
function staleSkills(root, files) {
  const wanted = new Set(files.map((f) => f.rel));
  return [PLUGIN_DIR, CLAUDE_PLUGIN_DIR].flatMap((pluginDir) => {
    const dir = path.join(root, pluginDir, "skills");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((name) => `${pluginDir}/skills/${name}`)
      .filter((rel) => !wanted.has(`${rel}/SKILL.md`));
  });
}

/** The old POSIX launcher an earlier version shipped: { rel } if present, to delete. */
const OBSOLETE_CLAUDE_FILES = [`${CLAUDE_PLUGIN_DIR}/scripts/flisk-mcp.sh`];

/** Write (write: true) or compare everything. Returns the repo-relative paths that were or are out of date. */
export function run(root, { write }) {
  const files = plan(root);
  const changed = [];
  for (const { rel, contents } of files) {
    const target = path.join(root, rel);
    if (existsSync(target) && readFileSync(target, "utf8") === contents) continue;
    changed.push(rel);
    if (write) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
  }
  for (const rel of [...staleSkills(root, files), ...OBSOLETE_CLAUDE_FILES.filter((f) => existsSync(path.join(root, f)))]) {
    changed.push(rel);
    if (write) rmSync(path.join(root, rel), { recursive: true, force: true });
  }
  return changed;
}

/**
 * The package for platform.openai.com/plugins. Local MCP servers are only accepted from allowlisted partners
 * (developers.openai.com/plugins/deploy/desktop-only), so this is the skills-only, desktop-only form: the root
 * plugin.json with requires_local_executor, the skills and the assets, without the MCP files or other hosts' manifests.
 */
export function openaiZip(root, out) {
  const staging = mkdtempSync(path.join(tmpdir(), "flisk-plugin-"));
  try {
    const plugin = path.join(root, PLUGIN_DIR);
    const manifest = JSON.parse(readFileSync(path.join(plugin, "plugin.json"), "utf8"));
    manifest.extensions["com.openai"] = { requires_local_executor: true, ...manifest.extensions["com.openai"] };
    writeFileSync(path.join(staging, "plugin.json"), json(manifest));
    for (const dir of ["skills", "assets"]) cpSync(path.join(plugin, dir), path.join(staging, dir), { recursive: true });
    rmSync(out, { force: true });
    execFileSync("zip", ["-qr", path.resolve(out), "."], { cwd: staging, stdio: "inherit" });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const root = path.resolve(flag("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const zip = flag("--openai-zip");
  const registry = flag("--mcp-registry");
  if (zip) {
    openaiZip(root, zip);
    console.log(`Wrote ${zip}`);
  } else if (registry) {
    const version = flag("--version") ?? JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
    writeFileSync(registry, json(mcpRegistryServer(version)));
    console.log(`Wrote ${registry} for ${MCP_REGISTRY_NAME}@${version}`);
  } else if (args.includes("--check")) {
    const stale = run(root, { write: false });
    if (stale.length) {
      console.error(`The Flisk plugin files are out of date; run: node ${GENERATOR}`);
      for (const rel of stale) console.error(`  ${rel}`);
      process.exit(1);
    }
    console.log("The Flisk plugin files are up to date");
  } else {
    const changed = run(root, { write: true });
    console.log(changed.length ? `Updated ${changed.length} file(s):\n  ${changed.join("\n  ")}` : "Nothing to update");
  }
}
