#!/usr/bin/env bun
// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
/**
 * Container scale benchmark / release gate.
 *
 * Starts N real ERP service containers (images built by `flisk up` in the ERP
 * project) for each tier, measures time-to-healthy, crashes, memory, CPU and
 * Docker responsiveness, tears them down, and gates on the north star:
 * 100 services on a 16 GB machine.
 *
 *   bun scripts/benchmark/container-scale.ts                    # 5,10,20,50,80,100
 *   bun scripts/benchmark/container-scale.ts --tiers 5,10 --gate 10
 *   bun scripts/benchmark/container-scale.ts --legacy-healthcheck   # 10s probes, for comparison
 *
 * Exit code 1 when the gate tier fails.
 */
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const PREFIX = "tdkbench-";

interface Options {
  mode: "compose" | "synthetic";
  project: string;
  tiers: number[];
  gate: number;
  timeoutSeconds: number;
  interval: number;
  startInterval: number;
  settleSeconds: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const legacy = args.includes("--legacy-healthcheck");
  const tiers = get("--tiers", "5,10,20,50,80,100").split(",").map(Number).filter((n) => n > 0);
  return {
    mode: args.includes("--synthetic") ? "synthetic" : "compose",
    project: resolve(get("--project", process.env.TDK_BENCH_PROJECT ?? join(REPO_ROOT, "..", "tdk-erp-system"))),
    tiers,
    gate: Number(get("--gate", String(Math.max(...tiers)))),
    timeoutSeconds: Number(get("--timeout", "240")),
    interval: legacy ? 10 : Number(get("--interval", "30")),
    startInterval: legacy ? 0 : Number(get("--start-interval", "2")),
    settleSeconds: Number(get("--settle", "15")),
  };
}

function sh(command: string, timeoutMs = 120_000): string {
  return execSync(command, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }).trim();
}

function composeOk(args: string[], timeoutMs = 120_000): string {
  try {
    return execFileSync("docker", ["compose", ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }).trim();
  } catch {
    return "";
  }
}

function shOk(command: string, timeoutMs = 120_000): string {
  try {
    return sh(command, timeoutMs);
  } catch {
    return "";
  }
}

interface Service {
  name: string;
  stack: string;
  image: string;
  port: number;
  isFrontend: boolean;
  singleProcess: boolean;
  imageMiB: number;
}

function discoverServices(project: string): Service[] {
  const images = new Set(shOk("docker images --format '{{.Repository}}:{{.Tag}}'").split("\n"));
  const services: Service[] = [];
  const manifests = [...new Bun.Glob("services/*/*/service.json").scanSync({ cwd: project })].sort();
  for (const relative of manifests) {
    const manifestPath = join(project, relative);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const name = basename(dirname(manifestPath));
    const stack = manifest.stack ?? basename(dirname(dirname(manifestPath)));
    const image = `${projectName(project)}_${stack}_${name}:dev`;
    if (!images.has(image)) continue;
    const [cmd, bytes] = shOk(`docker image inspect ${image} --format '{{json .Config.Cmd}}|{{.Size}}'`).split("|");
    services.push({
      name,
      stack,
      image,
      port: Number(manifest.port ?? 4000),
      isFrontend: manifest.appType === "frontend",
      singleProcess: !(cmd ?? "").includes('"run","start"'),
      imageMiB: Math.round(Number(bytes ?? 0) / 1048576),
    });
  }
  return services;
}

function dbPassword(project: string): string {
  const envPath = join(project, ".env");
  if (!existsSync(envPath)) return "";
  const line = readFileSync(envPath, "utf-8").split("\n").find((l) => l.startsWith("DB_PASSWORD="));
  return line ? line.slice("DB_PASSWORD=".length).trim() : "";
}

// Single-quotes a value for `sh -c`, so paths and passwords are passed through unchanged.
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// The project name as written in .tdk/project.json (hyphens kept): the Compose project and container names use it.
function rawProjectName(project: string): string {
  const pj = join(project, ".tdk", "project.json");
  return String(existsSync(pj) ? JSON.parse(readFileSync(pj, "utf-8")).project?.name : basename(project));
}

