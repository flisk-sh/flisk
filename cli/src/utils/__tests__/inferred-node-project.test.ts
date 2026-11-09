// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inferNodeProject } from "../inferred-node-project.js";

describe("inferNodeProject", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `flisk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("infers a service from package.json with scripts.dev", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result).not.toBeNull();
    expect(result?.kind).toBe("service");
    expect(result?.service.name).toBe("my-app");
    expect(result?.command).toMatch(/bun run dev/);
    expect(result?.script).toBe("dev");
  });

  it("falls back to scripts.start when scripts.dev is missing", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { start: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result).not.toBeNull();
    expect(result?.script).toBe("start");
  });

  it("prefers scripts.dev over scripts.start", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node dev.js", start: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result?.script).toBe("dev");
  });

  it("returns null when no scripts.dev or scripts.start", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { test: "vitest" },
      }),
    );

    const result = inferNodeProject(testDir);

    expect(result).toBeNull();
  });

  it("detects bun lockfile", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result?.command).toMatch(/bun run dev/);
  });

  it("detects pnpm lockfile", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "pnpm-lock.yaml"), "");

    const result = inferNodeProject(testDir);

    expect(result?.command).toMatch(/pnpm run dev/);
  });

  it("detects yarn lockfile", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "yarn.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result?.command).toMatch(/yarn run dev/);
  });

  it("defaults to npm when no lockfile", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );

    const result = inferNodeProject(testDir);

    expect(result?.command).toMatch(/npm run dev/);
  });

  it("returns null when package.json has workspaces", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "monorepo",
        workspaces: ["packages/*"],
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result).toBeNull();
  });

  it("returns null when Compose file exists", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "docker-compose.yml"), "");
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result).toBeNull();
  });

  it("returns null when Tiltfile exists", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "Tiltfile"), "");
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result).toBeNull();
  });

  it("returns null when no package.json", () => {
    const result = inferNodeProject(testDir);

    expect(result).toBeNull();
  });

  it("uses folder name when package.json has no name", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result).not.toBeNull();
    expect(result?.service.name).toBeDefined();
    expect(result?.service.name.length).toBeGreaterThan(0);
  });

  it("extracts port from --port flag", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js --port 5000" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result?.service.config?.port).toBe(5000);
  });

  it("extracts port from -p flag", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js -p 8080" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result?.service.config?.port).toBe(8080);
  });

  it("returns undefined port when not specified", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "node server.js" },
      }),
    );
    writeFileSync(join(testDir, "bun.lock"), "");

    const result = inferNodeProject(testDir);

    expect(result?.service.config?.port).toBeUndefined();
  });
});
