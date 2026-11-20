// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  checkLocalServiceDependencies,
  checkWorktreeEnv,
  findMissingLocalServiceDeps,
  findWorktreeEnvHint,
} from "../doctor-local-deps.js";
import { createDoctorReport } from "../doctor-report.js";

const ROOT = "/work/project";

function native(
  name: string,
  path: string,
  config: Record<string, unknown> = {},
): DiscoveredResource {
  return {
    name,
    path,
    configPath: join(path, "service.json"),
    config: { appName: name, appType: "backend", command: "npm run dev", ...config },
  };
}

describe("findMissingLocalServiceDeps", () => {
  it("reports a Node service without node_modules with the exact install command", () => {
    const api = native("api", join(ROOT, "services/api"), { language: "node" });
    const findings = findMissingLocalServiceDeps(ROOT, [api], () => false);

    expect(findings).toEqual([
      {
        service: "api",
        path: "services/api",
        missing: "node_modules",
        installCommand: "npm install",
      },
    ]);
  });

  it("reports a Python service without .venv with the exact install command", () => {
    const api = native("py-api", join(ROOT, "services/py-api"), { language: "python" });
    const findings = findMissingLocalServiceDeps(ROOT, [api], () => false);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      service: "py-api",
      path: "services/py-api",
      missing: ".venv",
    });
    expect(findings[0]?.installCommand).toContain("python3 -m venv .venv");
    expect(findings[0]?.installCommand).toContain('pip install -e ".[dev]"');
  });

  it("accepts a hoisted dependency directory at the project root", () => {
    const api = native("api", join(ROOT, "services/api"), { language: "node" });
    const py = native("py", join(ROOT, "services/py"), { language: "python" });
    const exists = (path: string): boolean =>
      [join(ROOT, "node_modules"), join(ROOT, ".venv")].includes(path);

    expect(findMissingLocalServiceDeps(ROOT, [api, py], exists)).toEqual([]);
  });

  it("infers the language from the service files when service.json has none", () => {
    const files = new Set([join(ROOT, "web/package.json"), join(ROOT, "worker/pyproject.toml")]);
    const resources = [
      native("web", join(ROOT, "web")),
      native("worker", join(ROOT, "worker"), { command: "uvicorn main:app" }),
    ];

    const findings = findMissingLocalServiceDeps(ROOT, resources, (path) => files.has(path));

    expect(findings.map((finding) => [finding.service, finding.missing])).toEqual([
      ["web", "node_modules"],
      ["worker", ".venv"],
    ]);
  });

  it("ignores services that run in a container", () => {
    const container = {
      name: "db",
      path: join(ROOT, "services/db"),
      configPath: join(ROOT, "services/db/service.json"),
      config: { appName: "db", image: "postgres:16" },
    } as DiscoveredResource;

    expect(findMissingLocalServiceDeps(ROOT, [container], () => false)).toEqual([]);
  });
});

describe("checkLocalServiceDependencies", () => {
  it("puts one clear line per service in the message and an exact command in the fix", () => {
    const resources = [
      native("api", join(ROOT, "services/api"), { language: "node" }),
      native("worker", join(ROOT, "services/worker"), { language: "python" }),
    ];
    const result = checkLocalServiceDependencies(ROOT, resources, () => false);

    expect(result.name).toBe("Local service dependencies");
    expect(result.didPass).toBe(false);
    expect(result.message.split("\n")).toHaveLength(2);
    expect(result.message).toContain("api: missing node_modules - run `npm install`");
    expect(result.message).toContain("worker: missing .venv - run `python3 -m venv .venv");
    expect(result.fix).toContain("cd services/api && npm install");
    expect(result.fix).toContain("cd services/worker && python3 -m venv .venv");
    expect(result.observed).toMatchObject({ kind: "local-service-deps" });
  });

  it("passes when nothing is missing", () => {
    const result = checkLocalServiceDependencies(
      ROOT,
      [native("api", join(ROOT, "services/api"), { language: "node" })],
      () => true,
    );
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("Every local-process service has its dependencies");
  });
});