function projectName(project: string): string {
  const name = rawProjectName(project).replace(/-/g, "_");
  // The name is interpolated into docker commands and container names, so keep it to plain identifiers.
  if (!/^[A-Za-z0-9][A-Za-z0-9_]*$/.test(name)) throw new Error(`unsupported project name for benchmark: ${JSON.stringify(name)}`);
  return name;
}

function toMiB(raw: string): number {
  const n = Number.parseFloat(raw);
  if (/GiB$/.test(raw)) return n * 1024;
  if (/KiB$/.test(raw)) return n / 1024;
  if (/MiB$/.test(raw)) return n;
  if (/[0-9]B$/.test(raw)) return n / 1048576;
  return n;
}

function timed<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const value = fn();
  return [value, Math.round(performance.now() - start)];
}

function hostLoad(): number {
  return Number.parseFloat(shOk("sysctl -n vm.loadavg").replace(/[{}]/g, "").trim().split(/\s+/)[0] ?? "0");
}

function hostFreeMiB(): number {
  const out = shOk("vm_stat");
  const page = Number(out.match(/page size of (\d+)/)?.[1] ?? 16384);
  // vm_stat lines look like "Pages free:    12345."; match the label as plain text, not as a RegExp.
  const pages = (key: string) => {
    const line = out.split("\n").find((l) => l.startsWith(`${key}:`));
    return Number(line?.slice(key.length + 1).match(/\d+/)?.[0] ?? 0);
  };
  return Math.round(((pages("Pages free") + pages("Pages speculative")) * page) / 1048576);
}

function removeBenchContainers(): void {
  const ids = shOk(`docker ps -aq --filter name=${PREFIX}`).split("\n").filter(Boolean);
  if (ids.length) shOk(`docker rm -f ${ids.join(" ")}`, 300_000);
}

interface TierResult {
  tier: number;
  launchSeconds: number;
  firstHealthySeconds: number | null;
  allHealthySeconds: number | null;
  healthy: number;
  unhealthy: number;
  starting: number;
  crashed: number;
  oomKilled: number;
  crashes: { name: string; exitCode: string; oom: boolean; lastLog: string }[];
  totalMemMiB: number;
  avgMemMiB: number;
  totalCpuPct: number;
  dockerPsMs: number;
  requestMsP50: number | null;
  loadAvg1m: number;
  hostFreeMiB: number;
  singleProcessShare: number;
}

