// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanEnv,
  createTempDir,
  fliskBin,
  parseEnvelope,
  runFlisk,
} from "../../test-support/index.js";
import { localUrl } from "../../utils/native-runtime.js";

const FIXTURE = join(__dirname, "../../../../tests/fixtures/unopinionated");

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/**
 * A PATH with node and nothing else that Flisk could use, plus `docker` and `tilt` that fail like a stopped daemon and record
 * every call. The services run, and the record proves Flisk never asked Docker or Tilt for anything.
 */
function machineWithoutDocker(root: string): { env: Record<string, string>; calls: string } {
  const bin = join(root, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));
  const calls = join(root, "docker-and-tilt-calls.log");
  for (const tool of ["docker", "tilt", "colima"]) {
    writeFileSync(
      join(bin, tool),
      `#!/bin/sh\necho "${tool} $*" >> "${calls}"\necho "Cannot connect to the Docker daemon" >&2\nexit 1\n`,
    );
    chmodSync(join(bin, tool), 0o755);
  }
  return {
    env: { PATH: bin, DOCKER_HOST: "unix:///nonexistent/docker.sock", HOME: root },
    calls,
  };
}

/** A copy of the fixture with ports the OS handed out, so parallel test workers never collide. */
async function nativeProject(
  root: string,
): Promise<{ dir: string; apiPort: number; webPort: number }> {
  const dir = join(root, "app");
  cpSync(FIXTURE, dir, { recursive: true });
  const [apiPort, webPort] = [await freePort(), await freePort()];
  for (const [service, port] of [
    ["api", apiPort],
    ["web", webPort],
  ] as const) {
    const file = join(dir, service, "service.json");
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf-8")), port }));
  }
  return { dir, apiPort, webPort };
}

const running: ChildProcess[] = [];
afterEach(() => {
  for (const child of running.splice(0)) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
});

/** Starts `flisk up --json` and resolves with its single stdout line once the stack is up (or failed). */
function startUp(
  cwd: string,
  env: Record<string, string>,
): Promise<{ child: ChildProcess; line: string }> {
  const child = spawn(process.execPath, [fliskBin, "up", "--json"], {
    cwd,
    env: cleanEnv({ NO_COLOR: "1", ...env }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.push(child);
  let stdout = "";
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`flisk up did not report in time\nstderr:\n${stderr}`)),
      45_000,
    );
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("\n")) {
        clearTimeout(timer);
        resolve({ child, line: stdout.split("\n")[0] as string });
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!stdout) reject(new Error(`flisk up exited ${code} without output\nstderr:\n${stderr}`));
    });
  });
}

