// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMasterConfigs } from "../../cli/src/generator/template-engine.js";
import { tiltAvailable } from "../../cli/src/test-support/index.js";
import { hasExtensionLayout } from "../../cli/src/utils/runtime-layout.js";
import { cleanEnv, EXTENSION_DIRS, repoRoot, run } from "./helpers.js";

// Review findings 3, 4 and 5: mixed layouts, older CLIs, and ext://flisk-cli against a source checkout.

const hasTilt = tiltAvailable();

let scratch: string;
beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-layout-compat-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function writeProject(projectRoot: string): void {
  fs.mkdirSync(path.join(projectRoot, ".flisk"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, ".flisk", "project.json"),
    JSON.stringify({
      version: "1.0",
      project: { name: "compat-proj", version: "1.0.0" },
      phases: {
        pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: [] },
        alpha: { name: "Alpha", description: "", enabledStacks: [] },
        beta: { name: "Beta", description: "", enabledStacks: [] },
        out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
      },
      optional_infra: {
        monitoring: false,
        elk: false,
        debezium: false,
        golden_image: false,
        verdaccio: false,
      },
      discovery: { paths: ["services/*/*"] },
      overrides: {},
    }),
  );
}

/** A copy of the real extension in the chosen layout. */
function copyExtension(target: string, layout: "nested" | "flat"): void {
  const base = layout === "nested" ? path.join(target, "runtime") : target;
  fs.mkdirSync(base, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "runtime", "Tiltfile"), path.join(base, "Tiltfile"));
  for (const dir of EXTENSION_DIRS) {
    fs.cpSync(path.join(repoRoot, "runtime", dir), path.join(base, dir), { recursive: true });
  }
}

async function vendorFrom(source: string): Promise<{ warnings: string; vendored: string }> {
  const project = path.join(scratch, "project");
  writeProject(project);
  const previous = process.env.FLISK_EXTENSION_SOURCE;
  process.env.FLISK_EXTENSION_SOURCE = source;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await generateMasterConfigs(project, { quiet: true });
  } finally {
    if (previous === undefined) delete process.env.FLISK_EXTENSION_SOURCE;
    else process.env.FLISK_EXTENSION_SOURCE = previous;
  }
  return {
    warnings: warn.mock.calls.map((call) => String(call[0])).join("\n"),
    vendored: path.join(project, ".flisk", ".flisk-out", "flisk-cli-ext"),
  };
}

describe("mixed and incomplete runtime layouts (finding 3)", () => {
  const MARKER = "# stale-tree-marker";

  it("warns about a stale tree that mixes nested and flat entries, names the leftover, and does not vendor from it", async () => {
    const source = path.join(scratch, "mixed");
    copyExtension(source, "nested");
    fs.appendFileSync(path.join(source, "runtime", "Tiltfile"), `\n${MARKER}\n`);
    fs.rmSync(path.join(source, "runtime", "discovery"), { recursive: true });
    fs.cpSync(path.join(repoRoot, "runtime", "discovery"), path.join(source, "discovery"), {
      recursive: true,
    });
    expect(hasExtensionLayout(source)).toBe(false);
    const { warnings, vendored } = await vendorFrom(source);
    expect(warnings).toContain("FLISK_EXTENSION_SOURCE is not a usable Flisk extension");
    expect(warnings).toContain(
      "mixes the nested runtime/ layout with flat entries (discovery only at the root)",
    );
    // The repo's own complete copy is used instead, never the stale tree.
    expect(fs.readFileSync(path.join(vendored, "Tiltfile"), "utf-8")).not.toContain(MARKER);
  }, 60_000);

  it("names every directory a half-copied bundle lacks instead of failing in the middle of the copy", async () => {
    const source = path.join(scratch, "partial");
    copyExtension(source, "flat");
    fs.appendFileSync(path.join(source, "Tiltfile"), `\n${MARKER}\n`);
    fs.rmSync(path.join(source, "specs"), { recursive: true });
    fs.rmSync(path.join(source, "ext"), { recursive: true });
    const { warnings, vendored } = await vendorFrom(source);
    expect(warnings).toContain("is missing specs, ext");
    expect(fs.readFileSync(path.join(vendored, "Tiltfile"), "utf-8")).not.toContain(MARKER);
    for (const dir of EXTENSION_DIRS)
      expect(fs.existsSync(path.join(vendored, dir)), dir).toBe(true);
  }, 60_000);

  it("vendors a complete nested tree without any warning", async () => {
    const nested = path.join(scratch, "nested");
    copyExtension(nested, "nested");
    fs.appendFileSync(path.join(nested, "runtime", "Tiltfile"), `\n${MARKER}\n`);
    const first = await vendorFrom(nested);
    expect(first.warnings).toBe("");
    expect(fs.readFileSync(path.join(first.vendored, "Tiltfile"), "utf-8")).toContain(MARKER);
    expect(fs.existsSync(path.join(first.vendored, "runtime"))).toBe(false);
  }, 60_000);
});