function runTier(n: number, services: Service[], opts: Options, network: string, password: string, project: string): TierResult {
  removeBenchContainers();
  const picked = Array.from({ length: n }, (_, i) => ({ svc: services[i % services.length], name: `${PREFIX}${i}` }));
  const healthFlags = (probe: string) =>
    [
      `--health-cmd '${probe}'`,
      `--health-interval ${opts.interval}s`,
      opts.startInterval > 0 ? `--health-start-interval ${opts.startInterval}s` : "",
      "--health-timeout 5s --health-start-period 30s --health-retries 3",
    ].join(" ");

  const t0 = performance.now();
  for (const { svc, name } of picked) {
    const probe = svc.isFrontend ? "curl -fs http://localhost/ || exit 1" : `curl -fs http://localhost:${svc.port}/health || exit 1`;
    const env = svc.isFrontend
      ? ""
      : ["PORT=" + svc.port, "NODE_ENV=development", `DATABASE_URL=postgresql://${project}:${password}@${project}_postgres:5432/${project}_${svc.stack}`, `TILT_DATABASE_URL=postgresql://${project}:${password}@${project}_postgres:5432/${project}_${svc.stack}`, "AUTO_MIGRATE=false"]
          .map((kv) => `-e ${shQuote(kv)}`)
          .join(" ");
    const res = spawnSync(
      "sh",
      ["-c", `docker run -d --name ${name} --init --memory 512m --cpus 0.5 --network ${network} ${env} ${healthFlags(probe)} ${svc.image}`],
      { encoding: "utf-8" },
    );
    if (res.status !== 0) console.error(`  ! ${name} (${svc.name}) failed to start: ${res.stderr.trim().split("\n").pop()}`);
  }
  const launchSeconds = (performance.now() - t0) / 1000;

  let firstHealthy: number | null = null;
  let allHealthy: number | null = null;
  const deadline = t0 + opts.timeoutSeconds * 1000;
  let states: string[] = [];
  while (performance.now() < deadline) {
    states = shOk(`docker ps -a --filter name=${PREFIX} --format '{{.Status}}'`, 60_000).split("\n").filter(Boolean);
    const healthyCount = states.filter((s) => s.includes("(healthy)")).length;
    const elapsed = (performance.now() - t0) / 1000;
    if (healthyCount > 0 && firstHealthy === null) firstHealthy = elapsed;
    if (healthyCount === n) {
      allHealthy = elapsed;
      break;
    }
    if (states.length === n && states.every((s) => !s.includes("health: starting") && !s.startsWith("Created"))) break;
    Bun.sleepSync(1000);
  }

  Bun.sleepSync(opts.settleSeconds * 1000);
  states = shOk(`docker ps -a --filter name=${PREFIX} --format '{{.Names}}\t{{.Status}}'`, 60_000).split("\n").filter(Boolean);
  const exitedNames = states.filter((s) => /\tExited|\tRestarting|\tDead/.test(s)).map((s) => s.split("\t")[0]);
  const crashes = exitedNames.map((name) => {
    const inspect = shOk(`docker inspect ${name} --format '{{.State.ExitCode}}|{{.State.OOMKilled}}'`).split("|");
    const lastLog = shOk(`docker logs --tail 3 ${name} 2>&1`).split("\n").filter(Boolean).pop() ?? "";
    const svc = picked.find((p) => p.name === name)?.svc.name ?? name;
    return { name: `${name} (${svc})`, exitCode: inspect[0] ?? "?", oom: inspect[1] === "true", lastLog: lastLog.slice(0, 160) };
  });

  const stats = shOk(`docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' $(docker ps -q --filter name=${PREFIX})`, 180_000)
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    .map(([, cpu, mem]) => ({ cpu: Number.parseFloat(cpu ?? "0"), mem: toMiB(mem ?? "0") }));
  const totalMem = stats.reduce((a, s) => a + s.mem, 0);
  const [, dockerPsMs] = timed(() => shOk("docker ps -q", 60_000));

  const running = picked.filter((p) => !exitedNames.includes(p.name)).slice(0, 10);
  const latencies = running
    .map(({ svc, name }) => {
      const url = svc.isFrontend ? "http://localhost/" : `http://localhost:${svc.port}/health`;
      const out = shOk(`docker exec ${name} curl -s -o /dev/null -w '%{http_code} %{time_total}' ${url}`, 30_000).split(" ");
      return out[0] === "200" ? Number.parseFloat(out[1] ?? "0") * 1000 : null;
    })
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const result: TierResult = {
    tier: n,
    launchSeconds: round(launchSeconds),
    firstHealthySeconds: firstHealthy === null ? null : round(firstHealthy),
    allHealthySeconds: allHealthy === null ? null : round(allHealthy),
    healthy: states.filter((s) => s.includes("(healthy)")).length,
    unhealthy: states.filter((s) => s.includes("(unhealthy)")).length,
    starting: states.filter((s) => s.includes("health: starting")).length,
    crashed: crashes.length,
    oomKilled: crashes.filter((c) => c.oom).length,
    crashes,
    totalMemMiB: Math.round(totalMem),
    avgMemMiB: stats.length ? round(totalMem / stats.length) : 0,
    totalCpuPct: round(stats.reduce((a, s) => a + s.cpu, 0)),
    dockerPsMs,
    requestMsP50: latencies.length ? round(latencies[Math.floor(latencies.length / 2)]) : null,
    loadAvg1m: hostLoad(),
    hostFreeMiB: hostFreeMiB(),
    singleProcessShare: round(picked.filter((p) => p.svc.singleProcess).length / n),
  };
  removeBenchContainers();
  return result;
}

// ---- compose mode: start services exactly like Tilt (generated compose, real infra, Traefik) ----

