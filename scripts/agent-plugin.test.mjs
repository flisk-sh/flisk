// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/agent-plugin.mjs: the committed plugin files are current, every host's manifest is valid for
// that host, and the generator keeps the skill copies in step with cli/templates/agent-skills.
//   node --test scripts/agent-plugin.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  absoluteDocLinks,
  INSTALL_LINKS,
  MCP_REGISTRY_NAME,
  mcpRegistryServer,
  OPENAI_INTERFACE,
  openaiZip,
  PLUGIN_DIR,
  run,
  SKILLS_SOURCE,
  skillNames,
} from "./agent-plugin.mjs";

const GENERATOR = fileURLToPath(new URL("./agent-plugin.mjs", import.meta.url));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS = path.join(ROOT, "scripts/agent-plugin-schemas");
const readJson = (...parts) => JSON.parse(readFileSync(path.join(...parts), "utf8"));

// Enough JSON Schema for the two Agent Plugins 1.0.0 schemas (copied from agent-plugins.org/schemas/1.0.0/): type,
// const, pattern, lengths, required, properties, additionalProperties, items, propertyNames.not.enum, $ref and oneOf.
function validate(schema, value, at = "$", defs = schema.$defs) {
  if (schema.$ref) return validate(defs[schema.$ref.replace("#/$defs/", "")], value, at, defs);
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s) => validate(s, value, at, defs).length === 0);
    return passing.length === 1 ? [] : [`${at}: matches ${passing.length} of the oneOf branches`];
  }
  const errors = [];
  const kind = Array.isArray(value) ? "array" : typeof value;
  if (schema.type && schema.type !== kind) return [`${at}: is ${kind}, expected ${schema.type}`];
  if ("const" in schema && value !== schema.const) errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (kind === "string") {
    // The patterns come from the vendored agent-plugins.org schemas in this repo, never from input.
    // String#search compiles the pattern itself, so no RegExp is built from a variable here.
    if (schema.pattern && value.search(schema.pattern) === -1) errors.push(`${at}: does not match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: is too long`);
  }
  if (kind === "array" && schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${at}[${i}]`, defs)));
  if (kind === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.propertyNames?.not?.enum?.includes(key)) errors.push(`${at}.${key}: name is reserved`);
      if (schema.properties?.[key]) errors.push(...validate(schema.properties[key], v, `${at}.${key}`, defs));
      else if (schema.additionalProperties === false) errors.push(`${at}.${key}: is not allowed`);
      else if (typeof schema.additionalProperties === "object") {
        errors.push(...validate(schema.additionalProperties, v, `${at}.${key}`, defs));
      }
    }
  }
  return errors;
}

test("the committed plugin files match the generator", () => {
  assert.deepEqual(run(ROOT, { write: false }), [], "run: node scripts/agent-plugin.mjs");
});

test("plugin.json and mcp.json are valid Agent Plugins 1.0.0 documents", () => {
  for (const name of ["plugin", "mcp"]) {
    const schema = readJson(SCHEMAS, `${name}.schema.json`);
    assert.deepEqual(validate(schema, readJson(ROOT, PLUGIN_DIR, `${name}.json`)), [], `${name}.json`);
  }
});

test("the schema check rejects what a host would reject", () => {
  const plugin = readJson(SCHEMAS, "plugin.schema.json");
  const mcp = readJson(SCHEMAS, "mcp.schema.json");
  const base = { $schema: plugin.properties.$schema.const, name: "flisk" };
  assert.deepEqual(validate(plugin, { ...base, skills: "./skills/" }), ["$.skills: is not allowed"]);
  assert.match(validate(plugin, { ...base, name: "Flisk" })[0], /does not match/);
  const server = (s) => validate(mcp, { $schema: mcp.properties.$schema.const, mcpServers: { flisk: s } });
  assert.equal(server({ type: "stdio", command: "flisk", args: ["mcp"] }).length, 0);
  assert.equal(server({ command: "flisk", args: ["mcp"] }).length, 1, "a server without a type");
  assert.equal(server({ type: "stdio", command: "flisk", cwd: "/abs" }).length, 1, "a cwd outside the plugin");
});

test("every host starts the same server: flisk mcp", () => {
  const plugin = path.join(ROOT, PLUGIN_DIR);
  const servers = [
    readJson(plugin, "mcp.json").mcpServers.flisk,
    readJson(ROOT, "gemini-extension.json").mcpServers.flisk,
  ];
  for (const server of servers) assert.deepEqual([server.command, ...server.args], ["flisk", "mcp"]);
  assert.equal(readJson(plugin, ".codex-plugin/plugin.json").mcpServers, "./mcp.json");
  const claude = readJson(plugin, ".mcp.json").mcpServers.flisk;
  assert.deepEqual([claude.command, ...claude.args], ["node", "${CLAUDE_PLUGIN_ROOT}/bin/flisk-mcp.mjs"]);
  assert.ok(existsSync(path.join(plugin, "bin/flisk-mcp.mjs")), "the Claude Code launcher ships in the plugin");
});

test("every marketplace points at a folder with that host's manifest", () => {
  const claude = readJson(ROOT, ".claude-plugin/marketplace.json").plugins[0].source;
  assert.ok(existsSync(path.join(ROOT, claude, ".claude-plugin/plugin.json")), "Claude Code / Copilot CLI");
  const codex = readJson(ROOT, ".agents/plugins/marketplace.json").plugins[0].source;
  assert.equal(codex.source, "local");
  assert.ok(existsSync(path.join(ROOT, codex.path, "plugin.json")), "Codex");
  const cursor = readJson(ROOT, ".cursor-plugin/marketplace.json").plugins[0].source;
  assert.ok(existsSync(path.join(ROOT, cursor, ".cursor-plugin/plugin.json")), "Cursor");
  const gemini = readJson(ROOT, "gemini-extension.json");
  assert.ok(gemini.name && gemini.version, "Gemini CLI needs a name and a version");
  assert.ok(existsSync(path.join(ROOT, gemini.contextFileName)), "Gemini context file");
});

test("the ChatGPT and Codex listing fits the directory's limits and its images exist", () => {
  assert.ok(OPENAI_INTERFACE.displayName.length <= 30);
  assert.ok(OPENAI_INTERFACE.shortDescription.length <= 30);
  assert.ok(OPENAI_INTERFACE.longDescription.length <= 4000);
  assert.ok(OPENAI_INTERFACE.developerName.length <= 80);
  assert.ok(OPENAI_INTERFACE.defaultPrompt.length <= 3);
  for (const prompt of OPENAI_INTERFACE.defaultPrompt) assert.ok(prompt.length <= 128, prompt);
  for (const image of [OPENAI_INTERFACE.logo, OPENAI_INTERFACE.composerIcon]) {
    assert.match(image, /^\.\//);
    assert.ok(existsSync(path.join(ROOT, PLUGIN_DIR, image)), image);
  }
  const cursorLogo = readJson(ROOT, PLUGIN_DIR, ".cursor-plugin/plugin.json").logo;
  assert.ok(existsSync(path.join(ROOT, PLUGIN_DIR, cursorLogo)), cursorLogo);
});

test("the plugin ships every project skill, named after its folder, with no relative links", () => {
  const names = skillNames(ROOT);
  assert.ok(names.includes("flisk-build") && names.includes("flisk-up"));
  for (const name of names) {
    const text = readFileSync(path.join(ROOT, PLUGIN_DIR, "skills", name, "SKILL.md"), "utf8");
    assert.ok(text.startsWith(`---\nname: ${name}\n`), `${name}: frontmatter name`);
    assert.doesNotMatch(text, /\]\((?:\.\.\/)+/, `${name}: a relative link points nowhere inside an installed plugin`);
  }
});

test("absoluteDocLinks turns docs/ links at any depth into GitHub URLs and leaves others alone", () => {
  assert.equal(
    absoluteDocLinks("[a](../../../docs/byo.md#x) [b](../docs/c.md) [c](https://e.com/docs/d.md)"),
    "[a](https://github.com/flisk-sh/flisk/blob/main/docs/byo.md#x) [b](https://github.com/flisk-sh/flisk/blob/main/docs/c.md) [c](https://e.com/docs/d.md)",
  );
});

test("the generator follows the skill sources: a changed skill is rewritten and a removed one deleted", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "agent-plugin-"));
  try {
    const skill = (name) => path.join(repo, SKILLS_SOURCE, name, "SKILL.md");
    for (const name of ["flisk-a", "flisk-b"]) {
      mkdirSync(path.dirname(skill(name)), { recursive: true });
      writeFileSync(skill(name), `---\nname: ${name}\n---\nSee [docs](../../../docs/x.md).\n`);
    }
    assert.ok(run(repo, { write: true }).length > 0);
    assert.deepEqual(run(repo, { write: false }), []);
    const copy = path.join(repo, PLUGIN_DIR, "skills/flisk-a/SKILL.md");
    assert.match(readFileSync(copy, "utf8"), /\(https:\/\/github\.com\/flisk-sh\/flisk\/blob\/main\/docs\/x\.md\)/);

    writeFileSync(skill("flisk-a"), "---\nname: flisk-a\n---\nChanged.\n");
    rmSync(path.dirname(skill("flisk-b")), { recursive: true });
    assert.deepEqual(run(repo, { write: false }), [`${PLUGIN_DIR}/skills/flisk-a/SKILL.md`, `${PLUGIN_DIR}/skills/flisk-b`]);
    run(repo, { write: true });
    assert.equal(readFileSync(copy, "utf8"), "---\nname: flisk-a\n---\nChanged.\n");
    assert.ok(!existsSync(path.join(repo, PLUGIN_DIR, "skills/flisk-b")));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

let hasZip = true;
try {
  execFileSync("zip", ["-v"], { stdio: "ignore" });
  execFileSync("unzip", ["-v"], { stdio: "ignore" });
} catch {
  hasZip = false;
}

test("the ChatGPT directory package is skills-only and desktop-only", { skip: !hasZip && "zip/unzip not installed" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-plugin-zip-"));
  try {
    const out = path.join(dir, "flisk.zip");
    openaiZip(ROOT, out);
    const entries = execFileSync("unzip", ["-Z1", out], { encoding: "utf8" }).split("\n").filter(Boolean);
    for (const entry of ["plugin.json", "skills/flisk-build/SKILL.md", "assets/logo.png"]) {
      assert.ok(entries.includes(entry), entry);
    }
    for (const entry of entries) assert.doesNotMatch(entry, /(^|\/)\.?mcp\.json$|^\.(claude|codex|cursor)-plugin\//, entry);
    execFileSync("unzip", ["-q", out, "plugin.json", "-d", dir]);
    const manifest = readJson(dir, "plugin.json");
    assert.equal(manifest.extensions["com.openai"].requires_local_executor, true);
    assert.equal(manifest.extensions["com.openai"].interface.displayName, "Flisk");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the MCP Registry entry is the published npm package, started as flisk mcp", () => {
  const pkg = readJson(ROOT, "package.json");
  const server = mcpRegistryServer("1.2.3");
  // The registry rejects a publish whose npm package does not carry the same mcpName.
  assert.equal(pkg.mcpName, MCP_REGISTRY_NAME);
  assert.equal(server.name, MCP_REGISTRY_NAME);
  assert.match(server.name, /^io\.github\.flisk-sh\//);
  assert.ok(server.description.length <= 100, "the registry allows at most 100 characters");
  assert.equal(server.version, "1.2.3");
  assert.deepEqual(server.packages, [
    {
      registryType: "npm",
      identifier: pkg.name,
      version: "1.2.3",
      transport: { type: "stdio" },
      packageArguments: [{ type: "positional", value: "mcp" }],
    },
  ]);
});

test("--mcp-registry writes server.json for package.json's version, or for --version", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-plugin-registry-"));
  try {
    const out = path.join(dir, "server.json");
    execFileSync(process.execPath, [GENERATOR, "--root", ROOT, "--mcp-registry", out], { stdio: "ignore" });
    assert.equal(readJson(out).version, readJson(ROOT, "package.json").version);
    execFileSync(process.execPath, [GENERATOR, "--root", ROOT, "--mcp-registry", out, "--version", "9.8.7"], { stdio: "ignore" });
    assert.deepEqual(readJson(out), mcpRegistryServer("9.8.7"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the one-click install links start flisk mcp, and the docs use them as generated", () => {
  const cursor = new URL(INSTALL_LINKS.cursor);
  assert.equal(cursor.searchParams.get("name"), "flisk");
  assert.deepEqual(JSON.parse(Buffer.from(cursor.searchParams.get("config"), "base64").toString()), {
    command: "flisk",
    args: ["mcp"],
  });
  const vscode = new URL(INSTALL_LINKS.vscode);
  assert.equal(vscode.searchParams.get("name"), "flisk");
  assert.deepEqual(JSON.parse(vscode.searchParams.get("config")), { type: "stdio", command: "flisk", args: ["mcp"] });

  const docs = {
    [`${PLUGIN_DIR}/README.md`]: ["cursor", "vscode"],
    "docs/agent-tooling/flisk-mcp-setup.md": ["cursor", "vscode"],
    "docs/agents/cursor.md": ["cursor"],
  };
  for (const [rel, hosts] of Object.entries(docs)) {
    const text = readFileSync(path.join(ROOT, rel), "utf8");
    for (const host of hosts) assert.ok(text.includes(`](${INSTALL_LINKS[host]})`), `${rel}: the ${host} link is not the generated one`);
  }
});
