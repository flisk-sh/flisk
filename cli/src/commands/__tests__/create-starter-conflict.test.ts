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

  it("preserves --starter alone and --extras none", async () => {
    await expect(collectAnswers("shop", { starter: dockerStarter }, false)).resolves.toMatchObject({
      starter: dockerStarter,
    });
    await expect(
      collectAnswers("shop", { starter: dockerStarter, extras: "none" }, false),
    ).resolves.toMatchObject({ starter: dockerStarter });
  });

  it("keeps --json output machine readable when a conflicting flag is present", () => {
    const cwd = mkdtempSync(join(tmpdir(), "flisk-create-conflict-json-"));
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
        "--json",
      ],
      { cwd, timeout: 30_000 },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toBe("");
    const envelope = JSON.parse(run.stdout.trim());
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.data).toBeNull();
    expect(envelope.errors[0].code).toBe("USAGE");
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
