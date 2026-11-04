// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { freePort } from "../../test-support/index.js";
import { securityManifests, writeSecurityProject } from "../security-template.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("security template", () => {
  it("chains scanner to triage to reporter as local processes", () => {
    const manifests = securityManifests();
    expect(manifests["scanner/service.json"]?.dependsOn).toEqual(["triage"]);
    expect(manifests["triage/service.json"]?.dependsOn).toEqual(["reporter"]);
    for (const manifest of Object.values(manifests)) expect(manifest.command).toBeTruthy();
  });

  it("writes the project to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "security-"));
    dirs.push(dir);
    writeSecurityProject(dir);
    for (const file of [
      "README.md",
      "scanner/server.mjs",
      "triage/server.mjs",
      "reporter/service.json",
    ]) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
  });

  it("reports a hardcoded secret as critical, worst first", async () => {
    const dir = mkdtempSync(join(tmpdir(), "security-"));
    dirs.push(dir);
    writeSecurityProject(dir);
    const ports = [await freePort(), await freePort(), await freePort()];
    const url = (n: number) => `http://localhost:${ports[n]}`;
    const run = (name: string, n: number, extra: Record<string, string>) =>
      spawn("node", [join(dir, name, "server.mjs")], {
        env: { ...process.env, PORT: String(ports[n]), ...extra },
      });
    const procs = [
      run("reporter", 2, {}),
      run("triage", 1, { REPORTER_URL: url(2) }),
      run("scanner", 0, { TRIAGE_URL: url(1) }),
    ];
    try {
      let scanned: Response | undefined;
      for (let i = 0; i < 50 && !scanned; i++) {
        try {
          scanned = await fetch(`${url(0)}/scan`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              files: { "a.js": 'const x = "http://example.com";\nconst apiKey = "abcdef123456";' },
            }),
          });
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      expect(scanned?.status).toBe(200);
      let report: { total: number; findings: { severity: string }[] } = { total: 0, findings: [] };
      for (let i = 0; i < 50 && report.total < 2; i++) {
        await new Promise((r) => setTimeout(r, 100));
        report = await (await fetch(`${url(2)}/report`)).json();
      }
      expect(report.findings.map((f) => f.severity)).toEqual(["critical", "medium"]);
    } finally {
      for (const proc of procs) proc.kill();
    }
  }, 30_000);
});