function ensureExternalNetworks(composeArgs: string[]): void {
  const config = composeOk([...composeArgs, "config", "--format", "json"], 120_000);
  if (!config) return;
  for (const net of Object.values(JSON.parse(config).networks ?? {}) as { name?: string; external?: boolean }[]) {
    if (net.external && net.name && !shOk(`docker network inspect ${net.name} --format '{{.Name}}'`)) shOk(`docker network create ${net.name}`);
  }
}

function startInfra(project: string, root: string): string[] {
  const started: string[] = [];
  const envFile = join(root, ".env");
  const infra = [
    { container: `${project}_postgres`, file: join(root, "services", "platform", "database-management", "docker-compose.yml") },
    { container: `${project}_traefik`, file: join(root, ".tdk", ".tdk-out", "docker-compose.traefik.yml") },
  ];
  for (const { container, file } of infra) {
    if (shOk(`docker ps -q --filter name=^${container}$`)) continue;
    if (shOk(`docker ps -aq --filter name=^${container}$`)) shOk(`docker start ${container}`);
    else {
      const args = ["-f", file, "--env-file", envFile];
      ensureExternalNetworks(args);
      composeOk([...args, "up", "-d"], 300_000);
    }
    started.push(container);
  }
  for (let i = 0; i < 60 && !shOk(`docker exec ${project}_postgres pg_isready -U ${project}`); i++) Bun.sleepSync(1000);
  return started;
}

function composeArgs(root: string, stack: string): string[] {
  const composeFile = join(root, "services", stack, ".autogenerated", "docker-compose.app.autogenerated.yml");
  return ["-p", `${rawProjectName(root)}-${stack}-autogenerated`, "-f", composeFile, "--env-file", join(root, ".env")];
}

function routeRequest(container: string): { code: string; ms: number } | null {
  const labels = JSON.parse(shOk(`docker inspect ${container} --format '{{json .Config.Labels}}'`) || "{}") as Record<string, string>;
  const ruleKey = Object.keys(labels).find((k) => /^traefik\.http\.routers\.[^.]+\.rule$/.test(k));
  if (!ruleKey) return null;
  const rule = labels[ruleKey] ?? "";
  const host = rule.match(/Host\(`([^`]+)`\)/)?.[1];
  const prefix = rule.match(/PathPrefix\(`([^`]+)`\)/)?.[1] ?? "";
  const healthKey = Object.keys(labels).find((k) => k.endsWith(".loadbalancer.healthcheck.path"));
  const path = `${prefix.replace(/\/$/, "")}${healthKey ? labels[healthKey] : "/"}`;
  if (!host) return null;
  const out = shOk(`curl -s -o /dev/null -m 10 -w '%{http_code} %{time_total}' -H 'Host: ${host}' 'http://127.0.0.1:80${path}'`, 20_000).split(" ");
  return { code: out[0] ?? "000", ms: round(Number.parseFloat(out[1] ?? "0") * 1000) };
}

