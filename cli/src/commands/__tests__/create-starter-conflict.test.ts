// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runFlisk } from "../../test-support/index.js";
import { starterCatalog } from "../../utils/create-catalog.js";
import { collectAnswers } from "../create.js";

const dockerStarter = starterCatalog().find((starter) => !starter.local)?.id ?? "saas";
const localStarter = starterCatalog().find((starter) => starter.local)?.id ?? "swarm";

describe("create starter conflicting flags (issue 4419)", () => {
  it.each([
    ["--frontend", { frontend: "vue" }],
    ["--backend", { backend: "express" }],
    ["--language", { language: "python" }],
    ["--extras", { extras: "worker" }],
  ])("rejects %s next to --starter and names the option", async (flag, extra) => {
    let error: Error | undefined;
    try {
      await collectAnswers("shop", { starter: dockerStarter, ...extra }, false);
    } catch (caught) {
      error = caught as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain(flag);
    expect(error?.message).toContain("--starter");
  });

  it("names every conflicting option when several are supplied", async () => {
    let error: Error | undefined;
    try {
      await collectAnswers(
        "shop",
        { starter: dockerStarter, frontend: "vue", backend: "express", language: "python" },
        false,
      );
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).toContain("--frontend");
    expect(error?.message).toContain("--backend");
    expect(error?.message).toContain("--language");
  });

  it("rejects --runtime when it differs from the starter runtime", async () => {
    await expect(
      collectAnswers("shop", { starter: dockerStarter, runtime: "local" }, false),
    ).rejects.toThrow(/--runtime/);
    await expect(
      collectAnswers("shop", { starter: localStarter, runtime: "docker" }, false),
    ).rejects.toThrow(/--runtime/);
  });

  it("accepts --runtime when it matches the starter runtime", async () => {
    await expect(
      collectAnswers("shop", { starter: dockerStarter, runtime: "docker" }, false),
    ).resolves.toMatchObject({ starter: dockerStarter, runtime: "docker" });
    await expect(
      collectAnswers("shop", { starter: localStarter, runtime: "local" }, false),
    ).resolves.toMatchObject({ starter: localStarter, runtime: "local" });
  });

  it.each(["", "swram"])(
    'rejects unknown --starter value "%s" before checking conflicts',
    async (starter) => {
      await expect(
        collectAnswers("shop", { starter, runtime: "local", frontend: "vue" }, false),
      ).rejects.toThrow(/Unknown --starter/);
    },
  );

  it("reports other conflicts alongside an invalid runtime", async () => {
    await expect(
      collectAnswers(
        "shop",
        { starter: dockerStarter, frontend: "vue", extras: "worker", runtime: "bogus" },
        false,
      ),
    ).rejects.toThrow(/--frontend, --extras.*Unknown --runtime "bogus"/);
  });

  it("keeps the allowed-values error when runtime is the only invalid option", async () => {
    await expect(
      collectAnswers("shop", { starter: dockerStarter, runtime: "bogus" }, false),
    ).rejects.toThrow(/Unknown --runtime "bogus"\. Use one of:/);
  });

  it("suggests removing conflicts without replacing the project name or dry-run mode", async () => {
    let error: (Error & { suggestions?: string[] }) | undefined;
    try {
      await collectAnswers(
        "shop",
        { starter: dockerStarter, frontend: "vue", dryRun: true },
        false,
      );
    } catch (caught) {
      error = caught as Error & { suggestions?: string[] };
    }
    expect(error?.suggestions).toEqual([
      expect.stringContaining("keeping the project name and other options you need"),
      "Or drop --starter and choose the parts yourself.",
    ]);
  });

  it("preserves --starter alone and --extras none", async () => {
    await expect(collectAnswers("shop", { starter: dockerStarter }, false)).resolves.toMatchObject({
      starter: dockerStarter,
    });
    await expect(
      collectAnswers("shop", { starter: dockerStarter, extras: "none" }, false),
    ).resolves.toMatchObject({ starter: dockerStarter });
  });

  it("names every conflicting flag on the command line, before the backend/language guard", () => {
    const cwd = mkdtempSync(join(tmpdir(), "flisk-create-conflict-cli-"));
    const run = runFlisk(
      [
        "create",
        "shop",
        "--yes",
        "--dry-run",
        "--starter",
        dockerStarter,
        "--frontend",
        "vue",
        "--backend",
        "none",
        "--language",
        "python",
      ],
      { cwd, timeout: 30_000 },
    );

    expect(run.status).toBe(1);
    const output = `${run.stdout}\n${run.stderr}`;
    expect(output).toContain("--frontend");
    expect(output).toContain("--backend");
    expect(output).toContain("--language");
    expect(output).not.toContain("has no API to apply to");
  });

  it("exits 1 with a clear message on a dry run with a conflicting flag", () => {
    const cwd = mkdtempSync(join(tmpdir(), "flisk-create-conflict-"));
    const run = runFlisk(
      ["create", "shop", "--yes", "--dry-run", "--starter", dockerStarter, "--frontend", "vue"],
      { cwd, timeout: 30_000 },
    );

    expect(run.status).toBe(1);
    expect(run.stderr + run.stdout).toContain("--frontend");
  });
});
