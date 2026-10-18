// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { copyProject, runTdk, runTdkAllowFailure } from "./project-e2e-helpers.js";

describe("project .env and secrets E2E", () => {
  // One generated project per file. Each test copies it, so only the scaffold runs once.
  let baseRoot = "";
  let projectRoot = "";

  beforeAll(() => {
    baseRoot = mkdtempSync(join(tmpdir(), "tdk-project-env-base-"));
    runTdk(["project", "--yes"], baseRoot);
  }, 120_000);

  afterAll(() => {
    if (baseRoot.startsWith(tmpdir())) {
      rmSync(baseRoot, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (projectRoot?.startsWith(tmpdir())) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("recreates a missing .env when `tdk project` runs in an already-initialised repo", () => {
    projectRoot = copyProject(baseRoot);
    const envPath = join(projectRoot, ".env");
    expect(existsSync(envPath)).toBe(true);

    // A fresh clone has .tdk/project.json (committed) but no .env (gitignored).
    rmSync(envPath);
    runTdk(["project", "--yes"], projectRoot);

    const env = readFileSync(envPath, "utf-8");
    expect(env).toMatch(/^TILT_ENV=dev$/m);
    expect(env).toMatch(/^DB_PASSWORD=[0-9a-f]{32}$/m);
  }, 30000);

  it("generates a per-project JWT secret and a DATABASE_URL that uses the generated password", () => {
    projectRoot = copyProject(baseRoot);
    // A separate scaffold, not a copy: the test proves two generated projects never share a secret.
    const otherRoot = mkdtempSync(join(tmpdir(), "tdk-project-env-secrets-other-"));

    try {
      runTdk(["project", "--yes"], otherRoot);

      const env = readFileSync(join(projectRoot, ".env"), "utf-8");
      const other = readFileSync(join(otherRoot, ".env"), "utf-8");
      const jwt = env.match(/^JWT_SECRET=([0-9a-f]{64})$/m)?.[1];
      const password = env.match(/^DB_PASSWORD=([0-9a-f]{32})$/m)?.[1];

      expect(jwt).toBeDefined();
      // Two projects never share a signing secret, and the secret is not a documented default.
      expect(other.match(/^JWT_SECRET=([0-9a-f]{64})$/m)?.[1]).not.toBe(jwt);
      expect(env).not.toContain("local-development-secret");
      expect(env).toContain(`postgresql://postgres:${password}@`);
      expect(env).not.toContain(":postgres@");
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  }, 30000);

  it("completes an older .env on `tdk project` without rotating any existing value", () => {
    projectRoot = copyProject(baseRoot);

    // What a previous CLI wrote: no JWT_SECRET, and Verdaccio required.
    const envPath = join(projectRoot, ".env");
    writeFileSync(
      envPath,
      "VERDACCIO_URL_DOCKER=http://verdaccio:4873\nTILT_ENV=dev\nDB_PASSWORD=0123456789abcdef0123456789abcdef\nSTRIPE_KEY=sk_test_keep_me\n",
    );

    runTdk(["project", "--yes"], projectRoot);

    const env = readFileSync(envPath, "utf-8");
    expect(env).toMatch(/^JWT_SECRET=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^DB_PASSWORD=0123456789abcdef0123456789abcdef$/m);
    expect(env).toMatch(/^STRIPE_KEY=sk_test_keep_me$/m);
    expect(env.match(/^JWT_SECRET=/gm)).toHaveLength(1);

    // A second run changes nothing: the secret it added is not rotated.
    runTdk(["project", "--yes"], projectRoot);
    expect(readFileSync(envPath, "utf-8")).toBe(env);
  }, 30000);

  it("reports a DATABASE_URL password that differs from DB_PASSWORD in `tdk doctor`", () => {
    projectRoot = copyProject(baseRoot);
    writeFileSync(
      join(projectRoot, ".env"),
      "TILT_ENV=dev\nDB_PASSWORD=0123456789abcdef0123456789abcdef\nDATABASE_URL=postgresql://postgres:postgres@postgres:5432/app_dev\n",
    );

    expect(runTdkAllowFailure(["doctor"], projectRoot)).toMatch(
      /warning: DATABASE_URL carries a different password than DB_PASSWORD/,
    );
  }, 60000);
});
