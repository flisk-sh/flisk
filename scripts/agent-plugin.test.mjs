// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/agent-plugin.mjs: the committed plugin files are current, every host's manifest is valid for
// that host, and the generator keeps the skill copies in step with cli/templates/agent-skills.
//   node --test scripts/agent-plugin.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  absoluteDocLinks,
  CLAUDE_PLUGIN_DIR,
  INSTALL_LINKS,
  MCP_REGISTRY_NAME,
  mcpRegistryServer,
  OPENAI_INTERFACE,
  openaiZip,
  plan,
  PLUGIN_DIR,
  run,
  SKILLS_SOURCE,
  skillNames,
} from "./agent-plugin.mjs";

const GENERATOR = fileURLToPath(new URL("./agent-plugin.mjs", import.meta.url));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS = path.join(ROOT, "scripts/agent-plugin-schemas");
const readJson = (...parts) => JSON.parse(readFileSync(path.join(...parts), "utf8"));
const PLUGIN_CLAUDE_FILES = [
  `${PLUGIN_DIR}/hooks/hooks.json`,
  `${PLUGIN_DIR}/hooks/flisk-generated-guard.mjs`,
  `${PLUGIN_DIR}/hooks/flisk-config-verify.mjs`,
  `${PLUGIN_DIR}/agents/flisk-verifier.md`,
];

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

test("the self-hosted plugin owns the Claude Code hooks and verifier agent", () => {
  const generated = new Set(plan(ROOT).map((file) => file.rel));
  for (const rel of PLUGIN_CLAUDE_FILES) {
    assert.ok(generated.has(rel), `the generator plans ${rel}`);
    assert.ok(existsSync(path.join(ROOT, rel)), rel);
  }
  const manifest = readJson(ROOT, PLUGIN_DIR, ".claude-plugin/plugin.json");
  assert.equal(manifest.hooks, "./hooks/hooks.json");
  const hooks = readJson(ROOT, PLUGIN_DIR, "hooks/hooks.json").hooks;
  assert.ok(hooks.PreToolUse?.length, "a PreToolUse hook guards edits");
  assert.ok(hooks.PostToolUse?.length, "a PostToolUse hook verifies edits");
  const commands = [];
  for (const [event, groups] of Object.entries(hooks)) {
    for (const group of groups) {
      assert.match(group.matcher, /Edit|Write/, `${event}: the hook runs on file edits`);
      for (const hook of group.hooks) {
        assert.equal(hook.type, "command");
        assert.equal(hook.command, "node", "hooks are portable: no POSIX shell");
        assert.equal(hook.args.length, 1);
        commands.push(hook.args[0]);
      }
    }
  }
  assert.ok(commands.includes("${CLAUDE_PLUGIN_ROOT}/hooks/flisk-generated-guard.mjs"));
  assert.ok(commands.includes("${CLAUDE_PLUGIN_ROOT}/hooks/flisk-config-verify.mjs"));
  // Hooks run commands, so only the self-hosted plugin ships them, never the directory-listed one.
  for (const dir of ["hooks", "agents"]) {
    assert.ok(!existsSync(path.join(ROOT, CLAUDE_PLUGIN_DIR, dir)), `${CLAUDE_PLUGIN_DIR}/${dir}`);
  }
});

test("flisk-verifier is read-only and checks with Flisk's own read tools", () => {
  const text = readFileSync(path.join(ROOT, PLUGIN_DIR, "agents/flisk-verifier.md"), "utf8");
  assert.match(text, /^---\nname: flisk-verifier\n/);
  assert.match(text, /^---\nname: flisk-verifier\ndescription: [^\n]+\n/);
  const frontmatter = text.split("---")[1];
  for (const tool of [
    "Bash(flisk status:*)",
    "Bash(flisk logs:*)",
    "Bash(flisk doctor --json)",
    "mcp__flisk__status",
    "mcp__flisk__logs",
    "mcp__flisk__doctor",
    "mcp__flisk__resource_list",
    "mcp__flisk__network_list",
    "mcp__flisk__config_verify",
  ]) {
    assert.ok(frontmatter.includes(tool), `the agent may use ${tool}`);
  }
  for (const tool of [
    "Edit",
    "Write",
    "NotebookEdit",
    "Bash(flisk up",
    "Bash(flisk down",
    "Bash(flisk doctor --fix",
    "mcp__flisk__up",
    "mcp__flisk__resource_create",
    "mcp__flisk__config_regenerate",
  ]) {
    assert.ok(!frontmatter.includes(tool), `the agent cannot use ${tool}`);
  }
  for (const word of ["status", "logs", "doctor", "URL"]) assert.match(text, new RegExp(word, "i"));
});