describe("findWorktreeEnvHint", () => {
  let base: string;
  let current: string;
  let other: string;
  let worktrees: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "flisk-doctor-env-"));
    current = join(base, "current worktree");
    other = join(base, "other worktree");
    mkdirSync(current);
    mkdirSync(other);
    worktrees = [
      `worktree ${current}`,
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      `worktree ${other}`,
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/feature",
      "",
    ].join("\n");
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("uses git worktree list and offers a copy command without copying", () => {
    const listWorktrees = vi.fn(() => worktrees);
    const exists = vi.fn((path: string) => path === join(other, ".env"));
    const source = join(other, ".env");
    writeFileSync(source, "SECRET=do-not-print\n");

    const hint = findWorktreeEnvHint(current, {
      listWorktrees,
      exists,
      platform: "linux",
    });

    expect(listWorktrees).toHaveBeenCalledWith(current);
    expect(exists).toHaveBeenCalledWith(join(current, ".env"));
    expect(hint).toMatchObject({ source, target: join(current, ".env") });
    expect(hint?.copyCommand).toBe(`cp '${source}' '${join(current, ".env")}'`);
    expect(hint?.copyCommand).not.toContain("SECRET");
    // The hint never writes the file itself.
    expect(readFileSync(source, "utf-8")).toBe("SECRET=do-not-print\n");
  });

  it("uses a Windows copy command on win32", () => {
    writeFileSync(join(other, ".env"), "SECRET=do-not-print\n");
    const hint = findWorktreeEnvHint(current, {
      listWorktrees: () => worktrees,
      platform: "win32",
    });
    expect(hint?.copyCommand).toBe(`copy /Y "${join(other, ".env")}" "${join(current, ".env")}"`);
  });

  it("returns null when no other worktree has an env file", () => {
    const hint = findWorktreeEnvHint(current, {
      listWorktrees: () => worktrees,
      exists: (path) => path === join(current, ".env"),
      platform: "linux",
    });
    expect(hint).toBeNull();
  });
});

describe("checkWorktreeEnv", () => {
  let base: string;
  let current: string;
  let other: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "flisk-doctor-env-check-"));
    current = join(base, "current worktree");
    other = join(base, "other worktree");
    mkdirSync(current);
    mkdirSync(other);
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("reports the copy command as a non-blocking warning in a structured finding", () => {
    const result = checkWorktreeEnv(current, {
      listWorktrees: () => `worktree ${current}\nworktree ${other}\n`,
      exists: (path) => path === join(other, ".env"),
      platform: "linux",
    });

    expect(result.name).toBe("Worktree .env");
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain(other);
    expect(result.fix).toContain(`cp '${join(other, ".env")}'`);
    expect(result.observed).toMatchObject({
      kind: "env-copy",
      copyCommand: result.fix,
    });
  });

  it("skips when this worktree already has an env file", () => {
    const result = checkWorktreeEnv(current, {
      listWorktrees: () => `worktree ${current}\nworktree ${other}\n`,
      exists: (path) => path === join(current, ".env") || path === join(other, ".env"),
      platform: "linux",
    });
    expect(result.isSkipped).toBe(true);
  });

  it("is included with structured details in doctor --json and MCP output", () => {
    const deps = checkLocalServiceDependencies(
      ROOT,
      [native("api", join(ROOT, "services/api"), { language: "node" })],
      () => false,
    );
    const env = checkWorktreeEnv(current, {
      listWorktrees: () => `worktree ${current}\nworktree ${other}\n`,
      exists: (path) => path === join(other, ".env"),
      platform: "linux",
    });
    const report = createDoctorReport([deps, env], true);
    const names = report.data.checks.map((check) => check.name);

    expect(names).toContain("Local service dependencies");
    expect(names).toContain("Worktree .env");
    expect(
      report.data.checks.find((check) => check.name === "Local service dependencies")?.observed,
    ).toMatchObject({ kind: "local-service-deps" });
    expect(
      report.data.checks.find((check) => check.name === "Worktree .env")?.observed,
    ).toMatchObject({ kind: "env-copy" });
  });
});
