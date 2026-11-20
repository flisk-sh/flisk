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

function runFlisk(args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
    env: env ? { ...process.env, ...env } : process.env,
  });
}

describe("flisk restart", () => {
  it("fails when called outside a Flisk project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-outside-"));
    try {
      const res = runFlisk(["restart", "api", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("NOT_IN_PROJECT");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports TILT_NOT_RUNNING when tilt is not running for the project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-no-tilt-"));
    fs.mkdirSync(path.join(tmp, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".flisk", "project.json"), "{}\n");
    // The resource must exist in the project so restart passes the name check and
    // reaches the Tilt probe; otherwise it fails earlier with UNKNOWN_RESOURCE.
    fs.mkdirSync(path.join(tmp, "services", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "services", "api", "service.json"),
      JSON.stringify({ appName: "api", appType: "backend", port: 4000 }),
    );
    try {
      const res = runFlisk(["restart", "api", "--json", "--port=59999"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("TILT_NOT_RUNNING");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("preserves the Tilt guidance for a container project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-container-"));
    fs.mkdirSync(path.join(tmp, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".flisk", "project.json"), "{}\n");
    fs.mkdirSync(path.join(tmp, "services", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "services", "api", "service.json"),
      JSON.stringify({ appName: "api", appType: "backend", port: 4000 }),
    );
    try {
      const res = runFlisk(["restart", "api"], tmp, { TILT_PORT: "59999" });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Could not reach Tilt on port 59999");
      expect(res.stderr).toContain("Start the stack first with: flisk up");
      expect(res.stderr).not.toContain("flisk down && flisk up");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("explains the local-process restart limit in text mode without mentioning Tilt as a running requirement", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-native-text-"));
    fs.mkdirSync(path.join(tmp, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".flisk", "project.json"), "{}\n");
    for (const name of ["api", "web"]) {
      fs.mkdirSync(path.join(tmp, "services", name), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "services", name, "service.json"),
        JSON.stringify({
          appName: name,
          appType: name === "api" ? "backend" : "frontend",
          port: name === "api" ? 4000 : 3000,
          command: "node server.js",
        }),
      );
    }
    try {
      const res = runFlisk(["restart", "api"], tmp, { TILT_PORT: "59999" });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("`flisk restart` requires Tilt");
      expect(res.stderr).toContain("this project runs as local processes (no Tilt)");
      expect(res.stderr).toContain("flisk down && flisk up");
      expect(res.stderr).not.toContain("Could not reach Tilt");
      expect(res.stderr).not.toContain("Start it with: flisk up");
      expect(res.stderr).not.toContain("Start the stack first with: flisk up");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns NATIVE_RESTART_UNSUPPORTED for a native project without calling Tilt", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-native-idle-"));
    fs.mkdirSync(path.join(tmp, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".flisk", "project.json"), "{}\n");
    for (const name of ["api", "web"]) {
      fs.mkdirSync(path.join(tmp, "services", name), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "services", name, "service.json"),
        JSON.stringify({
          appName: name,
          appType: name === "api" ? "backend" : "frontend",
          port: name === "api" ? 4000 : 3000,
          command: "node server.js",
        }),
      );
    }
    try {
      const res = runFlisk(["restart", "api", "--json", "--port=59999"], tmp);
      expect(res.status).toBe(1);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
      expect(envelope.errors[0]).toEqual({
        code: "NATIVE_RESTART_UNSUPPORTED",
        message:
          "`flisk restart` requires Tilt and works on Tilt resources; this project runs as local processes (no Tilt).",
        suggestions: ["Restart the project with: flisk down && flisk up"],
      });
      expect(res.stdout).not.toContain("TILT_NOT_RUNNING");
      expect(res.stdout).not.toContain("Start it with: flisk up");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports UNKNOWN_RESOURCE for a name not in the project, before probing Tilt", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-unknown-"));
    fs.mkdirSync(path.join(tmp, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".flisk", "project.json"), "{}\n");
    fs.mkdirSync(path.join(tmp, "services", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "services", "api", "service.json"),
      JSON.stringify({ appName: "api", appType: "backend", port: 4000 }),
    );
    try {
      const res = runFlisk(["restart", "nope", "--json", "--port=59999"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0]).toEqual({
        code: "UNKNOWN_RESOURCE",
        message: 'Resource "nope" not found in project.',
        suggestions: ["Resources: api", "See the names with: flisk resources"],
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(["abc", "70000", "0", "-1"])("exits 2 when --port %s is invalid", (badPort) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-bad-port-"));
    fs.mkdirSync(path.join(tmp, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".flisk", "project.json"), "{}\n");
    try {
      const res = runFlisk(["restart", "api", "--port", badPort], tmp);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("--port must be a valid port number");

      const jsonRes = runFlisk(["restart", "api", "--port", badPort, "--json"], tmp);
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-restart-bad-env-port-"));
    fs.mkdirSync(path.join(tmp, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".flisk", "project.json"), "{}\n");
    try {
      const res = runFlisk(["restart", "api"], tmp, { TILT_PORT: badPort });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("TILT_PORT must be a valid port number");

      const jsonRes = runFlisk(["restart", "api", "--json"], tmp, { TILT_PORT: badPort });
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
