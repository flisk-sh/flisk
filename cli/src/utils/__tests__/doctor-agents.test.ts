// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type CodingAgentCheckOptions,
  checkCodingAgents,
  claudeProjectSlug,
} from "../doctor-agents.js";
import { createDoctorReport } from "../doctor-report.js";

const CHECKOUT = "/work/app";
const HOME = "/home/test";
const NOW = 1_800_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function baseOptions(overrides: Partial<CodingAgentCheckOptions> = {}): CodingAgentCheckOptions {
  return {
    startDir: CHECKOUT,
    projectRoot: CHECKOUT,
    platform: "linux",
    homeDir: HOME,
    now: NOW,
    recentWindowMs: DAY_MS,
    run: () => {
      throw new Error("no external commands in this test");
    },
    pathExists: () => false,
    listSessionFiles: () => [],
    listProcessCwds: () => new Map<number, string>(),
    realpath: (path) => path,
    ...overrides,
  };
}

/** `ps -axo pid=,comm=` output: two Claude Code processes and one unrelated node process. */
const PS_TWO_CLAUDE = "  101 claude\n  102 /opt/claude/bin/claude\n  103 /usr/bin/node\n";

function psRun(psOutput: string): CodingAgentCheckOptions["run"] {
  return (command) => {
    if (command === "ps") return psOutput;
    throw new Error(`unexpected command ${command}`);
  };
}

describe("claudeProjectSlug", () => {
  it("encodes a checkout path the way Claude Code names its project directory", () => {
    expect(claudeProjectSlug("/Users/aarivpatel/Hub")).toBe("-Users-aarivpatel-Hub");
    expect(claudeProjectSlug("/work/my app/v2.0")).toBe("-work-my-app-v2-0");
  });
});

describe("checkCodingAgents process detection", () => {
  it("warns when two agent processes have their working directory inside the checkout", () => {
    const result = checkCodingAgents(
      baseOptions({
        run: psRun(PS_TWO_CLAUDE),
        listProcessCwds: (pids) => new Map(pids.map((pid) => [pid, CHECKOUT])),
      }),
    );

    expect(result.name).toBe("Coding agents");
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("2 coding agents");
    expect(result.message).toContain("Claude Code");
    expect(result.fix).toContain("git worktree");
    expect(result.fix).toContain("Run My Agents");
    expect(result.observed).toMatchObject({
      kind: "coding-agents",
      agents: 2,
      runningAgents: 2,
    });
  });

  it("counts distinct agent products and ignores processes outside the checkout", () => {
    const ps = "  101 claude\n  102 /usr/local/bin/codex\n  103 gemini\n";
    const result = checkCodingAgents(
      baseOptions({
        run: psRun(ps),
        listProcessCwds: () =>
          new Map([
            [101, CHECKOUT],
            [102, "/somewhere/else"],
            [103, `${CHECKOUT}/services/api`],
          ]),
      }),
    );

    // claude and gemini are inside (a subdirectory still belongs to the checkout); codex is not.
    expect(result.isWarning).toBe(true);
    expect(result.observed).toMatchObject({ agents: 2, runningAgents: 2 });
    expect(result.message).toContain("Claude Code");
    expect(result.message).toContain("Gemini CLI");
    expect(result.message).not.toContain("Codex");
  });

  it("does not warn for a single agent process", () => {
    const result = checkCodingAgents(
      baseOptions({
        run: psRun("  101 claude\n"),
        listProcessCwds: () => new Map([[101, CHECKOUT]]),
      }),
    );

    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
    expect(result.message).toContain("1 coding agent");
  });

  it("does not count agent processes whose working directory cannot be determined", () => {
    const result = checkCodingAgents(
      baseOptions({
        run: psRun(PS_TWO_CLAUDE),
        // lsof/proc lookup failed: no cwd evidence, so nothing is attributed to this checkout.
        listProcessCwds: () => new Map(),
      }),
    );

    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
    expect(result.observed).toMatchObject({ runningAgents: 0 });
  });

  it("tolerates a missing ps and a missing git binary", () => {
    const result = checkCodingAgents(baseOptions());
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
    expect(result.message).toContain("No coding agents");
  });
});

