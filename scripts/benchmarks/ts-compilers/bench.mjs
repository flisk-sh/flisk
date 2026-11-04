#!/usr/bin/env node
// TypeScript compiler benchmark for Flisk: tsc vs tsgo vs ts-rust (tsc-rs).
//
// EXPERIMENT ONLY. It does not change Flisk's compiler, package.json scripts, lockfile, cli/dist or any
// shipped artifact. Compilers are installed into scripts/benchmarks/ts-compilers/node_modules by the CI
// workflow (npm install --no-package-lock) and nothing here is imported by the CLI.
//
// Usage:
//   node bench.mjs [--runs 5] [--out results/<dir>] [--only perf,correctness] [--drop-caches]
//
// Results: <out>/results.json (machine-readable) and <out>/report.md (generated tables).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const CLI = path.join(ROOT, "cli");
const NM = path.join(HERE, "node_modules");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const RUNS = Number(opt("runs", process.env.BENCH_RUNS ?? "5"));
if (!Number.isSafeInteger(RUNS) || RUNS < 1 || RUNS > 20) {
  throw new Error(`--runs must be an integer between 1 and 20 (got "${opt("runs", process.env.BENCH_RUNS ?? "5")}")`);
}
const ONLY = new Set(opt("only", "perf,correctness").split(","));
const DROP_CACHES = args.includes("--drop-caches") || process.env.DROP_CACHES === "1";
const OUT = path.resolve(opt("out", path.join(HERE, "results", new Date().toISOString().replace(/[:.]/g, "-"))));
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-tsbench-"));

// ---- compilers -------------------------------------------------------------------------------------------
const node = process.execPath;
// Windows is intentionally not supported here (untested): npm .cmd shims would need a shell, and /usr/bin/time is absent.
const bin = (n) => path.join(NM, ".bin", n);
const COMPILERS = [
  { id: "tsc", label: "tsc 7.0.2 (repo pin)", role: "baseline", cmd: [node, path.join(CLI, "node_modules/typescript/bin/tsc")] },
  { id: "tsgo", label: "tsgo (native-preview)", role: "candidate", cmd: [bin("tsgo")] },
  { id: "tsc-rs", label: "tsc-rs 0.8.0", role: "candidate", cmd: [bin("tsc-rs")] },
  { id: "tsc-rs-fast", label: "tsc-rs 0.8.0 --fast", role: "candidate", cmd: [bin("tsc-rs")], extra: ["--fast"] },
  { id: "tsc71", label: "tsc 7.1.0-beta (tsc-rs parity pin)", role: "oracle", cmd: [node, path.join(NM, "typescript-71beta/bin/tsc")] },
  { id: "tsc6", label: "tsc 6.0.3 (JS implementation)", role: "context", cmd: [node, path.join(NM, "typescript-6/bin/tsc")] },
];
const available = COMPILERS.filter((c) => fs.existsSync(c.cmd[c.cmd.length - 1]));
for (const c of COMPILERS) if (!available.includes(c)) console.error(`SKIP ${c.id}: ${c.cmd.at(-1)} not found (run npm install --no-package-lock here)`);

const TIME_BIN = fs.existsSync("/usr/bin/time") ? "/usr/bin/time" : null;
const IS_MAC = process.platform === "darwin";

