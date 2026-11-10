// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanEnv,
  createTempDir,
  fliskBin,
  freePort,
  parseEnvelope,
  runFlisk,
} from "../../test-support/index.js";

const FIXTURE = join(__dirname, "../../../../tests/fixtures/unopinionated");

/** A local-process project plus a `docker` that records every call, so the tests prove no build started. */
async function project(
  root: string,
): Promise<{ dir: string; env: Record<string, string>; calls: string }> {
  const dir = join(root, "app");
  cpSync(FIXTURE, dir, { recursive: true });
  for (const service of ["api", "web"]) {
    const file = join(dir, service, "service.json");
    writeFileSync(
      file,
      JSON.stringify({ ...JSON.parse(readFileSync(file, "utf-8")), port: await freePort() }),
    );
  }
  const bin = join(root, "bin");
  mkdirSync(bin);
  const calls = join(root, "docker-calls.log");
  writeFileSync(join(bin, "docker"), `#!/bin/sh\necho "docker $*" >> "${calls}"\nexit 1\n`);
  chmodSync(join(bin, "docker"), 0o755);
  const path = `${bin}:${process.env.PATH ?? ""}`;
  return { dir, calls, env: { PATH: path, HOME: root } };
}

const running: ChildProcess[] = [];
afterEach(() => {
  for (const child of running.splice(0)) if (child.exitCode === null) child.kill("SIGTERM");
});

describe("flisk up disk guard (cycles 1 and 2)", () => {
  it("fails fast below the hard threshold with the cleanup command, before any process starts", async () => {
    const root = createTempDir("flisk-disk-guard-");
    const { dir, env, calls } = await project(root);
    const run = runFlisk(["up", "--json"], {
      cwd: dir,
      env: { ...env, FLISK_DISK_MIN_GIB: "99999999" },
      timeout: 30_000,
    });
    expect(run.status).toBe(1);
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data).toMatchObject({ ok: false });
    expect(envelope.errors[0]).toMatchObject({ code: "DISK_SPACE_LOW" });
    expect(envelope.errors[0].message).toMatch(/GiB free/);
    expect(envelope.errors[0].message).toMatch(/needs at least 99999999 GiB/);
    expect((envelope.errors[0] as { suggestions?: string[] }).suggestions?.join("\n")).toContain(
      "docker builder prune -f",
    );
    expect(existsSync(join(dir, ".flisk", "native"))).toBe(false);
    expect(existsSync(calls)).toBe(false);
  }, 60_000);

  it("prints the same failure without --json", async () => {
    const root = createTempDir("flisk-disk-guard-");
    const { dir, env } = await project(root);
    const run = runFlisk(["up"], {
      cwd: dir,
      env: { ...env, FLISK_DISK_MIN_GIB: "99999999" },
      timeout: 30_000,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("docker builder prune -f");
  }, 60_000);

  it("warns, keeps going and carries the warning in the --json result", async () => {
    const root = createTempDir("flisk-disk-guard-");
    const { dir, env } = await project(root);
    const fullEnv = { ...env, FLISK_DISK_MIN_GIB: "0", FLISK_DISK_WARN_GIB: "99999999" };
    const child = spawn(process.execPath, [fliskBin, "up", "--json"], {
      cwd: dir,
      env: cleanEnv({ NO_COLOR: "1", ...fullEnv }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    running.push(child);
    const line = await new Promise<string>((resolve, reject) => {
      let out = "";
      const timer = setTimeout(() => reject(new Error("no result")), 45_000);
      child.stdout?.on("data", (chunk) => {
        out += chunk;
        if (out.includes("\n")) {
          clearTimeout(timer);
          resolve(out.split("\n")[0] as string);
        }
      });
    });
    const up = parseEnvelope(line);
    expect(up.data).toMatchObject({ ok: true, runtime: "native" });
    expect(up.data.diskWarning).toMatchObject({
      level: "warn",
      failBelowGib: 0,
      warnBelowGib: 99999999,
      fix: expect.stringContaining("docker builder prune -f"),
    });
    runFlisk(["down", "--json"], { cwd: dir, env: fullEnv });
  }, 90_000);
});
