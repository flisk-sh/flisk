// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, parseEnvelope, runFlisk } from "../../test-support/index.js";

const FIXTURE = join(__dirname, "../../../../tests/fixtures/unopinionated");

/** A local-process project with one required secret; dry runs never start Tilt or Docker. */
function project(): { dir: string; env: Record<string, string | undefined> } {
  const dir = join(createTempDir("flisk-secret-provider-"), "app");
  cpSync(FIXTURE, dir, { recursive: true });
  const file = join(dir, "api", "service.json");
  const manifest = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  manifest.secrets = { required: ["API_KEY"] };
  writeFileSync(file, JSON.stringify(manifest));
  return { dir, env: { FLISK_SECRET_PROVIDER: undefined, FLISK_SECRET_BRIDGE: undefined } };
}

describe("flisk up secret provider (#4706)", () => {
  it("rejects an unknown provider with a USAGE error and exit 2", () => {
    const { dir, env } = project();
    const run = runFlisk(["up", "--json", "--dry-run"], {
      cwd: dir,
      env: { ...env, FLISK_SECRET_PROVIDER: "keychan" },
    });
    expect(run.status).toBe(2);
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data).toMatchObject({ ok: false });
    expect(envelope.errors[0]).toMatchObject({ code: "USAGE" });
    expect(envelope.errors[0].message).toContain('"keychan"');
    expect(envelope.errors[0].message).toContain("env-file, infisical");
  });

  it("warns in text and --json warnings with infisical and no bridge", () => {
    const { dir, env } = project();
    const run = runFlisk(["up", "--json", "--dry-run"], {
      cwd: dir,
      env: { ...env, FLISK_SECRET_PROVIDER: "infisical" },
    });
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("API_KEY will be empty");
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data.ok).toBe(true);
    expect(envelope.data.warnings).toEqual([
      "FLISK_SECRET_PROVIDER=infisical: this build has no Infisical client; API_KEY will be empty",
    ]);
  });

  it("says nothing when a secret bridge is present", () => {
    const { dir, env } = project();
    const run = runFlisk(["up", "--json", "--dry-run"], {
      cwd: dir,
      env: {
        ...env,
        FLISK_SECRET_PROVIDER: "infisical",
        FLISK_SECRET_BRIDGE: "1",
      },
    });
    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain("will be empty");
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data.ok).toBe(true);
    expect(envelope.data.warnings).toBeUndefined();
  });
});
