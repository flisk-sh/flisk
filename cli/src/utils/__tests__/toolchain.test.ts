// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import {
  checkToolchains,
  declaredToolchain,
  findToolchainMismatches,
  installedVersion,
  type VersionProbe,
  versionMatches,
} from "../toolchain.js";

/** A probe that answers like the real programs, for the versions given. */
function probe(installed: Record<string, string>): VersionProbe {
  const outputs: Record<string, (v: string) => string> = {
    node: (v) => `v${v}\n`,
    bun: (v) => `${v}\n`,
    python3: (v) => `Python ${v}\n`,
    go: (v) => `go version go${v} darwin/arm64\n`,
  };
  return (program) => {
    const version = installed[program];
    return version && outputs[program]
      ? (outputs[program] as (v: string) => string)(version)
      : null;
  };
}

function service(
  name: string,
  config: Record<string, unknown>,
  files: Record<string, string> = {},
) {
  const dir = createTempDir();
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
  return { ...makeResource(name, "backend", { command: "node server.js", ...config }), path: dir };
}

describe("service toolchains (#2876)", () => {
  it("matches every part the wanted version gives", () => {
    expect(versionMatches("24", "24.1.0")).toBe(true);
    expect(versionMatches("3.12", "3.12.4")).toBe(true);
    expect(versionMatches("3.12", "3.11.9")).toBe(false);
    expect(versionMatches("24", "22.9.0")).toBe(false);
    expect(versionMatches("1.3.2", "1.3.2")).toBe(true);
  });

  it("reads the installed version from each tool's own output", () => {
    const fake = probe({ node: "24.1.0", python3: "3.12.4", go: "1.23.1", bun: "1.3.11" });
    expect(installedVersion("node", fake)).toBe("24.1.0");
    expect(installedVersion("python", fake)).toBe("3.12.4");
    expect(installedVersion("go", fake)).toBe("1.23.1");
    expect(installedVersion("bun", fake)).toBe("1.3.11");
    expect(installedVersion("deno", fake)).toBeNull();
  });

  it("takes service.json first, then a version file as a hint, and ignores names it cannot compare", () => {
    expect(declaredToolchain(service("a", { toolchain: "node@24" }))).toEqual({
      tool: "node",
      version: "24",
      source: "service.json",
      isHint: false,
    });
    expect(declaredToolchain(service("b", {}, { ".nvmrc": "v22.11.0\n" }))).toEqual({
      tool: "node",
      version: "22.11.0",
      source: ".nvmrc",
      isHint: true,
    });
    expect(declaredToolchain(service("c", {}, { ".python-version": "3.12\n" }))).toMatchObject({
      tool: "python",
      version: "3.12",
    });
    expect(declaredToolchain(service("d", {}, { ".nvmrc": "lts/*\n" }))).toBeNull();
    expect(declaredToolchain(service("e", { toolchain: "node 24" }))).toMatchObject({
      problem: expect.stringContaining('"toolchain" must look like "node@24"'),
    });
  });

  it("fails on a binding mismatch, naming service, wanted and found versions", () => {
    const result = checkToolchains(
      [service("api", { toolchain: "node@24" }), service("worker", { toolchain: "python@3.12" })],
      probe({ node: "20.11.0" }),
      () => false,
    );
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("api: wants node@24 (service.json), node 20.11.0 is on PATH");
    expect(result.message).toContain(
      "worker: wants python@3.12 (service.json), python is not installed",
    );
  });

  it("only warns for a version-file hint, and passes when everything matches", () => {
    const hint = checkToolchains(
      [service("web", {}, { ".nvmrc": "22\n" })],
      probe({ node: "24.1.0" }),
    );
    expect(hint).toMatchObject({ didPass: true, isWarning: true });
    expect(hint.message).toContain("web: wants node@22 (.nvmrc), node 24.1.0 is on PATH");

    const ok = checkToolchains(
      [service("api", { toolchain: "node@24" }), service("plain", {})],
      probe({ node: "24.1.0" }),
    );
    expect(ok).toMatchObject({
      didPass: true,
      message: expect.stringContaining("finds that version"),
    });
  });

  it("tells a missing program from one that did not report its version", () => {
    const silent: VersionProbe = () => "error: Missing script to execute\n";
    const [unreadable] = findToolchainMismatches(
      [service("a", { toolchain: "node@24" })],
      silent,
      () => true,
    );
    expect(unreadable).toMatchObject({ found: null, isUnreadable: true });
    expect(
      checkToolchains([service("a", { toolchain: "node@24" })], silent, () => true).message,
    ).toContain("a: wants node@24 (service.json), the node on PATH did not report a version");
    const [missing] = findToolchainMismatches(
      [service("b", { toolchain: "node@24" })],
      probe({}),
      () => false,
    );
    expect(missing?.isUnreadable).toBeUndefined();
  });

  it("reports an unknown tool instead of guessing", () => {
    const [finding] = findToolchainMismatches([service("x", { toolchain: "cobol@85" })], probe({}));
    expect(finding?.problem).toMatch(/unknown tool "cobol"/);
  });

  it("asks each tool for its version once, however many services name it", () => {
    let calls = 0;
    const counting: VersionProbe = (program, args) => {
      calls += 1;
      return probe({ node: "24.1.0" })(program, args);
    };
    mkdirSync(createTempDir(), { recursive: true });
    findToolchainMismatches(
      [service("a", { toolchain: "node@24" }), service("b", { toolchain: "node@22" })],
      counting,
    );
    expect(calls).toBe(1);
  });
});
