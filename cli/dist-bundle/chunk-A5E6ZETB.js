import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/one-command.js
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
var FRONTEND_MARKER = "Frontend URLs";
function findFrontendUrl(output) {
  const lines = output.split("\n");
  const markerIndex = lines.findIndex((line) => line.includes(FRONTEND_MARKER));
  if (markerIndex === -1)
    return void 0;
  for (const line of lines.slice(markerIndex + 1)) {
    const match = line.match(/^\s*-\s+\S+:\s+(https?:\/\/\S+)/);
    if (match)
      return match[1];
    if (line.trim() === "" || line.includes("URLs:"))
      break;
  }
  return void 0;
}
function initializeProject(binPath, cwd, env = process.env, spawnFn = spawn) {
  return new Promise((resolve) => {
    const child = spawnFn(process.execPath, [binPath, "project", "--yes", "--quiet"], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => resolve({ ok: false, error: error.message, output }));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, output });
        return;
      }
      const last = output.split("\n").map((line) => line.trim()).filter(Boolean).pop();
      resolve({ ok: false, error: last ?? `the project setup failed (code ${code})`, output });
    });
  });
}
function parseStackEnvelope(output) {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{"))
      continue;
    try {
      const parsed = JSON.parse(trimmed);
      const data = parsed.data ?? {};
      const ok = data.ok === true;
      return {
        ok,
        data: parsed.data ?? {},
        error: ok ? void 0 : parsed.errors?.[0]?.message ?? "the stack did not come up",
        raw: output
      };
    } catch {
    }
  }
  return void 0;
}
function runStackQuiet(binPath, cwd, env = process.env, spawnFn = spawn) {
  return new Promise((resolve) => {
    const child = spawnFn(process.execPath, [binPath, "up", "--json"], {
      cwd,
      env,
      stdio: ["inherit", "pipe", "pipe"]
    });
    let output = "";
    let settled = false;
    const settle = (outcome) => {
      if (settled)
        return;
      settled = true;
      child.unref?.();
      resolve(outcome);
    };
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
      const envelope = parseStackEnvelope(output);
      if (envelope)
        settle(envelope);
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => settle({ ok: false, error: error.message, raw: output }));
    child.on("close", (code) => settle({
      ok: false,
      error: `the stack stopped before it was ready (code ${code})`,
      raw: output
    }));
  });
}
function nextAvailableProjectDir(base, isTaken) {
  if (!isTaken(base))
    return base;
  for (let suffix = 2; suffix < 1e3; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!isTaken(candidate))
      return candidate;
  }
  return base;
}
function findServiceDirs(projectRoot, maxDepth = 4) {
  const dirs = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth)
      return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((entry) => entry.name);
    } catch {
      return;
    }
    if (entries.includes("package.json"))
      dirs.push(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith("."))
        continue;
      walk(join(dir, entry.name), depth + 1);
    }
  };
  walk(projectRoot, 0);
  return dirs;
}
async function installServiceDependencies(projectRoot, run = defaultRun) {
  const results = [];
  for (const dir of findServiceDirs(projectRoot)) {
    const code = await run("bun", ["install"], dir);
    results.push({ dir, ok: code === 0 });
  }
  return results;
}
function defaultRun(command, args, cwd, spawnFn = spawn) {
  return new Promise((resolve) => {
    const child = spawnFn(command, args, { cwd, stdio: "ignore" });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export {
  findFrontendUrl,
  initializeProject,
  parseStackEnvelope,
  runStackQuiet,
  nextAvailableProjectDir,
  findServiceDirs,
  installServiceDependencies,
  defaultRun
};
