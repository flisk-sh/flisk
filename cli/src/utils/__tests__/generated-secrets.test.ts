// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeResource } from "../../test-support/index.js";
import { parseEnv } from "../env-validator.js";
import { ensureGeneratedSecrets, parseGenerateSpec } from "../generated-secrets.js";
import { secretsErrors } from "../service-manifest.js";

const api = (generate: Record<string, string>) =>
  makeResource("api", "backend", { secrets: { generate } });

describe("ensureGeneratedSecrets", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-gen-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const envPath = () => join(root, ".env");
  const quiet = { env: {} as NodeJS.ProcessEnv };

  it("creates .env with mode 0600 and the right value lengths", () => {
    const names = ensureGeneratedSecrets(
      root,
      [api({ A_HEX: "hex:32", B_B64: "base64:32" })],
      quiet,
    );
    expect(names).toEqual(["A_HEX", "B_B64"]);
    expect((statSync(envPath()).mode & 0o777).toString(8)).toBe("600");
    const values = parseEnv(readFileSync(envPath(), "utf-8"));
    expect(values.get("A_HEX")).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(values.get("B_B64") ?? "", "base64")).toHaveLength(32);
  });

  it("generates once: a second run changes nothing", () => {
    const resources = [api({ KEY: "hex:16" })];
    ensureGeneratedSecrets(root, resources, quiet);
    const first = readFileSync(envPath(), "utf-8");
    expect(ensureGeneratedSecrets(root, resources, quiet)).toEqual([]);
    expect(readFileSync(envPath(), "utf-8")).toBe(first);
  });

  it("keeps existing lines and values, appending only what is missing", () => {
    writeFileSync(envPath(), "# mine\nKEEP=1\nKEY=mine-already", { mode: 0o644 });
    const names = ensureGeneratedSecrets(root, [api({ KEY: "hex:16", NEW: "hex:16" })], quiet);
    expect(names).toEqual(["NEW"]);
    const text = readFileSync(envPath(), "utf-8");
    expect(text.startsWith("# mine\nKEEP=1\nKEY=mine-already\n")).toBe(true);
    expect(parseEnv(text).get("KEY")).toBe("mine-already");
    expect(parseEnv(text).get("NEW")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("leaves a name that the shell already sets, and writes nothing on a dry run", () => {
    expect(ensureGeneratedSecrets(root, [api({ KEY: "hex:16" })], { env: { KEY: "x" } })).toEqual(
      [],
    );
    expect(existsSync(envPath())).toBe(false);
    expect(
      ensureGeneratedSecrets(root, [api({ KEY: "hex:16" })], { ...quiet, dryRun: true }),
    ).toEqual(["KEY"]);
    expect(existsSync(envPath())).toBe(false);
  });

  it("never returns the value", () => {
    const names = ensureGeneratedSecrets(root, [api({ KEY: "hex:16" })], quiet);
    const value = parseEnv(readFileSync(envPath(), "utf-8")).get("KEY") as string;
    expect(JSON.stringify(names)).not.toContain(value);
  });
});

describe("secrets.generate validation", () => {
  const file = "services/api/service.json";
  it("accepts good specs", () => {
    expect(secretsErrors({ secrets: { generate: { A: "hex:8", B: "base64:128" } } }, file)).toEqual(
      [],
    );
  });
  it.each([
    [{ A: "uuid:32" }, "not a spec"],
    [{ A: "hex:7" }, "between 8 and 128"],
    [{ A: "base64:129" }, "between 8 and 128"],
    [{ A: 32 }, "not a spec"],
    [{ "1A": "hex:16" }, "not an environment variable name"],
  ])("rejects %j", (generate, message) => {
    const errors = secretsErrors({ secrets: { generate } }, file);
    expect(errors.join("\n")).toContain(message);
  });
  it("refuses a generated name that also has a fixed value in env or params", () => {
    for (const field of ["env", "params"]) {
      const errors = secretsErrors(
        { secrets: { generate: { KEY: "hex:16" } }, [field]: { KEY: "fixed" } },
        file,
      );
      expect(errors.join("\n")).toContain(`${field}.KEY: also generated`);
    }
  });
  it("parses specs", () => {
    expect(parseGenerateSpec("hex:32")).toEqual({ format: "hex", bytes: 32 });
  });
});
