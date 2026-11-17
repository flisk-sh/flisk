#!/usr/bin/env node
// Agent-recovery benchmark harness (Copyright (c) 2026 Flisk Landscape contributors, MIT).
//   harness.mjs prep  <dir> <arm: control|flisk> <fault: A..F|none> <basePort>
//   harness.mjs grade <dir>            independent end-to-end check + leftover check (JSON on stdout)
//   harness.mjs watch <dir>            background: appends the first time the app passes the e2e check to <dir>/timeline.jsonl
//   harness.mjs mcp   <dir> <tool> [jsonArgs]   one real `flisk mcp` stdio tool call, logged to <dir>/mcp-calls.jsonl
// Ports: db=base, api=base+1, web=base+2. Truth about boots comes from <dir>/events.log, written by the services.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, "../../cli/bin/flisk.js");
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });
const ports = (dir) => {
  const env = readEnv(dir);
  const base = Number(env.DB_PORT);
  return { db: base, api: base + 1, web: base + 2 };
};
const readEnv = (dir) =>
  Object.fromEntries(
    readFileSync(join(dir, ".env"), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );

const DEV_SH = `#!/bin/sh
# Start/stop the notes app locally. Usage: ./dev.sh up|down|status
cd "$(dirname "$0")"
set -a; . ./.env; set +a
mkdir -p logs .pids
API_DEPENDS="postgres migrate"
wait_for() { # wait_for <service> : waits until that service has been started by this script
  i=0; while [ ! -f ".pids/$1" ]; do i=$((i+1)); [ $i -gt 60 ] && { echo "timed out waiting for $1" >&2; exit 1; }; sleep 1; done
}
start() { # start <name> <dir> <port> <command...>
  n=$1; d=$2; p=$3; shift 3
  (cd $d && { PORT=$p nohup "$@" >> ../logs/$n.log 2>&1 & echo $! > ../.pids/$n; })
}
case "$1" in
  up)
    start postgres postgres $DB_PORT sh run.sh
    (cd migrate && i=0; until sh run.sh >> ../logs/migrate.log 2>&1; do i=$((i+1)); [ $i -gt 30 ] && { echo "migrate failed" >&2; exit 1; }; sleep 1; done; echo "exit-0" > ../.pids/migrate)
    for d in $API_DEPENDS; do wait_for $d; done
    start api api $API_PORT node server.mjs
    sleep 1
    start web web $WEB_PORT node server.mjs
    echo "started (see logs/)";;
  down)
    for f in .pids/*; do [ -f "$f" ] && case "$(cat $f)" in ''|*[!0-9]*) ;; *) kill "$(cat $f)" 2>/dev/null;; esac; done
    rm -f .pids/*; echo stopped;;
  status)
    for f in .pids/*; do [ -f "$f" ] && echo "$(basename $f): pid $(cat $f)"; done;;
  *) echo "usage: ./dev.sh up|down|status"; exit 2;;
esac
`;

const svc = (name, extra) =>
  JSON.stringify({ schemaVersion: 1, appName: name, command: "sh run.sh", ...extra }, null, 2);

function prep(dir, arm, fault, base) {
  base = Number(base);
  mkdirSync(dir, { recursive: true });
  cpSync(join(HERE, "template"), dir, { recursive: true });
  const [pdb, papi, pweb] = [base, base + 1, base + 2];
  const env = {
    DB_PORT: pdb,
    API_PORT: papi,
    WEB_PORT: pweb,
    API_TOKEN: "bench-token-0001",
    DATABASE_URL: `postgres://app@127.0.0.1:${pdb}/notes`,
    API_URL: `http://127.0.0.1:${papi}`,
    NOTES_LIMIT: "100",
  };
  writeFileSync(
    join(dir, ".env"),
    `${Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
  );
  writeFileSync(join(dir, "events.log"), "");
  const init = sh("initdb", ["-D", join(dir, "postgres/data"), "-U", "app", "--auth=trust", "-E", "UTF8"]);
  if (init.error || init.status !== 0) {
    throw new Error(`initdb failed: ${(init.error?.message ?? `${init.stdout}${init.stderr}`).trim().slice(0, 400)}`);
  }
  if (arm === "flisk") {
    writeFileSync(
      join(dir, "postgres/service.json"),
      svc("postgres", { appType: "backend", port: pdb, healthCheck: { port: pdb } }),
    );
    writeFileSync(
      join(dir, "migrate/service.json"),
      svc("migrate", { appType: "migrator", dependsOn: ["postgres"], env: { DB_PORT: "${DB_PORT}" } }),
    );
    writeFileSync(
      join(dir, "api/service.json"),
      svc("api", {
        appType: "backend",
        command: "node server.mjs",
        port: papi,
        healthCheckPath: "/health",
        dependsOn: ["postgres", "migrate"],
        env: {
          API_TOKEN: "${API_TOKEN}",
          DATABASE_URL: "${DATABASE_URL}",
          NOTES_LIMIT: "${NOTES_LIMIT}",
        },
      }),
    );
    writeFileSync(
      join(dir, "web/service.json"),
      svc("web", {
        appType: "frontend",
        command: "node server.mjs",
        port: pweb,
        healthCheckPath: "/health",
        dependsOn: ["api"],
        env: { API_URL: "${API_URL}", API_TOKEN: "${API_TOKEN}" },
      }),
    );
    mkdirSync(join(dir, ".flisk"), { recursive: true });
    // A real Flisk project has .flisk/project.json; without it every MCP tool fails. Round 2 omitted this (fixture gap).
    sh(process.execPath, [CLI, "project", "--yes", "--no-agent-skills"], { cwd: dir });
  } else {
    writeFileSync(join(dir, "dev.sh"), DEV_SH, { mode: 0o755 });
  }
  const envPath = join(dir, ".env");
  const editEnv = (fn) => writeFileSync(envPath, fn(readFileSync(envPath, "utf8")));
  const start = () =>
    arm === "flisk"
      ? sh(process.execPath, [CLI, "up", "--wait"], { cwd: dir })
      : sh("./dev.sh", ["up"], { cwd: dir });
  if (fault === "A") editEnv((t) => t.replace(/^API_TOKEN=.*\n/m, ""));
  if (fault === "B") writeFileSync(join(dir, "api/config/limits.json"), '{ "maxTextLength": 200, }\n');
  if (fault === "C") chmodSync(join(dir, "postgres/data"), 0o755);
  if (fault === "D") editEnv((t) => t.replace("/notes", "/notes_prod"));
  if (fault === "E") {
    editEnv((t) => t.replace("NOTES_LIMIT=100", "NOTES_LIMIT=0"));
    const r = start();
    if (r.status !== 0) throw new Error(`prep E could not start the stack: ${r.stdout}${r.stderr}`);
  }
  if (fault === "G" && arm === "flisk") {
    // natural naming: the database service is called "db", not "postgres" (no injected fault; control is unaffected)
    renameSync(join(dir, "postgres"), join(dir, "db"));
    for (const f of ["db/service.json", "migrate/service.json", "api/service.json"]) {
      const q = join(dir, f);
      writeFileSync(q, readFileSync(q, "utf8").replaceAll('"postgres"', '"db"'));
    }
  }
  if (fault === "F") {
    if (arm === "flisk") {
      const p = join(dir, "api/service.json");
      writeFileSync(p, readFileSync(p, "utf8").replace('"migrate"', '"migrat"'));
    } else {
      const p = join(dir, "dev.sh");
      writeFileSync(p, readFileSync(p, "utf8").replace('API_DEPENDS="postgres migrate"', 'API_DEPENDS="postgres migrat"'));
    }
  }
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ arm, fault, base, preppedAt: Date.now() }));
  return { dir, arm, fault, ports: { db: pdb, api: papi, web: pweb } };
}

async function e2e(dir) {
  const p = ports(dir);
  const steps = [];
  const mark = `probe-${Math.random().toString(36).slice(2, 8)}`;
  const web = `http://127.0.0.1:${p.web}`;
  const step = async (name, fn) => {
    try {
      const detail = await fn();
      steps.push({ name, ok: true, detail });
      return true;
    } catch (e) {
      steps.push({ name, ok: false, detail: String(e.message ?? e).slice(0, 200) });
      return false;
    }
  };
  const t = AbortSignal.timeout;
  const okSteps =
    (await step("web /health", async () => {
      const r = await fetch(`${web}/health`, { signal: t(3000) });
      if (!r.ok) throw new Error(`status ${r.status}`);
    })) &&
    (await step("web serves the page", async () => {
      const r = await fetch(`${web}/`, { signal: t(3000) });
      if (!(await r.text()).includes("<h1>Notes</h1>")) throw new Error("page missing");
    })) &&
    (await step("POST note through web->api->db", async () => {
      const r = await fetch(`${web}/api/notes`, { method: "POST", body: JSON.stringify({ text: mark }), signal: t(5000) });
      if (r.status !== 201) throw new Error(`status ${r.status}: ${(await r.text()).slice(0, 120)}`);
    })) &&
    (await step("GET note back through web->api", async () => {
      const r = await fetch(`${web}/api/notes`, { signal: t(5000) });
      if (!(await r.text()).includes(mark)) throw new Error("note not listed");
    })) &&
    (await step("row exists in PostgreSQL itself", async () => {
      const r = sh("psql", [`postgres://app@127.0.0.1:${p.db}/notes`, "-At", "-c", `select count(*) from notes where text='${mark}'`]);
      if (r.stdout.trim() !== "1") throw new Error(`psql: ${(r.stdout + r.stderr).trim().slice(0, 120)}`);
    }));
  // Probe notes count against NOTES_LIMIT, and watch() probes repeatedly: remove them, pass or fail.
  sh("psql", [`postgres://app@127.0.0.1:${p.db}/notes`, "-At", "-c", `delete from notes where text='${mark}'`]);
  return { ok: okSteps, steps };
}

function leftovers(dir) {
  const p = ports(dir);
  const listening = Object.entries(p).filter(([, port]) => sh("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).stdout.trim());
  const pg = sh("pgrep", ["-f", `postgres -D ${join(dir, existsSync(join(dir, "db")) ? "db" : "postgres", "data")}`]).stdout.trim();
  return { occupiedPorts: listening.map(([n, port]) => `${n}:${port}`), postgresPids: pg ? pg.split("\n") : [] };
}

function events(dir) {
  const lines = readFileSync(join(dir, "events.log"), "utf8").split("\n").filter(Boolean);
  const boots = {};
  for (const l of lines) {
    const name = l.split(" ")[2];
    if (!name) continue;
    boots[name] = (boots[name] ?? 0) + 1;
  }
  return boots;
}

async function grade(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const result = await e2e(dir);
  const timeline = existsSync(join(dir, "timeline.jsonl"))
    ? readFileSync(join(dir, "timeline.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const healthyAt = timeline.find((e) => e.event === "healthy")?.t;
  return {
    ...meta,
    finalE2E: result,
    bootsPerService: events(dir),
    secondsToFirstHealthy: healthyAt ? Math.round((healthyAt - meta.preppedAt) / 100) / 10 : null,
  };
}

async function watch(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const deadline = Date.now() + 40 * 60_000;
  while (Date.now() < deadline) {
    if (existsSync(join(dir, "watch.stop"))) return;
    if ((await e2e(dir)).ok) {
      appendFileSync(join(dir, "timeline.jsonl"), `${JSON.stringify({ event: "healthy", t: Date.now() })}\n`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  appendFileSync(join(dir, "timeline.jsonl"), `${JSON.stringify({ event: "never-healthy", t: Date.now() })}\n`);
  void meta;
}

function mcp(dir, tool, rawArgs) {
  const args = rawArgs ? JSON.parse(rawArgs) : {};
  const child = spawn(process.execPath, [CLI, "mcp"], { cwd: dir, stdio: ["pipe", "pipe", "ignore"] });
  let buf = "";
  const waiting = new Map();
  child.stdout.on("data", (d) => {
    buf += d;
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        waiting.get(m.id)?.(m);
      } catch {}
    }
  });
  let id = 0;
  const rpc = (method, params) =>
    new Promise((done) => {
      const n = ++id;
      waiting.set(n, done);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
    });
  return (async () => {
    await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "bench", version: "1" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    if (tool === "tools/list") {
      const l = await rpc("tools/list", {});
      child.kill();
      return (l.result?.tools ?? []).map((x) => `${x.name}: ${x.description}\n  input: ${JSON.stringify(x.inputSchema?.properties ?? {})}`).join("\n");
    }
    const m = await rpc("tools/call", { name: tool, arguments: { projectPath: dir, ...args } });
    child.kill();
    const text = m.result?.content?.[0]?.text ?? JSON.stringify(m.error ?? m);
    appendFileSync(join(dir, "mcp-calls.jsonl"), `${JSON.stringify({ t: Date.now(), tool, args, isError: !!m.result?.isError, response: text.slice(0, 4000) })}\n`);
    return text;
  })();
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "prep") console.log(JSON.stringify(prep(resolve(rest[0]), rest[1], rest[2], rest[3])));
else if (cmd === "grade") {
  const g = await grade(resolve(rest[0]));
  console.log(JSON.stringify({ ...g, leftovers: leftovers(resolve(rest[0])) }, null, 2));
} else if (cmd === "leftovers") console.log(JSON.stringify(leftovers(resolve(rest[0]))));
else if (cmd === "watch") await watch(resolve(rest[0]));
else if (cmd === "mcp") console.log(await mcp(resolve(rest[0]), rest[1], rest[2]));
else if (cmd === "scripted") {
  // Deterministic treatment run, no model: prep a Flisk project, `flisk up --wait`, full e2e, `flisk down`, leftovers.
  // Fault G (db service named `db`, DATABASE_URL declared by the api) is the defect-1 regression experiment.
  const dir = resolve(rest[0]);
  prep(dir, "flisk", rest[1] ?? "G", rest[2] ?? "45010");
  const t0 = Date.now();
  const up = sh(process.execPath, [CLI, "up", "--wait"], { cwd: dir, timeout: 300_000 });
  const e = await e2e(dir);
  const down = sh(process.execPath, [CLI, "down"], { cwd: dir, timeout: 120_000 });
  const left = leftovers(dir);
  const record = { fault: rest[1] ?? "G", upExit: up.status, e2e: e, downExit: down.status, leftovers: left, seconds: (Date.now() - t0) / 1000 };
  writeFileSync(join(dir, "scripted-result.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
  process.exit(up.status === 0 && e.ok && left.occupiedPorts.length === 0 && left.postgresPids.length === 0 ? 0 : 1);
} else if (cmd === "verify") {
  // CI gate: the results file and the report must exist and hold every experiment.
  const [resultsPath, docPath] = rest;
  const problems = [];
  if (!existsSync(resultsPath)) problems.push(`missing ${resultsPath}`);
  if (!existsSync(docPath)) problems.push(`missing ${docPath}`);
  if (problems.length === 0) {
    const runs = JSON.parse(readFileSync(resultsPath, "utf8")).runs.filter((r) => r.fault);
    for (const round of ["before-fix", "after-fix"]) {
      if (!runs.some((r) => r.round === round)) problems.push(`no ${round} runs`);
    }
    for (const f of ["A", "B", "C", "D", "E", "F"]) {
      for (const arm of ["control", "treatment"]) {
        if (!runs.some((r) => r.fault === f && r.arm.startsWith(arm) && r.round === "before-fix")) problems.push(`missing before-fix ${arm} fault ${f}`);
      }
    }
    if (!runs.some((r) => r.fault === "G" && r.round === "after-fix")) problems.push("missing after-fix fault G");
  }
  console.log(problems.length ? `FAIL:\n${problems.join("\n")}` : "OK: all experiments present");
  process.exit(problems.length ? 1 : 0);
} else {
  console.error("usage: harness.mjs prep|grade|leftovers|watch|mcp|scripted|verify ...");
  process.exit(2);
}
void execFileSync;