test("every flisk-claude skill says how to add the MCP server when tools are missing", () => {
  for (const name of skillNames(ROOT)) {
    const text = readFileSync(path.join(ROOT, CLAUDE_PLUGIN_DIR, "skills", name, "SKILL.md"), "utf8");
    assert.match(text, /flisk connect claude/, name);
  }
});

test("the shipped hooks deny generated edits, allow source edits and report config drift", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flisk-plugin-hooks-"));
  try {
    const guard = path.join(ROOT, PLUGIN_DIR, "hooks/flisk-generated-guard.mjs");
    const verify = path.join(ROOT, PLUGIN_DIR, "hooks/flisk-config-verify.mjs");
    const at = (...parts) => path.join(dir, ...parts);
    const input = (event, tool, file) =>
      JSON.stringify({
        hook_event_name: event,
        tool_name: tool,
        tool_input: { file_path: file },
        cwd: dir,
      });
    const run = (script, payload, env = {}) =>
      spawnSync(process.execPath, [script], {
        input: payload,
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
      });

    const denied = run(guard, input("PreToolUse", "Edit", at("services/api/.autogenerated/Dockerfile")));
    assert.equal(denied.status, 2, denied.stderr);
    assert.match(denied.stderr, /service\.json/);
    assert.match(denied.stderr, /flisk resource/);
    for (const file of [
      ".flisk/project.json",
      ".flisk-out/state.json",
      "services/platform/database-management/docker-compose.yml",
      "Tiltfile",
      "TILT_TECH.star",
    ]) {
      assert.equal(run(guard, input("PreToolUse", "Write", at(file))).status, 2, file);
    }
    const allowed = run(guard, input("PreToolUse", "Edit", at("services/api/src/index.ts")));
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(allowed.stderr, "");

    // A fake `flisk` on PATH proves the PostToolUse hook really runs `flisk config verify --json`.
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const argsFile = path.join(dir, "verify-args.txt");
    const drift = '{"schemaVersion":1,"data":{"valid":false,"errors":["service.json drift"]},"errors":[]}';
    if (process.platform === "win32") {
      writeFileSync(
        path.join(bin, "flisk.cmd"),
        `@echo off\r\necho %* > "${argsFile.split(path.sep).join("/")}"\r\necho ${drift}\r\n`,
      );
    } else {
      writeFileSync(path.join(bin, "flisk"), `#!/bin/sh\necho "$*" > "${argsFile}"\necho '${drift}'\n`, {
        mode: 0o755,
      });
    }
    const env = { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` };
    const verified = run(verify, input("PostToolUse", "Edit", at("services/api/service.json")), env);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /service\.json drift/);
    assert.equal(readFileSync(argsFile, "utf8").trim(), "config verify --json");

    rmSync(argsFile, { force: true });
    const skipped = run(verify, input("PostToolUse", "Edit", at("services/api/src/index.ts")), env);
    assert.equal(skipped.status, 0, skipped.stderr);
    assert.equal(skipped.stdout, "");
    assert.ok(!existsSync(argsFile), "verify runs only after a service.json edit");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    readJson(plugin, ".mcp.json").mcpServers.flisk,
    readJson(ROOT, "gemini-extension.json").mcpServers.flisk,
  ];
  for (const server of servers) assert.deepEqual([server.command, ...server.args], ["flisk", "mcp"]);
  assert.equal(readJson(plugin, ".codex-plugin/plugin.json").mcpServers, "./.mcp.json");
});

test("the Claude Code plugin starts flisk mcp without a POSIX shell", () => {
  const dir = path.join(ROOT, CLAUDE_PLUGIN_DIR);
  const config = readJson(dir, ".mcp.json");
  const server = config.mcpServers.flisk;
  assert.deepEqual(Object.keys(config.mcpServers), ["flisk"]);
  assert.equal(server.command, "node");
  assert.equal(server.args.length, 1);
  assert.match(server.args[0], /^\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/flisk-mcp\.mjs$/);
  assert.doesNotMatch(JSON.stringify(server), /\.sh\b/);

  const launcher = path.join(dir, "scripts", "flisk-mcp.mjs");
  assert.ok(existsSync(launcher), "the portable launcher is shipped inside the plugin");
  const code = readFileSync(launcher, "utf8");
  assert.match(code, /spawn\("flisk", \["mcp"\], options\)/);
  assert.match(code, /if \(process\.platform === "win32"\) options\.shell = true;/);

  // Run the shipped launcher with a fake `flisk` on PATH. On Windows npm installs a flisk.cmd shim, which Node can
  // only start through a shell; the .cmd fixture below makes the test cover that path on a Windows runner.
  const bin = mkdtempSync(path.join(tmpdir(), "flisk-claude-mcp-bin-"));
  try {
    const marker = "flisk mcp started";
    if (process.platform === "win32") {
      writeFileSync(path.join(bin, "flisk.cmd"), `@echo off\r\necho ${marker}\r\n`);
    } else {
      writeFileSync(path.join(bin, "flisk"), `#!/bin/sh\necho ${marker}\n`, { mode: 0o755 });
    }
    const output = execFileSync(process.execPath, [launcher], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    assert.match(output, new RegExp(marker));
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});

test("every marketplace points at a folder with that host's manifest", () => {
  const claude = readJson(ROOT, ".claude-plugin/marketplace.json").plugins[0].source;
  assert.ok(existsSync(path.join(ROOT, claude, ".claude-plugin/plugin.json")), "Claude Code / Copilot CLI");
  const listing = readJson(path.join(ROOT, claude), ".claude-plugin/plugin.json");
  for (const key of ["documentationUrl", "supportUrl", "privacyPolicyUrl"]) assert.match(listing[key], /^https:\/\//, key);
  assert.ok(existsSync(path.join(ROOT, claude, ".claude-plugin/icon.png")), "the Claude directory wants an icon");
  const codex = readJson(ROOT, ".agents/plugins/marketplace.json").plugins[0].source;
  assert.equal(codex.source, "local");
  assert.ok(existsSync(path.join(ROOT, codex.path, "plugin.json")), "Codex");
  const cursor = readJson(ROOT, ".cursor-plugin/marketplace.json").plugins[0].source;
  assert.ok(existsSync(path.join(ROOT, cursor, ".cursor-plugin/plugin.json")), "Cursor");
  const gemini = readJson(ROOT, "gemini-extension.json");
  assert.ok(gemini.name && gemini.version, "Gemini CLI needs a name and a version");
  assert.ok(existsSync(path.join(ROOT, gemini.contextFileName)), "Gemini context file");
});

test("the Claude Code plugin ships no POSIX shell launcher", () => {
  const dir = path.join(ROOT, CLAUDE_PLUGIN_DIR);
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
    );
  for (const file of walk(dir)) {
    assert.doesNotMatch(file, /\.sh$/, `${path.relative(ROOT, file)} needs a POSIX shell`);
    if (/\.(md|txt|json|ya?ml|mjs)$/i.test(file)) {
      const text = readFileSync(file, "utf8");
      assert.ok(!text.startsWith("#!"), `${path.relative(ROOT, file)} starts with #!`);
      assert.ok(!text.includes("\0"), `${path.relative(ROOT, file)} has a NUL byte`);
    }
  }
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
    assert.deepEqual(run(repo, { write: false }), [
      `${PLUGIN_DIR}/skills/flisk-a/SKILL.md`,
      `${CLAUDE_PLUGIN_DIR}/skills/flisk-a/SKILL.md`,
      `${PLUGIN_DIR}/skills/flisk-b`,
      `${CLAUDE_PLUGIN_DIR}/skills/flisk-b`,
    ]);
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