function parseTime(stderr) {
  // returns { userS, sysS, rssBytes } from /usr/bin/time output, or nulls
  const o = { userS: null, sysS: null, rssBytes: null };
  if (IS_MAC) {
    const m = stderr.match(/([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/);
    if (m) {
      o.userS = Number(m[2]);
      o.sysS = Number(m[3]);
    }
    const r = stderr.match(/(\d+)\s+maximum resident set size/);
    if (r) o.rssBytes = Number(r[1]);
  } else {
    const u = stderr.match(/User time \(seconds\): ([\d.]+)/);
    const s = stderr.match(/System time \(seconds\): ([\d.]+)/);
    const r = stderr.match(/Maximum resident set size \(kbytes\): (\d+)/);
    if (u) o.userS = Number(u[1]);
    if (s) o.sysS = Number(s[1]);
    if (r) o.rssBytes = Number(r[1]) * 1024;
  }
  return o;
}

function run(c, tscArgs, cwd) {
  // tsc-rs: --fast is a command-line option, and -b must come first.
  const full = tscArgs[0] === "-b" ? [...c.cmd, "-b", ...(c.extra ?? []), ...tscArgs.slice(1)] : [...c.cmd, ...(c.extra ?? []), ...tscArgs];
  const wrapped = TIME_BIN ? [TIME_BIN, IS_MAC ? "-l" : "-v", ...full] : full;
  const t0 = process.hrtime.bigint();
  const r = spawnSync(wrapped[0], wrapped.slice(1), { cwd, encoding: "utf8", maxBuffer: 1 << 29, timeout: 900_000, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });
  const wallS = Number(process.hrtime.bigint() - t0) / 1e9;
  const stderrRaw = r.stderr ?? "";
  const t = TIME_BIN ? parseTime(stderrRaw) : { userS: null, sysS: null, rssBytes: null };
  // /usr/bin/time appends its report to stderr; the compiler's own diagnostics go to stdout.
  return {
    exit: r.status ?? (r.error ? -1 : 0),
    wallS,
    userS: t.userS,
    sysS: t.sysS,
    cpuUtil: t.userS != null && wallS > 0 ? (t.userS + t.sysS) / wallS : null,
    rssMB: t.rssBytes != null ? t.rssBytes / 1048576 : null,
    stdout: r.stdout ?? "",
    stderr: stderrRaw.split("\n").filter((l) => !/^\s+[\d.]+\s+(real|maximum|average|page|peak|volun|invol|swaps|block|messages|signals|instructions|cycles)|^\s+\d+\s+(maximum|average|page|peak|volun|invol|swaps|block|messages|signals|instructions|cycles)|^\t|^\s+Command being timed/.test(l)).join("\n").slice(-2000),
  };
}

// Compiler order is shuffled per round (seeded, so reproducible) to avoid a fixed ordering bias.
function shuffled(list, seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  const rnd = () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};
const stat = (a) => {
  const v = a.filter((x) => x != null);
  return v.length ? { min: Math.min(...v), median: median(v), max: Math.max(...v), n: v.length } : null;
};
const sh = (cmd, a) => {
  const r = spawnSync(cmd, a, { encoding: "utf8" });
  return (r.stdout ?? "").trim();
};
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
function dropCaches() {
  if (!DROP_CACHES) return;
  if (process.platform === "linux") spawnSync("sh", ["-c", "sync; echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null"]);
  else if (IS_MAC) spawnSync("sudo", ["-n", "purge"]);
}
function walk(dir, base = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else acc.push(path.relative(base, p));
  }
  return acc.sort();
}
const dirBytes = (dir) => walk(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");

// ---- environment ----------------------------------------------------------------------------------------
function versions() {
  const out = {};
  for (const c of available) {
    const r = run(c, ["--version"], CLI);
    out[c.id] = { version: (r.stdout + r.stderr).split("\n").find((l) => /\d+\.\d+/.test(l))?.trim() ?? "unknown", exit: r.exit };
  }
  const pj = (p) => {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
  };
  out._packages = {
    "typescript (repo)": pj(path.join(CLI, "node_modules/typescript/package.json")).version,
    "@typescript/native-preview": pj(path.join(NM, "@typescript/native-preview/package.json")).version,
    "tsc-rs": pj(path.join(NM, "tsc-rs/package.json")).version,
    "typescript-71beta": pj(path.join(NM, "typescript-71beta/package.json")).version,
    "typescript-6": pj(path.join(NM, "typescript-6/package.json")).version,
  };
  return out;
}
const env = {
  date: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  os: `${os.type()} ${os.release()}`,
  cpu: os.cpus()[0]?.model,
  logicalCores: os.cpus().length,
  memGB: Math.round(os.totalmem() / 2 ** 30),
  node: process.version,
  flisk: { commit: sh("git", ["-C", ROOT, "rev-parse", "HEAD"]), cliVersion: JSON.parse(fs.readFileSync(path.join(CLI, "package.json"), "utf8")).version },
  runs: RUNS,
  order: "compiler order shuffled per round with a fixed seed",
  bun: sh("bun", ["--version"]) || null,
  dropCaches: DROP_CACHES,
  timeBinary: TIME_BIN,
  ci: !!process.env.GITHUB_ACTIONS,
  versions: versions(),
  tscRsGitHead: sh("npm", ["view", "tsc-rs@0.8.0", "gitHead"]) || null,
  tscRsSourcePin: "pingdotgg/ts-rust@91f3d021c4f1f102cebee704ac285e85ae0c8ff5 (main when benchmark was written; npm tsc-rs 0.8.0 is the measured artifact)",
  sourceFiles: { cli_src_ts: walk(path.join(CLI, "src")).filter((f) => /\.tsx?$/.test(f)).length },
};
const results = { env, perf: {}, correctness: {}, notes: [] };
const save = () => fs.writeFileSync(path.join(OUT, "results.json"), `${JSON.stringify(results, null, 2)}\n`);

// ---- performance ----------------------------------------------------------------------------------------
const LEAF = path.join(CLI, "src/utils/native-demo.ts");
function perf() {
  const trivial = path.join(TMP, "trivial");
  fs.mkdirSync(trivial, { recursive: true });
  fs.writeFileSync(path.join(trivial, "a.ts"), "export const a: number = 1;\n");

  // scenario: { id, prep(c,i,ctx)->args, cwd, setup/teardown, measureOut }
  const outFor = (c, s) => path.join(TMP, `out-${s}-${c.id}`);
  const common = ["--pretty", "false"];
  const scenarios = [
    { id: "startup-version", desc: "--version (process start + exit)", args: () => ["--version"], cwd: CLI },
    { id: "startup-trivial", desc: "one-line file, --noEmit", args: () => [...common, "--noEmit", "--skipLibCheck", "--strict", path.join(trivial, "a.ts")], cwd: trivial },
    { id: "typecheck", desc: "type-check only: tsconfig.typecheck.json --noEmit (src + tests/generated + tests/runtime-layout)", args: () => [...common, "-p", "tsconfig.typecheck.json", "--noEmit"], cwd: CLI },
    { id: "emit-js-nocheck", desc: "JavaScript emission only: tsconfig.json --noCheck, declarations off", args: (c) => [...common, "-p", "tsconfig.json", "--noCheck", "--declaration", "false", "--outDir", outFor(c, "js")], cwd: CLI, out: (c) => outFor(c, "js"), reset: true },
    { id: "emit-dts-nocheck", desc: "declaration emission only: --noCheck --emitDeclarationOnly", args: (c) => [...common, "-p", "tsconfig.json", "--noCheck", "--emitDeclarationOnly", "--outDir", outFor(c, "dts")], cwd: CLI, out: (c) => outFor(c, "dts"), reset: true },
    { id: "full-build", desc: "the repo's build: tsconfig.json (check + JS + .d.ts)", args: (c) => [...common, "-p", "tsconfig.json", "--outDir", outFor(c, "full")], cwd: CLI, out: (c) => outFor(c, "full"), reset: true },
  ];
  for (const s of scenarios) {
    console.log(`\n== perf: ${s.id}`);
    const samples = Object.fromEntries(available.map((c) => [c.id, []]));
    for (let i = 0; i < RUNS + 1; i++) {
      for (const c of shuffled(available, i * 131 + s.id.length)) {
        if (s.reset && s.out) rmrf(s.out(c));
        if (i === 0) dropCaches();
        const r = run(c, s.args(c), s.cwd);
        const rec = { wallS: r.wallS, userS: r.userS, sysS: r.sysS, cpuUtil: r.cpuUtil, rssMB: r.rssMB, exit: r.exit, cold: i === 0 };
        if (s.out && i === RUNS) { rec.outBytes = dirBytes(s.out(c)); rec.outFiles = walk(s.out(c)).length; }
        if (r.exit !== 0) rec.err = (r.stdout + r.stderr).split("\n").slice(0, 6).join("\n");
        samples[c.id].push(rec);
        process.stdout.write(`  ${c.id} #${i}: ${r.wallS.toFixed(2)}s exit=${r.exit}\n`);
      }
    }
    results.perf[s.id] = { desc: s.desc, byCompiler: summarize(samples) };
    save();
  }

  // Bun workflow: the repo runs `bun run typecheck`. bun puts cli/node_modules/.bin first on PATH, so a
  // candidate cannot be swapped in by PATH; instead each compiler is invoked by `bun run` through a throwaway
  // package.json with the same flags as the real "typecheck" script. The baseline also runs the real script.
  if (sh("bun", ["--version"])) {
    console.log("\n== perf: bun-run-typecheck");
    const bunDir = path.join(TMP, "bunrun");
    fs.mkdirSync(bunDir, { recursive: true });
    const q = (x) => JSON.stringify(x);
    const samples = Object.fromEntries([...available.map((c) => [c.id, []]), ["tsc-real-script", []]]);
    const bunRun = (cwd) => {
      const t0 = process.hrtime.bigint();
      const w = TIME_BIN ? [TIME_BIN, IS_MAC ? "-l" : "-v", "bun", "run", "typecheck"] : ["bun", "run", "typecheck"];
      const r = spawnSync(w[0], w.slice(1), { cwd, encoding: "utf8", maxBuffer: 1 << 29, timeout: 900_000 });
      const wallS = Number(process.hrtime.bigint() - t0) / 1e9;
      const t = TIME_BIN ? parseTime(r.stderr ?? "") : { userS: null, sysS: null, rssBytes: null };
      return { wallS, userS: t.userS, sysS: t.sysS, cpuUtil: t.userS != null ? (t.userS + t.sysS) / wallS : null, rssMB: t.rssBytes != null ? t.rssBytes / 1048576 : null, exit: r.status ?? -1, err: (r.stdout ?? "").split("\n").slice(0, 4).join("\n") };
    };
    for (const c of available) {
      const d = path.join(bunDir, c.id);
      fs.mkdirSync(d, { recursive: true });
      const cmd = [...c.cmd, ...(c.extra ?? []), "--pretty", "false", "-p", path.join(CLI, "tsconfig.typecheck.json"), "--noEmit"].map(q).join(" ");
      fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "bench", private: true, scripts: { typecheck: cmd } }));
    }
    for (let i = 0; i < RUNS + 1; i++) {
      for (const id of shuffled([...available.map((c) => c.id), "tsc-real-script"], i * 53 + 3)) {
        const r = bunRun(id === "tsc-real-script" ? CLI : path.join(bunDir, id));
        samples[id].push({ ...r, cold: i === 0 });
        process.stdout.write(`  bun run ${id} #${i}: ${r.wallS.toFixed(2)}s exit=${r.exit}\n`);
      }
    }
    results.perf["bun-run-typecheck"] = { desc: "`bun run typecheck` launching each compiler (tsc-real-script = the repo's actual cli package.json script)", byCompiler: summarize(samples) };
    save();
  }

  // incremental: cold build -> no-change rebuild -> one-file edit rebuild
  console.log("\n== perf: incremental");
  const inc = Object.fromEntries(available.map((c) => [c.id, { cold: [], nochange: [], edit: [], behaviour: null }]));
  const original = fs.readFileSync(LEAF, "utf8");
  try {
    for (let i = 0; i < RUNS; i++) {
      for (const c of shuffled(available, i * 977 + 7)) {
        const out = path.join(TMP, `out-inc-${c.id}`);
        rmrf(out);
        fs.writeFileSync(LEAF, original);
        const a = ["--pretty", "false", "-p", "tsconfig.json", "--incremental", "--tsBuildInfoFile", path.join(out, "b.tsbuildinfo"), "--outDir", out];
        if (i === 0) dropCaches();
        const cold = run(c, a, CLI);
        const before = fileMtimes(out);
        const nochange = run(c, a, CLI);
        const afterNo = fileMtimes(out);
        fs.writeFileSync(LEAF, `${original}\nconst __flisk_bench_${i} = ${i};\nvoid __flisk_bench_${i};\n`);
        const edit = run(c, a, CLI);
        const afterEdit = fileMtimes(out);
        for (const [k, r] of [["cold", cold], ["nochange", nochange], ["edit", edit]]) {
          inc[c.id][k].push({ wallS: r.wallS, userS: r.userS, sysS: r.sysS, cpuUtil: r.cpuUtil, rssMB: r.rssMB, exit: r.exit });
        }
        inc[c.id].behaviour = {
          buildInfoWritten: fs.existsSync(path.join(out, "b.tsbuildinfo")),
          filesRewrittenOnNoChange: changed(before, afterNo),
          filesRewrittenOnOneFileEdit: changed(afterNo, afterEdit),
          totalOutputFiles: Object.keys(afterEdit).length,
        };
        process.stdout.write(`  ${c.id} #${i}: cold ${cold.wallS.toFixed(2)}s nochange ${nochange.wallS.toFixed(2)}s edit ${edit.wallS.toFixed(2)}s\n`);
      }
    }
  } finally {
    fs.writeFileSync(LEAF, original);
  }
  results.perf.incremental = {
    desc: `--incremental on tsconfig.json; "edit" appends a non-exported const to ${path.relative(ROOT, LEAF)} (restored afterwards)`,
    byCompiler: Object.fromEntries(Object.entries(inc).map(([id, v]) => [id, { cold: sum(v.cold), nochange: sum(v.nochange), edit: sum(v.edit), behaviour: v.behaviour }])),
  };
  save();
}
function fileMtimes(dir) {
  const m = {};
  for (const f of walk(dir)) m[f] = fs.statSync(path.join(dir, f)).mtimeMs;
  return m;
}
const changed = (a, b) => Object.keys(b).filter((k) => a[k] === undefined || a[k] !== b[k]).length;
function summarize(samples) {
  return Object.fromEntries(Object.entries(samples).map(([id, recs]) => {
    const okAll = recs.every((r) => r.exit === 0);
    const warm = recs.filter((r) => !r.cold && r.exit === 0);
    const cold = recs.find((r) => r.cold);
    return [id, {
      ok: okAll,
      failure: okAll ? null : recs.find((r) => r.exit !== 0)?.err ?? "non-zero exit",
      cold: cold?.exit === 0 ? { wallS: cold.wallS } : null,
      warm: { wallS: stat(warm.map((r) => r.wallS)), userS: stat(warm.map((r) => r.userS)), sysS: stat(warm.map((r) => r.sysS)), cpuUtil: stat(warm.map((r) => r.cpuUtil)), rssMB: stat(warm.map((r) => r.rssMB)) },
      outBytes: recs.at(-1)?.outBytes ?? null,
      outFiles: recs.at(-1)?.outFiles ?? null,
    }];
  }));
}
const sum = (recs) => ({ wallS: stat(recs.map((r) => r.wallS)), rssMB: stat(recs.map((r) => r.rssMB)), cpuUtil: stat(recs.map((r) => r.cpuUtil)), failures: recs.filter((r) => r.exit !== 0).length });