function exitOf(child: ChildProcess): Promise<number | null> {
  return child.exitCode !== null
    ? Promise.resolve(child.exitCode)
    : new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

describe("flisk up with local processes (no Docker, no Tilt)", () => {
  it("starts an API and a website that calls it, and flisk down stops both", async () => {
    const root = createTempDir("flisk-native-e2e-");
    const machine = machineWithoutDocker(root);
    const { dir, apiPort, webPort } = await nativeProject(root);
    // The website reads the API port from ${API_PORT} in its env, which the shell provides here.
    const env = { ...machine.env, API_PORT: String(apiPort) };

    // Before the first `flisk up` there is no .flisk/project.json; doctor already checks only what the services need.
    const firstDoctor = runFlisk(["doctor", "--json", "--no-ping"], { cwd: dir, env });
    expect(parseEnvelope(firstDoctor.stdout).data).toMatchObject({ ready: true, inProject: true });
    expect(existsSync(join(dir, ".flisk"))).toBe(false);

    const { child, line } = await startUp(dir, env);
    const up = parseEnvelope(line);
    expect(up.errors).toEqual([]);
    expect(up.data).toMatchObject({
      ok: true,
      runtime: "native",
      services: ["unopinionated-api", "unopinionated-web"],
      urls: { "unopinionated-api": localUrl(apiPort), "unopinionated-web": localUrl(webPort) },
    });

    const page = await (await fetch(localUrl(webPort))).text();
    expect(page).toContain("hello from the api");

    const status = parseEnvelope(runFlisk(["status", "--json"], { cwd: dir, env }).stdout);
    expect(status.data.runtime).toBe("native");
    // What the MCP up tool tells agents to poll.
    expect(status.data.tilt.readiness.ready).toBe(true);
    expect(
      status.data.resources.map((r: { name: string; status: string }) => [r.name, r.status]),
    ).toEqual([
      ["unopinionated-api", "ready"],
      ["unopinionated-web", "ready"],
    ]);

    const doctorRun = runFlisk(["doctor", "--json"], { cwd: dir, env });
    const doctor = parseEnvelope(doctorRun.stdout);
    expect(doctor.data.ready, JSON.stringify(doctor.data.checks, null, 2)).toBe(true);
    expect(doctorRun.status).toBe(0);
    const checkNames = doctor.data.checks.map((check: { name: string }) => check.name).join(" ");
    expect(checkNames).not.toMatch(/Docker|Tilt|Compose|Colima|Bun/);
    expect(checkNames).toContain("Service commands");

    const logs = parseEnvelope(runFlisk(["logs", "--json"], { cwd: dir, env }).stdout);
    expect(logs.data.lines.map((l: { resource: string; text: string }) => l.text)).toEqual(
      expect.arrayContaining([
        `api listening on port ${apiPort}`,
        `website listening on port ${webPort}`,
      ]),
    );

    const down = runFlisk(["down", "--json"], { cwd: dir, env });
    expect(parseEnvelope(down.stdout).data).toEqual({
      ok: true,
      runtime: "native",
      stopped: ["unopinionated-api", "unopinionated-web"],
    });
    expect(await exitOf(child)).toBe(0);
    await expect(fetch(localUrl(webPort))).rejects.toThrow();
    await expect(fetch(localUrl(apiPort))).rejects.toThrow();

    // Docker and Tilt were never called, and Flisk wrote no framework, build or proxy files.
    expect(existsSync(machine.calls)).toBe(false);
    expect(readdirSync(dir).sort()).toEqual([".flisk", "api", "web"]);
    expect(readdirSync(join(dir, ".flisk")).sort()).toEqual(["native", "project.json"]);
    expect(readdirSync(join(dir, "api")).sort()).toEqual(["server.js", "service.json"]);
    expect(readdirSync(join(dir, "web")).sort()).toEqual(["server.js", "service.json"]);
  }, 90_000);

  it("refuses to mix local processes with Docker services, before calling Docker", async () => {
    const root = createTempDir("flisk-native-e2e-");
    const machine = machineWithoutDocker(root);
    const { dir } = await nativeProject(root);
    mkdirSync(join(dir, ".flisk"));
    writeFileSync(join(dir, ".flisk", "project.json"), "{}");
    mkdirSync(join(dir, "db"));
    writeFileSync(
      join(dir, "db", "service.json"),
      JSON.stringify({
        appName: "db",
        appType: "backend",
        stack: "shop",
        schemaVersion: 1,
        port: 4400,
      }),
    );

    const result = runFlisk(["up", "--json"], { cwd: dir, env: machine.env });
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors).toEqual([
      expect.objectContaining({
        code: "MIXED_RUNTIME",
        message: expect.stringContaining("(unopinionated-api, unopinionated-web)"),
      }),
    ]);
    expect(existsSync(machine.calls)).toBe(false);
  });

  it("keeps the Docker + Tilt path for a project without command services", () => {
    const root = createTempDir("flisk-native-e2e-");
    const machine = machineWithoutDocker(root);
    const dir = join(root, "classic");
    mkdirSync(join(dir, ".flisk"), { recursive: true });
    writeFileSync(join(dir, ".flisk", "project.json"), "{}");
    mkdirSync(join(dir, "services", "shop", "api"), { recursive: true });
    writeFileSync(
      join(dir, "services", "shop", "api", "service.json"),
      JSON.stringify({
        appName: "api",
        appType: "backend",
        stack: "shop",
        schemaVersion: 1,
        port: 4400,
      }),
    );

    const result = runFlisk(["up", "--json"], { cwd: dir, env: machine.env });
    expect(result.status).toBe(1);
    // The machine preflight asked Docker, as it always has, and stopped there.
    expect(readFileSync(machine.calls, "utf-8")).toMatch(/^docker /m);
    expect(result.stderr).toMatch(/docker/i);
    expect(parseEnvelope(result.stdout).data).not.toHaveProperty("runtime");
  });
});
