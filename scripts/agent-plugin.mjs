// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Packages Flisk as a plugin that every coding agent with a plugin format can install: the Flisk skills (the ones
// `flisk project` writes, from cli/templates/agent-skills) and the `flisk mcp` server. This script writes
//   plugins/flisk/plugin.json, mcp.json        the open Agent Plugins format (agent-plugins.org): Codex and ChatGPT,
//                                              Cursor and GitHub Copilot CLI load these
//   plugins/flisk/.mcp.json                    the same server for Claude Code and older Codex and Copilot builds
//   plugins/flisk/.claude-plugin/plugin.json   Claude Code
//   plugins/flisk/.codex-plugin/plugin.json    Codex builds that predate the root plugin.json
//   plugins/flisk/.cursor-plugin/plugin.json   Cursor marketplace entries
//   plugins/flisk/skills/<name>/SKILL.md       copies of cli/templates/agent-skills, with docs/ links made absolute
//   .claude-plugin/marketplace.json            marketplace for Claude Code (and Copilot CLI, which reads it too)
//   .agents/plugins/marketplace.json           marketplace for Codex
//   .cursor-plugin/marketplace.json            marketplace for Cursor
//   gemini-extension.json                      Gemini CLI extension (it must sit at the repository root)
// plugins/flisk/README.md, plugins/flisk/GEMINI.md and plugins/flisk/assets/ are hand-written and kept as they are.
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
export const SKILLS_SOURCE = "cli/templates/agent-skills";
const GENERATOR = "scripts/agent-plugin.mjs";
const DOCS_URL = "https://github.com/flisk-sh/flisk/blob/main/docs/";

export const PLUGIN = {
  name: "flisk",
  version: "1.0.0",
  description:
    "Run your whole app on your own computer with one command. Skills and an MCP server that let your coding agent build, start, check and fix a local stack with the Flisk CLI.",
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
  add(inPlugin(".claude-plugin/plugin.json"), json(PLUGIN));
  add(
    inPlugin(".codex-plugin/plugin.json"),
    json({ ...PLUGIN, skills: "./skills/", mcpServers: "./.mcp.json", interface: OPENAI_INTERFACE }),
  );
  add(inPlugin(".cursor-plugin/plugin.json"), json({ ...PLUGIN, logo: "assets/logo.svg" }));
  for (const name of skillNames(root)) {
    const source = readFileSync(path.join(root, SKILLS_SOURCE, name, "SKILL.md"), "utf8");
    add(inPlugin(`skills/${name}/SKILL.md`), absoluteDocLinks(source));
  }

  const entry = { name: PLUGIN.name, description: PLUGIN.description };
  add(
    ".claude-plugin/marketplace.json",
    json({
      name: "flisk",
      owner,
      metadata: { description: "The Flisk plugin: skills and the flisk mcp server for running your app locally" },
      plugins: [
        { ...entry, source: `./${PLUGIN_DIR}`, homepage: PLUGIN.homepage, license: PLUGIN.license, category: "development" },
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
      contextFileName: `${PLUGIN_DIR}/GEMINI.md`,
      mcpServers: { flisk: SERVER },
    }),
  );
  return files;
}

/** Generated skill folders whose source skill is gone: { rel } of each, to delete. */
function staleSkills(root, files) {
  const dir = path.join(root, PLUGIN_DIR, "skills");
  if (!existsSync(dir)) return [];
  const wanted = new Set(files.map((f) => f.rel));
  return readdirSync(dir)
    .map((name) => `${PLUGIN_DIR}/skills/${name}`)
    .filter((rel) => !wanted.has(`${rel}/SKILL.md`));
}

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
  for (const rel of staleSkills(root, files)) {
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
