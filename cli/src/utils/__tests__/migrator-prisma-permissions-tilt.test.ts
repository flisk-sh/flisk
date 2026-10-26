// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { engineFile, evaluateStarlark, tiltAvailable } from "../../test-support/starlark.js";

// The migrator image runs `prisma generate` as `bun`. The `flisk resource --feature prisma` scaffold writes the client
// to `../generated/prisma`, so Prisma creates `/app/generated`, which failed with EACCES while root owned `/app`
// (flisk-sh/demos run 40146025135 on ubuntu-latest).

const filesystemSetup = engineFile(
  "topologies/platform/docker/layers/prisma/filesystem_setup.star",
);

function renderPermissions(): string {
  const run = evaluateStarlark(filesystemSetup, {
    args: `load(${JSON.stringify(filesystemSetup)}, "prisma_dir_and_permissions")
local("cat > fragment.txt", quiet = True, stdin = prisma_dir_and_permissions())
`,
  });
  expect(run.status, run.stderr).toBe(0);
  return readFileSync(join(run.dir, "fragment.txt"), "utf-8");
}

const dockerReady =
  spawnSync("docker", ["info"], { encoding: "utf-8", timeout: 30_000 }).status === 0;

const buildDirs: string[] = [];
afterEach(() => {
  for (const dir of buildDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!tiltAvailable())("migrator Prisma output permissions", () => {
  it("gives the bun user ownership of /app itself", () => {
    expect(renderPermissions()).toContain("chown bun:bun /app &&");
  });

  it.skipIf(!dockerReady)(
    "lets the bun user create a Prisma output directory directly under /app",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "flisk-migrator-perms-"));
      buildDirs.push(dir);
      // Same shape as l4_migrator_runtime: root-owned /app with the copied prisma folder, the fragment as root,
      // then the directory `prisma generate` creates for `output = "../generated/prisma"`, as bun.
      writeFileSync(
        join(dir, "Dockerfile"),
        `FROM alpine:3.20
RUN adduser -D bun
WORKDIR /app
RUN mkdir -p /app/prisma && touch /app/prisma.config.ts
${renderPermissions()}USER bun
RUN mkdir -p /app/generated/prisma
`,
      );
      const build = spawnSync("docker", ["build", "-q", dir], {
        encoding: "utf-8",
        timeout: 180_000,
      });
      const image = build.stdout.trim();
      if (image) spawnSync("docker", ["image", "rm", image], { encoding: "utf-8" });
      expect(build.status, build.stderr).toBe(0);
    },
    200_000,
  );
});
