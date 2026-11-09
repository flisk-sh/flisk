// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanEnv,
  createTempDir,
  fliskBin,
  parseEnvelope,
  runFlisk,
} from "../../test-support/index.js";

const running: ChildProcess[] = [];
afterEach(() => {
  for (const child of running.splice(0)) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
});

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
      90_000,
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

describe("flisk up with inferred plain Node project", () => {
  it("starts a plain Node repo as a local process, and flisk down stops it", async () => {
    const root = createTempDir("flisk-inferred-e2e-");
    const dir = join(root, "app");
    mkdirSync(dir);

    // Write the plain Node app files
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "plain-node",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(dir, "bun.lock"), "");
    writeFileSync(
      join(dir, "server.js"),
      `const http = require("node:http");
http.createServer((_q, s) => s.end("ok")).listen(process.env.PORT, () => console.log("listening on " + process.env.PORT));`,
    );

    // Use a custom HOME so state goes under root, not the real home
    const env = { HOME: root };

    // Test --dry-run
    const dry = runFlisk(["up", "--dry-run", "--json"], { cwd: dir, env });
    expect(dry.status).toBe(0);
    const dryParsed = parseEnvelope(dry.stdout);
    expect(dryParsed.data).toMatchObject({
      ok: true,
      dryRun: true,
      runtime: "native",
    });
    expect(dryParsed.data.services).toContain("plain-node");
    // A dry run reports what was inferred (the plan); a real run, status and down report `inferred: true`.
    expect(dryParsed.data.inferred).toMatchObject({
      command: expect.stringContaining("bun run dev"),
      script: "dev",
    });
    // Dry run should not create any files in the app directory
    expect(readdirSync(dir).sort()).toEqual(["bun.lock", "package.json", "server.js"]);

    // Test actual startup
    const { child, line } = await startUp(dir, env);
    const up = parseEnvelope(line);
    expect(up.errors).toEqual([]);
    expect(up.data).toMatchObject({
      ok: true,
      runtime: "native",
      inferred: true,
    });
    expect(up.data.services).toContain("plain-node");
    const url = up.data.urls?.["plain-node"];
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);

    // Test that the service answers
    const response = await (await fetch(url as string)).text();
    expect(response).toBe("ok");

    // Test status
    const status = parseEnvelope(runFlisk(["status", "--json"], { cwd: dir, env }).stdout);
    expect(status.data).toMatchObject({
      runtime: "native",
      inferred: true,
    });
    expect(status.data.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "plain-node",
          status: "ready",
        }),
      ]),
    );

    // Test down
    const down = parseEnvelope(runFlisk(["down", "--json"], { cwd: dir, env }).stdout);
    expect(down.data).toEqual({
      ok: true,
      runtime: "native",
      inferred: true,
      stopped: ["plain-node"],
    });
    expect(await exitOf(child)).toBe(0);

    // Service should no longer answer
    try {
      await fetch(url as string);
      expect.fail("Expected fetch to fail");
    } catch (error) {
      expect(error).toBeDefined();
    }

    // App directory should have no new files
    expect(readdirSync(dir).sort()).toEqual(["bun.lock", "package.json", "server.js"]);

    // Run state should be under the custom HOME
    expect(existsSync(join(root, ".flisk", "inferred"))).toBe(true);

    // Cleanup
    rmSync(root, { recursive: true, force: true });
  }, 90_000);
});
