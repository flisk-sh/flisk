// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { engineFile } from "../../test-support/starlark.js";

// A cold `flisk demo` sat for 7+ minutes in the migrator image: `bun install` ran @prisma/engines' postinstall, whose
// engine download stalled (20 MB partial file, no progress) and has no timeout of its own. Every `bun install` the
// engine generates for an image build is time-boxed and retried, and a retry is fast because of the cache mount.

const SOURCES = [
  "topologies/platform/docker/layers/prisma/prisma_build.star",
  "topologies/platform/docker/layers/l3_builder_layers.star",
];

/** The `until ...; done` loop of the generated `bun install` RUN line, as the shell will see it. */
function installLoop(source: string): string {
  const line = readFileSync(engineFile(source), "utf-8")
    .split("\n")
    .find((l) => l.includes("bun install --production") && l.includes("RUN "));
  expect(line, `${source} has no bun install RUN line`).toBeDefined();
  const match = /(until .*?; done)/.exec(line as string);
  expect(match, `${source}: the bun install is not in a retry loop`).not.toBeNull();
  // The Starlark string escapes quotes as \" and newlines as \n.
  return (match as RegExpExecArray)[1].replace(/\\"/g, '"');
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs the loop with a `timeout` that just runs its command and a `bun` that fails `failures` times first. */
function run(loop: string, failures: number): { status: number | null; calls: number } {
  const dir = mkdtempSync(join(tmpdir(), "install-retry-"));
  dirs.push(dir);
  const stub = (name: string, body: string) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  stub("timeout", 'shift; exec "$@"');
  stub(
    "bun",
    `n=$(cat "${dir}/count" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${dir}/count"; [ "$n" -gt ${failures} ]`,
  );
  const result = spawnSync("sh", ["-c", `n=0 && ${loop}`], {
    env: { PATH: `${dir}:${process.env.PATH}` },
    encoding: "utf-8",
  });
  const calls = Number(readFileSync(join(dir, "count"), "utf-8").trim());
  return { status: result.status, calls };
}

describe("generated bun install steps survive a stalled install", () => {
  for (const source of SOURCES) {
    describe(source, () => {
      it("time-boxes each attempt", () => {
        expect(installLoop(source)).toMatch(/timeout \d+ bun install/);
      });

      it("retries a failed attempt and succeeds", () => {
        expect(run(installLoop(source), 2)).toEqual({ status: 0, calls: 3 });
      });

      it("gives up after three attempts", () => {
        expect(run(installLoop(source), 99)).toEqual({ status: 1, calls: 3 });
      });
    });
  }
});