// ---- correctness ----------------------------------------------------------------------------------------
const norm = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").split(TMP).join("<tmp>").split(ROOT).join("<root>").replace(/\r/g, "").trim();
const diagLines = (s) => norm(s).split("\n").filter((l) => /error TS\d+|warning TS\d+/.test(l));
function cmpDiags(ref, other) {
  const a = new Set(diagLines(ref)), b = new Set(diagLines(other));
  return { refCount: a.size, otherCount: b.size, missing: [...a].filter((x) => !b.has(x)), additional: [...b].filter((x) => !a.has(x)), identicalText: norm(ref) === norm(other) };
}
function cmpTrees(refDir, otherDir) {
  const A = walk(refDir).filter((f) => !f.endsWith(".tsbuildinfo")), B = walk(otherDir).filter((f) => !f.endsWith(".tsbuildinfo"));
  const sb = new Set(B), sa = new Set(A);
  const missing = A.filter((f) => !sb.has(f)), extra = B.filter((f) => !sa.has(f));
  const differ = A.filter((f) => sb.has(f) && sha(path.join(refDir, f)) !== sha(path.join(otherDir, f)));
  const byKind = (arr) => arr.reduce((m, f) => { const k = f.endsWith(".d.ts") ? "d.ts" : f.endsWith(".map") ? "map" : f.endsWith(".js") ? "js" : "other"; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  return { refFiles: A.length, identical: A.length - missing.length - differ.length, missing: missing.length, extra: extra.length, differ: differ.length, differByKind: byKind(differ), sampleDiffs: differ.slice(0, 5), sampleMissing: missing.slice(0, 5), sampleExtra: extra.slice(0, 5) };
}
function firstDiff(fileA, fileB) {
  const a = fs.readFileSync(fileA, "utf8").split("\n"), b = fs.readFileSync(fileB, "utf8").split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { line: i + 1, ref: a[i]?.slice(0, 160), other: b[i]?.slice(0, 160) };
  return null;
}

function correctness() {
  const refs = ["tsc", "tsc71"].filter((id) => available.some((c) => c.id === id));
  const others = available.filter((c) => c.id !== "tsc");
  const cases = [];

  // 1. real repo: diagnostics, file list (module resolution), emitted tree with source maps + declaration maps
  const repo = { name: "flisk cli (real repo)", diag: {}, listFiles: {}, emit: {} };
  const outs = {}, diags = {}, lists = {};
  for (const c of available) {
    const o = path.join(TMP, `corr-cli-${c.id}`);
    rmrf(o);
    const r = run(c, ["--pretty", "false", "-p", "tsconfig.json", "--sourceMap", "--declarationMap", "--outDir", o], CLI);
    outs[c.id] = o;
    diags[c.id] = r;
    lists[c.id] = norm(run(c, ["-p", "tsconfig.typecheck.json", "--listFilesOnly"], CLI).stdout).split("\n").filter((l) => !l.includes("node_modules/typescript/lib") && !l.includes("/lib/lib.") && !l.includes("typescript-6/lib") && !l.includes("typescript-71beta/lib") && !l.includes("tsc-rs/") && !l.includes("native-preview")).sort();
  }
  for (const ref of refs) for (const c of available) {
    if (c.id === ref) continue;
    repo.diag[`${c.id} vs ${ref}`] = { ...cmpDiags(diags[ref].stdout, diags[c.id].stdout), exitRef: diags[ref].exit, exitOther: diags[c.id].exit };
    const A = new Set(lists[ref]), B = new Set(lists[c.id]);
    repo.listFiles[`${c.id} vs ${ref}`] = { refFiles: A.size, otherFiles: B.size, onlyInRef: [...A].filter((x) => !B.has(x)).slice(0, 5), onlyInOther: [...B].filter((x) => !A.has(x)).slice(0, 5) };
    const t = cmpTrees(outs[ref], outs[c.id]);
    t.firstDiffs = t.sampleDiffs.slice(0, 2).map((f) => ({ file: f, ...firstDiff(path.join(outs[ref], f), path.join(outs[c.id], f)) }));
    repo.emit[`${c.id} vs ${ref}`] = t;
  }
  cases.push(repo);

  // 2. fixtures with deliberate errors / advanced features
  for (const fx of ["errors-basic", "generics-advanced", "decorators-legacy", "decorators-standard", "module-resolution"]) {
    const dir = path.join(HERE, "fixtures", fx);
    const rec = { name: `fixture:${fx}`, diag: {}, emit: {} };
    const o = {}, d = {};
    for (const c of available) {
      o[c.id] = path.join(TMP, `corr-${fx}-${c.id}`);
      rmrf(o[c.id]);
      d[c.id] = run(c, ["--pretty", "false", "-p", dir, "--outDir", o[c.id]], dir);
    }
    for (const ref of refs) for (const c of available) {
      if (c.id === ref) continue;
      rec.diag[`${c.id} vs ${ref}`] = { ...cmpDiags(d[ref].stdout, d[c.id].stdout), exitRef: d[ref].exit, exitOther: d[c.id].exit };
      if (walk(o[ref]).length || walk(o[c.id]).length) rec.emit[`${c.id} vs ${ref}`] = cmpTrees(o[ref], o[c.id]);
    }
    rec.refDiagnosticCount = diagLines(d.tsc.stdout).length;
    cases.push(rec);
  }

  // 3. project references (tsc -b)
  {
    const rec = { name: "fixture:project-refs (tsc -b)", diag: {}, emit: {}, incremental: {} };
    const o = {}, d = {};
    for (const c of available) {
      const work = path.join(TMP, `corr-refs-${c.id}`);
      rmrf(work);
      fs.cpSync(path.join(HERE, "fixtures/project-refs"), work, { recursive: true });
      d[c.id] = run(c, ["-b", "--pretty", "false", "app"], work);
      const again = run(c, ["-b", "--pretty", "false", "-v", "app"], work);
      rec.incremental[c.id] = { secondRunSaysUpToDate: /up to date|is up to date/i.test(again.stdout), exit: again.exit };
      o[c.id] = work;
    }
    for (const ref of refs) for (const c of available) {
      if (c.id === ref) continue;
      rec.diag[`${c.id} vs ${ref}`] = { ...cmpDiags(d[ref].stdout, d[c.id].stdout), exitRef: d[ref].exit, exitOther: d[c.id].exit };
      const strip = (w) => { const t = path.join(TMP, `strip-${path.basename(w)}`); rmrf(t); fs.mkdirSync(t); for (const p of ["core/out", "app/out"]) if (fs.existsSync(path.join(w, p))) fs.cpSync(path.join(w, p), path.join(t, p), { recursive: true }); return t; };
      rec.emit[`${c.id} vs ${ref}`] = cmpTrees(strip(o[ref]), strip(o[c.id]));
    }
    rec.refDiagnosticCount = diagLines(d.tsc.stdout).length;
    cases.push(rec);
  }
  results.correctness = { references: refs, cases };
  save();
}

// ---- report ---------------------------------------------------------------------------------------------
const f2 = (x) => (x == null ? "n/a" : x.toFixed(2));
function renderMd() {
  const L = [];
  L.push(`# TypeScript compiler benchmark (generated)\n`);
  L.push(`Platform ${env.platform} (${env.cpu}, ${env.logicalCores} cores, ${env.memGB} GB), ${env.node}, Flisk ${env.flisk.commit.slice(0, 8)}, ${env.runs} runs + 1 cold run each, ${env.date}\n`);
  L.push("| compiler | version |\n|---|---|");
  for (const c of available) L.push(`| ${c.id} | ${env.versions[c.id]?.version} |`);
  for (const [sid, s] of Object.entries(results.perf)) {
    if (sid === "incremental") continue;
    L.push(`\n### ${sid}\n${s.desc}\n`);
    L.push("| compiler | cold s | min s | median s | max s | CPU util | peak RSS MB (median) | output |\n|---|---:|---:|---:|---:|---:|---:|---|");
    for (const [id, v] of Object.entries(s.byCompiler)) {
      if (!v.ok) { L.push(`| ${id} | FAILED | | | | | | ${String(v.failure).split("\n")[0].slice(0, 80)} |`); continue; }
      const w = v.warm.wallS;
      L.push(`| ${id} | ${f2(v.cold?.wallS)} | ${f2(w?.min)} | ${f2(w?.median)} | ${f2(w?.max)} | ${f2(v.warm.cpuUtil?.median)} | ${f2(v.warm.rssMB?.median)} | ${v.outBytes != null ? `${(v.outBytes / 1e6).toFixed(2)} MB / ${v.outFiles} files` : ""} |`);
    }
  }
  const inc = results.perf.incremental;
  if (inc) {
    L.push(`\n### incremental\n${inc.desc}\n`);
    L.push("| compiler | cold med s | no-change med s | 1-file edit med s | RSS MB (edit) | failed runs (cold/no-change/edit) | files rewritten: no-change / edit (of total) |\n|---|---:|---:|---:|---:|---|---|");
    for (const [id, v] of Object.entries(inc.byCompiler)) {
      const bad = v.cold.failures + v.nochange.failures + v.edit.failures;
      const m = (x, f) => (f ? `FAILED (${f}/${env.runs})` : f2(x));
      L.push(`| ${id}${bad ? " ⚠️" : ""} | ${m(v.cold.wallS?.median, v.cold.failures)} | ${m(v.nochange.wallS?.median, v.nochange.failures)} | ${m(v.edit.wallS?.median, v.edit.failures)} | ${f2(v.edit.rssMB?.median)} | ${v.cold.failures}/${v.nochange.failures}/${v.edit.failures} | ${v.behaviour?.filesRewrittenOnNoChange} / ${v.behaviour?.filesRewrittenOnOneFileEdit} (of ${v.behaviour?.totalOutputFiles}) |`);
    }
  }
  if (results.correctness?.cases) {
    L.push("\n### correctness vs tsc 7.0.2 and vs tsc 7.1.0-beta\n");
    L.push("| case | compiler vs ref | diag identical text | missing | additional | emit identical / ref files | emit differ | missing files | extra files |\n|---|---|:-:|---:|---:|---|---:|---:|---:|");
    for (const cs of results.correctness.cases) {
      for (const [k, d] of Object.entries(cs.diag)) {
        const e = cs.emit?.[k];
        L.push(`| ${cs.name} | ${k} | ${d.identicalText ? "yes" : "NO"} (${d.refCount} ref) | ${d.missing.length} | ${d.additional.length} | ${e ? `${e.identical}/${e.refFiles}` : "-"} | ${e?.differ ?? "-"} | ${e?.missing ?? "-"} | ${e?.extra ?? "-"} |`);
      }
    }
  }
  return `${L.join("\n")}\n`;
}

// ---- main -----------------------------------------------------------------------------------------------
try {
  if (ONLY.has("perf")) perf();
  if (ONLY.has("correctness")) correctness();
} finally {
  save();
  fs.writeFileSync(path.join(OUT, "report.md"), renderMd());
  rmrf(TMP);
  console.log(`\nWrote ${OUT}/results.json and report.md`);
}