// The resolver an older CLI used: the flat layout only, no runtime/ lookup.
function legacyCliCanVendor(source: string): boolean {
  return (
    fs.existsSync(path.join(source, "Tiltfile")) &&
    EXTENSION_DIRS.every((dir) => fs.existsSync(path.join(source, dir)))
  );
}

describe("older CLI compatibility (finding 4)", () => {
  it("lets an older CLI vendor from a flat bundle, which is what releases and the npm package ship", () => {
    const bundle = path.join(scratch, "bundle");
    copyExtension(bundle, "flat");
    expect(legacyCliCanVendor(bundle)).toBe(true);
    expect(hasExtensionLayout(bundle)).toBe(true);
  });

  it("cannot let an older CLI vendor from a source checkout: the layout break is real and documented", () => {
    const checkout = path.join(scratch, "checkout");
    copyExtension(checkout, "nested");
    expect(legacyCliCanVendor(checkout)).toBe(false);
    expect(hasExtensionLayout(checkout)).toBe(true);
    const doc = fs.readFileSync(path.join(repoRoot, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(doc).toContain("Older CLIs");
    expect(doc).toContain("cannot vendor from a source checkout");
  });

  it("keeps the vendored output flat, so an older CLI and the generated Tiltfile still agree on paths", async () => {
    const checkout = path.join(scratch, "checkout");
    copyExtension(checkout, "nested");
    const { vendored } = await vendorFrom(checkout);
    expect(legacyCliCanVendor(vendored)).toBe(true);
    const tiltfile = fs.readFileSync(
      path.join(repoRoot, "cli", "templates", "Tiltfile.hbs"),
      "utf-8",
    );
    expect(tiltfile).toContain("repo_path=''");
  }, 60_000);
});

describe.skipIf(!hasTilt)("ext://flisk-cli from a source checkout (finding 5)", () => {
  const tiltfile = (repo: string, repoPath: string) =>
    [
      `v1alpha1.extension_repo(name='flisk-cli-local', url='file://${repo}')`,
      `v1alpha1.extension(name='flisk-cli', repo_name='flisk-cli-local', repo_path='${repoPath}')`,
      "load('ext://flisk-cli', 'Utils', 'Manifest', 'resource_defers_start')",
      "",
    ].join("\n");
  const evaluate = (repo: string, repoPath: string) => {
    const dir = path.join(scratch, `eval-${repoPath || "root"}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "Tiltfile"), tiltfile(repo, repoPath));
    return run("tilt", ["alpha", "tiltfile-result", "-f", "Tiltfile"], dir, cleanEnv());
  };

  it("loads the extension with repo_path='runtime'", () => {
    const repo = path.join(scratch, "repo");
    copyExtension(repo, "nested");
    const result = evaluate(repo, "runtime");
    expect(result.status, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as { Error: string | null }).Error).toBeNull();
  }, 120_000);

  it("fails with a clear error when repo_path is empty, because the repository root has no Tiltfile", () => {
    const repo = path.join(scratch, "repo");
    copyExtension(repo, "nested");
    expect(fs.existsSync(path.join(repoRoot, "Tiltfile"))).toBe(false);
    const result = evaluate(repo, "");
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("no extension tiltfile found");
  }, 120_000);

  it("loads the extension with an empty repo_path from a flat bundle, as generated projects do", () => {
    const repo = path.join(scratch, "flat");
    copyExtension(repo, "flat");
    const result = evaluate(repo, "");
    expect(result.status, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as { Error: string | null }).Error).toBeNull();
  }, 120_000);

  it("documents repo_path='runtime' for source checkouts", () => {
    const doc = fs.readFileSync(path.join(repoRoot, "docs", "ARCHITECTURE.md"), "utf-8");
    expect(doc).toContain("repo_path='runtime'");
    const header = fs.readFileSync(path.join(repoRoot, "runtime", "Tiltfile"), "utf-8");
    expect(header).toContain("repo_path='runtime'");
  });
});
