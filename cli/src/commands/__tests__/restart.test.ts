// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliPath = path.join(repoRoot, "cli", "bin", "flisk.js");

function runTdk(args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
    env: env ? { ...process.env, ...env } : process.env,
  });
}

describe("flisk restart", () => {
  it("fails when called outside a Flisk project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-restart-outside-"));
    try {
      const res = runTdk(["restart", "api", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("COMMAND_FAILED");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports TILT_NOT_RUNNING when tilt is not running for the project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-restart-no-tilt-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    try {
      const res = runTdk(["restart", "api", "--json", "--port=59999"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("TILT_NOT_RUNNING");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(["abc", "70000", "0", "-1"])("exits 2 when --port %s is invalid", (badPort) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-restart-bad-port-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    try {
      const res = runTdk(["restart", "api", "--port", badPort], tmp);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("--port must be a valid port number");

      const jsonRes = runTdk(["restart", "api", "--port", badPort, "--json"], tmp);
      expect(jsonRes.status).toBe(2);
      const envelope = JSON.parse(jsonRes.stdout);
      expect(envelope.errors[0]).toEqual({
        code: "USAGE",
        message: "--port must be a valid port number",
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(["abc", "70000"])("exits 2 when TILT_PORT=%s is invalid", (badPort) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-restart-bad-env-port-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    try {
      const res = runTdk(["restart", "api"], tmp, { TILT_PORT: badPort });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("TILT_PORT must be a valid port number");

      const jsonRes = runTdk(["restart", "api", "--json"], tmp, { TILT_PORT: badPort });
      expect(jsonRes.status).toBe(2);
      const envelope = JSON.parse(jsonRes.stdout);
      expect(envelope.errors[0]).toEqual({
        code: "USAGE",
        message: "TILT_PORT must be a valid port number",
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
