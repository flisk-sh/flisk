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

describe("tdk restart", () => {
  it("fails when called outside a TDK project", () => {
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
});