function runTierCompose(n: number, services: Service[], opts: Options, project: string): TierResult & { routed: Record<string, number>; restarts: number } {
  const picked = services.slice(0, Math.min(n, services.length));
  const byStack = new Map<string, string[]>();
  for (const svc of picked) byStack.set(svc.stack, [...(byStack.get(svc.stack) ?? []), svc.name]);
  for (const stack of byStack.keys()) {
    shOk(`docker exec ${project}_postgres createdb -U ${project} -O ${project} ${project}_${stack}`);
    ensureExternalNetworks(composeArgs(opts.project, stack));
  }
  const names = picked.map((svc) => `${rawProjectName(opts.project)}-${svc.stack}-autogenerated-${svc.name}-1`);

  // Launch every stack's `compose up` in parallel, same as Tilt does across resources.
  // NOTE: do not use Bun.spawn() + a Bun.sleepSync() poll loop here - sleepSync blocks
  // Bun's event loop, so a spawned child's exit is never observed and the poll spins
  // forever even after the real process has finished. Shelling out one blocking
  // spawnSync (with the stack commands backgrounded and `wait`ed inside the shell)
  // avoids that: the parent shell, not our JS, is what waits for real completion.
  // Paths travel as environment variables ("$TDK_BENCH_P0" ...), never spliced into the script text.
  const launchEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  const launchScript = [...byStack]
    .map(([stack, svcs], i) => {
      const [, name, , file, , envFile] = composeArgs(opts.project, stack);
      launchEnv[`TDK_BENCH_N${i}`] = name ?? "";
      launchEnv[`TDK_BENCH_F${i}`] = file ?? "";
      launchEnv[`TDK_BENCH_E${i}`] = envFile ?? "";
      return `docker compose -p "$TDK_BENCH_N${i}" -f "$TDK_BENCH_F${i}" --env-file "$TDK_BENCH_E${i}" up -d --no-build ${svcs.join(" ")} &`;
    })
    .join("\n") + "\nwait\n";
  const t0 = performance.now();
  const launch = spawnSync("sh", ["-c", launchScript], { encoding: "utf-8", env: launchEnv, timeout: opts.timeoutSeconds * 1000 });
  const launchSeconds = (performance.now() - t0) / 1000;
  if (launch.status !== 0) console.error(`  ! compose up failed (exit ${launch.status}): ${(launch.stderr ?? "").slice(0, 500)}`);

  const status = () => {
    const rows = shOk(`docker ps -a --format '{{.Names}}\t{{.Status}}'`, 60_000).split("\n").map((l) => l.split("\t"));
    return new Map(rows.filter(([name]) => names.includes(name ?? "")).map(([name, st]) => [name ?? "", st ?? ""]));
  };
  let firstHealthy: number | null = null;
  let allHealthy: number | null = null;
  const deadline = t0 + opts.timeoutSeconds * 1000;
  while (performance.now() < deadline) {
    const st = [...status().values()];
    const healthyCount = st.filter((s) => s.includes("(healthy)") || (s.startsWith("Up") && !s.includes("health"))).length;
    const elapsed = (performance.now() - t0) / 1000;
    if (healthyCount > 0 && firstHealthy === null) firstHealthy = elapsed;
    if (healthyCount === picked.length) {
      allHealthy = elapsed;
      break;
    }
    Bun.sleepSync(1000);
  }
  Bun.sleepSync(opts.settleSeconds * 1000);

  const final = status();
  const states = [...final.values()];
  const crashes = [...final]
    .filter(([name, st]) => /^(Exited|Restarting|Dead)/.test(st) || Number(shOk(`docker inspect ${name} --format '{{.RestartCount}}'`)) > 0)
    .map(([name]) => {
      const [exitCode, oom, restarts] = shOk(`docker inspect ${name} --format '{{.State.ExitCode}}|{{.State.OOMKilled}}|{{.RestartCount}}'`).split("|");
      const lastLog = shOk(`docker logs --tail 3 ${name} 2>&1`).split("\n").filter(Boolean).pop() ?? "";
      return { name: `${name} restarts=${restarts}`, exitCode: exitCode ?? "?", oom: oom === "true", lastLog: lastLog.slice(0, 160) };
    });
  const running = [...final].filter(([, st]) => st.startsWith("Up")).map(([name]) => name);
  const stats = shOk(`docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' ${running.join(" ")}`, 180_000)
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    .map(([cpu, mem]) => ({ cpu: Number.parseFloat(cpu ?? "0"), mem: toMiB(mem ?? "0") }));
  const totalMem = stats.reduce((a, x) => a + x.mem, 0);
  const [, dockerPsMs] = timed(() => shOk("docker ps -q", 60_000));

  const routed: Record<string, number> = {};
  const latencies: number[] = [];
  for (const name of running) {
    const r = routeRequest(name);
    const code = r?.code ?? "no-route";
    routed[code] = (routed[code] ?? 0) + 1;
    if (r && r.code === "200") latencies.push(r.ms);
  }
  latencies.sort((a, b) => a - b);

  const result = {
    tier: n,
    launchSeconds: round(launchSeconds),
    firstHealthySeconds: firstHealthy === null ? null : round(firstHealthy),
    allHealthySeconds: allHealthy === null ? null : round(allHealthy),
    healthy: states.filter((st) => st.includes("(healthy)")).length,
    unhealthy: states.filter((st) => st.includes("(unhealthy)")).length,
    starting: states.filter((st) => st.includes("health: starting")).length,
    crashed: crashes.length,
    oomKilled: crashes.filter((c) => c.oom).length,
    crashes,
    totalMemMiB: Math.round(totalMem),
    avgMemMiB: stats.length ? round(totalMem / stats.length) : 0,
    totalCpuPct: round(stats.reduce((a, x) => a + x.cpu, 0)),
    dockerPsMs,
    requestMsP50: latencies.length ? latencies[Math.floor(latencies.length / 2)] ?? null : null,
    loadAvg1m: hostLoad(),
    hostFreeMiB: hostFreeMiB(),
    singleProcessShare: round(picked.filter((svc) => svc.singleProcess).length / picked.length),
    routed,
    restarts: crashes.length,
  };
  for (const [stack, svcs] of byStack) composeOk([...composeArgs(opts.project, stack), "rm", "-sf", ...svcs], 300_000);
  return result;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function main(): void {
  const opts = parseArgs();
  const project = projectName(opts.project);
  const network = `${project}_database`;
  const dockerMemMiB = Math.round(Number(shOk("docker info --format '{{.MemTotal}}'")) / 1048576);
  const hostMemGiB = Math.round(Number(shOk("sysctl -n hw.memsize")) / 1073741824);

  if (shOk("pgrep -f 'tilt up'")) console.warn("⚠ Tilt is running - builds in the background will skew results.");
  shOk(`docker network inspect ${network} || docker network create ${network}`);
  const startedInfra = opts.mode === "compose" ? startInfra(project, opts.project) : [];
  if (opts.mode === "synthetic") shOk(`docker start ${project}_postgres`);
  const services = discoverServices(opts.project);
  if (services.length === 0) {
    console.error(`No built ERP images found for ${opts.project}. Run \`flisk up\` there once to build them.`);
    process.exit(2);
  }
  const baselineContainers = shOk("docker ps -q").split("\n").filter(Boolean).length;
  const singleShare = services.filter((s) => s.singleProcess).length / services.length;

  // North star math: 100 services must fit in the Docker VM with ~512 MiB left for infra.
  const imageSizes = (list: Service[]) => {
    const sizes = list.map((s) => s.imageMiB).sort((a, b) => a - b);
    return sizes.length ? { count: sizes.length, min: sizes[0], avg: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length), max: sizes[sizes.length - 1] } : null;
  };
  const imageStats = {
    backend: imageSizes(services.filter((s) => !s.isFrontend)),
    frontend: imageSizes(services.filter((s) => s.isFrontend)),
    backendSingleProcess: imageSizes(services.filter((s) => !s.isFrontend && s.singleProcess)),
    backendWrapper: imageSizes(services.filter((s) => !s.isFrontend && !s.singleProcess)),
  };
  const diskUsage = shOk("docker system df --format '{{.Type}} {{.Size}}'").split("\n")[0] ?? "";
  const perServiceBudgetMiB = Math.floor((dockerMemMiB - 512) / 100);
  console.log(`Host ${hostMemGiB} GB, Docker VM ${dockerMemMiB} MiB, ${services.length} distinct ERP images (${Math.round(singleShare * 100)}% single-process CMD), ${baselineContainers} other containers running`);
  console.log(`North star budget: (${dockerMemMiB} - 512 infra) / 100 = ${perServiceBudgetMiB} MiB per service`);
  const fmt = (x: ReturnType<typeof imageSizes>) => (x ? `${x.count} × ${x.min}/${x.avg}/${x.max} MiB (min/avg/max)` : "none");
  console.log(`Images - backend new layers: ${fmt(imageStats.backendSingleProcess)}, backend old layers: ${fmt(imageStats.backendWrapper)}, frontend: ${fmt(imageStats.frontend)}; Docker disk: ${diskUsage}`);
  console.log(`Mode: ${opts.mode === "compose" ? "compose (generated compose files, real Postgres + Traefik, requests routed through Traefik)" : "synthetic (docker run, /health only)"}`);
  console.log(`Healthcheck: interval ${opts.interval}s, start-interval ${opts.startInterval || "off"}\n`);

  const results: TierResult[] = [];
  for (const tier of opts.tiers) {
    process.stdout.write(`▶ tier ${tier}... `);
    const r = opts.mode === "compose" ? runTierCompose(tier, services, opts, project) : runTier(tier, services, opts, network, dbPassword(opts.project), project);
    results.push(r);
    const routed = "routed" in r ? ` | via Traefik: ${JSON.stringify(r.routed)}` : "";
    console.log(`all healthy: ${r.allHealthySeconds ?? "NO"}s, crashed ${r.crashed}, mem ${r.totalMemMiB} MiB, docker ps ${r.dockerPsMs} ms${routed}`);
  }

  const header = "| tier | launch s | 1st healthy s | all healthy s | healthy | unhealthy | starting | crashed | OOM | mem MiB | avg MiB | CPU % | docker ps ms | req p50 ms | load 1m | host free MiB |";
  const rows = results.map(
    (r) =>
      `| ${r.tier} | ${r.launchSeconds} | ${r.firstHealthySeconds ?? "-"} | ${r.allHealthySeconds ?? "TIMEOUT"} | ${r.healthy} | ${r.unhealthy} | ${r.starting} | ${r.crashed} | ${r.oomKilled} | ${r.totalMemMiB} | ${r.avgMemMiB} | ${r.totalCpuPct} | ${r.dockerPsMs} | ${r.requestMsP50 ?? "-"} | ${r.loadAvg1m} | ${r.hostFreeMiB} |`,
  );
  console.log(`\n${header}\n|${"---|".repeat(16)}\n${rows.join("\n")}`);
  for (const r of results.filter((x) => x.crashes.length)) {
    console.log(`\nCrashes at tier ${r.tier}:`);
    for (const c of r.crashes.slice(0, 15)) console.log(`  - ${c.name} exit=${c.exitCode}${c.oom ? " OOMKilled" : ""} :: ${c.lastLog}`);
  }

  const gate = results.find((r) => r.tier === opts.gate);
  const checks = gate
    ? [
        [`all ${gate.tier} healthy within ${opts.timeoutSeconds}s`, gate.allHealthySeconds !== null],
        ["no crashes / OOM kills", gate.crashed === 0],
        [`memory ${gate.totalMemMiB} MiB <= ${perServiceBudgetMiB * gate.tier} MiB budget`, gate.totalMemMiB <= perServiceBudgetMiB * gate.tier],
        [`docker ps ${gate.dockerPsMs} ms < 10000 ms (flisk doctor timeout)`, gate.dockerPsMs < 10_000],
      ]
    : [];
  if (gate && "routed" in gate) {
    const routed = gate.routed as Record<string, number>;
    const total = Object.values(routed).reduce((a, b) => a + b, 0);
    checks.push([`requests through Traefik: ${routed["200"] ?? 0}/${total} returned 200`, (routed["200"] ?? 0) === total]);
  }
  const smallest = results[0];
  console.log(`\nWebsite promise "full boot in under 5 seconds": tier ${smallest?.tier} all healthy in ${smallest?.allHealthySeconds ?? "TIMEOUT"}s (info only)`);
  console.log(`Gate (tier ${opts.gate}):`);
  for (const [label, ok] of checks) console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  const passed = checks.length > 0 && checks.every(([, ok]) => ok);
  for (const container of startedInfra) shOk(`docker stop ${container}`);

  const outDir = join(REPO_ROOT, "benchmarks", "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `container-scale-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    outFile,
    JSON.stringify({ date: new Date().toISOString(), hostMemGiB, dockerMemMiB, perServiceBudgetMiB, options: { ...opts, project: relative(REPO_ROOT, opts.project) }, images: services.length, imageStats, diskUsage, singleProcessImageShare: singleShare, results, gate: { tier: opts.gate, passed } }, null, 2),
  );
  console.log(`\n${passed ? "PASS" : "FAIL"} - results saved to ${outFile}`);
  process.exit(passed ? 0 : 1);
}

main();