describe("checkCodingAgents session logs", () => {
  it("warns when several session files for this checkout were modified recently", () => {
    const listSessionFiles = vi.fn(() => [
      { name: "a.jsonl", mtimeMs: NOW - 1000 },
      { name: "b.jsonl", mtimeMs: NOW - 2000 },
      { name: "c.jsonl", mtimeMs: NOW - DAY_MS - 1 }, // stale, outside the window
    ]);
    const result = checkCodingAgents(baseOptions({ listSessionFiles }));

    expect(result.isWarning).toBe(true);
    expect(result.observed).toMatchObject({ agents: 2, recentSessions: 2 });
    expect(listSessionFiles).toHaveBeenCalledWith(
      join(HOME, ".claude", "projects", claudeProjectSlug(CHECKOUT)),
    );
    expect(result.message).toContain("Claude Code");
  });

  it("looks up session directories for the git toplevel and the project root", () => {
    const listSessionFiles = vi.fn((_dir: string): { name: string; mtimeMs: number }[] => []);
    const run: CodingAgentCheckOptions["run"] = (command) => {
      if (command === "git") return "/work\n";
      if (command === "ps") return "";
      throw new Error(`unexpected command ${command}`);
    };
    checkCodingAgents(baseOptions({ run, listSessionFiles }));

    const dirs = listSessionFiles.mock.calls.map((call) => call[0]);
    expect(dirs).toContain(join(HOME, ".claude", "projects", claudeProjectSlug("/work")));
    expect(dirs).toContain(join(HOME, ".claude", "projects", claudeProjectSlug(CHECKOUT)));
  });

  it("tolerates unreadable or missing session directories", () => {
    const result = checkCodingAgents(
      baseOptions({
        listSessionFiles: () => {
          throw Object.assign(new Error("EACCES"), { code: "EACCES" });
        },
      }),
    );
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
  });

  it("counts session files by name and mtime only, even when their contents cannot be read", () => {
    const base = mkdtempSync(join(tmpdir(), "flisk-doctor-agents-"));
    try {
      const home = join(base, "home");
      const project = join(base, "checkout");
      mkdirSync(project, { recursive: true });
      const sessionDir = join(home, ".claude", "projects", claudeProjectSlug(project));
      mkdirSync(sessionDir, { recursive: true });
      const now = Date.now();
      for (const name of ["one.jsonl", "two.jsonl"]) {
        const file = join(sessionDir, name);
        writeFileSync(file, "session contents that must never be read\n");
        // Mode 000 proves the check stats the file instead of opening it.
        chmodSync(file, 0o000);
      }
      const stale = join(sessionDir, "stale.jsonl");
      writeFileSync(stale, "old\n");
      const old = new Date(now - 3 * DAY_MS);
      utimesSync(stale, old, old);

      const result = checkCodingAgents({
        startDir: project,
        projectRoot: project,
        platform: "linux",
        homeDir: home,
        now,
        recentWindowMs: DAY_MS,
        run: () => {
          throw new Error("no external commands in this test");
        },
        pathExists: () => false,
        realpath: (path) => path,
      });

      expect(result.isWarning).toBe(true);
      expect(result.observed).toMatchObject({ recentSessions: 2, agents: 2 });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("checkCodingAgents agent markers", () => {
  it("reports agent config directories as products without warning on its own", () => {
    const result = checkCodingAgents(
      baseOptions({
        pathExists: (path) =>
          path === join(CHECKOUT, ".cursor") || path === join(CHECKOUT, ".claude"),
      }),
    );

    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
    expect(result.observed).toMatchObject({ products: ["Claude Code", "Cursor"] });
  });
});

describe("checkCodingAgents result shape", () => {
  it("fails the check under --strict when several agents are detected", () => {
    const result = checkCodingAgents(
      baseOptions({
        strict: true,
        run: psRun(PS_TWO_CLAUDE),
        listProcessCwds: (pids) => new Map(pids.map((pid) => [pid, CHECKOUT])),
      }),
    );

    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(false);
  });

  it("is skipped on Windows where ps and lsof do not exist", () => {
    const result = checkCodingAgents(baseOptions({ platform: "win32" }));
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
  });

  it("flows into the doctor JSON report as a warning with structured details", () => {
    const check = checkCodingAgents(
      baseOptions({
        run: psRun(PS_TWO_CLAUDE),
        listProcessCwds: (pids) => new Map(pids.map((pid) => [pid, CHECKOUT])),
      }),
    );
    const report = createDoctorReport([check], true);

    expect(report.data.ready).toBe(true);
    expect(report.data.warnings).toEqual([check.message]);
    const entry = report.data.checks.find((item) => item.name === "Coding agents");
    expect(entry).toMatchObject({
      didPass: true,
      isWarning: true,
      fix: check.fix,
    });
    expect(entry?.observed).toMatchObject({ kind: "coding-agents", agents: 2 });
  });
});
