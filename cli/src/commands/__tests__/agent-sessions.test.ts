// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliPath = path.join(repoRoot, "cli", "bin", "tdk.js");

function runTdk(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
  });
}

describe("tdk agent sessions", () => {
  it("fails when called outside a TDK project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-outside-"));
    try {
      const res = runTdk(["agent", "sessions", "bot", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("COMMAND_FAILED");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports UNKNOWN_RESOURCE when the resource does not exist in the project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-unknown-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    try {
      const res = runTdk(["agent", "sessions", "nonexistent", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("UNKNOWN_RESOURCE");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports NOT_AN_AGENT when the resource exists but is not an agent", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-not-agent-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    fs.mkdirSync(path.join(tmp, "services", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "services", "api", "service.json"),
      JSON.stringify({ appName: "api", appType: "backend", port: 4000 }),
    );
    try {
      const res = runTdk(["agent", "sessions", "api", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("NOT_AN_AGENT");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
