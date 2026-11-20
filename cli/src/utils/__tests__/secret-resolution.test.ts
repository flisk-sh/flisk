// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTempDir, createTempProject } from "../../test-support/index.js";
import { FliskError } from "../errors.js";
import { KEYCHAIN_UNSUPPORTED_MESSAGE, type Keychain } from "../keychain.js";
import { resolveSecrets } from "../secret-resolution.js";

const CANARY = "canary-value-never-print-4ad2";

function fakeKeychain(values: Record<string, string> = {}): Keychain & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    project: "demo",
    platform: "linux",
    lookups,
    get(name) {
      lookups.push(name);
      return values[name];
    },
    set: () => {},
    unset: () => {},
    list: () => Object.keys(values),
  };
}

describe("resolveSecrets", () => {
  it("is additive: env-file values win and keychain fills the gaps", () => {
    const root = createTempProject();
    writeFileSync(join(root, ".env"), `FROM_FILE=${CANARY}\n`);
    const keychain = fakeKeychain({ FROM_FILE: "wrong", FROM_KEYCHAIN: "keychain-value" });
    const values = resolveSecrets("keychain", root, ["FROM_FILE", "FROM_KEYCHAIN", "MISSING"], {
      env: {},
      keychain,
    });
    expect(values).toEqual({ FROM_FILE: CANARY, FROM_KEYCHAIN: "keychain-value" });
    expect(keychain.lookups).toEqual(["FROM_KEYCHAIN", "MISSING"]);
  });

  it("lets the shell override the env file and the keychain", () => {
    const root = createTempProject();
    writeFileSync(join(root, ".env"), "A_KEY=from-file\n");
    const values = resolveSecrets("keychain", root, ["A_KEY"], {
      env: { A_KEY: "from-shell" },
      keychain: fakeKeychain({ A_KEY: "from-keychain" }),
    });
    expect(values).toEqual({ A_KEY: "from-shell" });
  });

  it("reads the explicit env file of the run, not just the project .env", () => {
    const root = createTempProject();
    writeFileSync(join(root, ".env"), "A_KEY=from-project\n");
    writeFileSync(join(root, "chosen.env"), `A_KEY=${CANARY}\n`);
    const values = resolveSecrets("keychain", root, ["A_KEY"], {
      env: {},
      envFilePath: join(root, "chosen.env"),
      keychain: fakeKeychain(),
    });
    expect(values).toEqual({ A_KEY: CANARY });
  });

  it("does not consult the keychain for the default env-file provider", () => {
    const root = createTempProject();
    const keychain = fakeKeychain({ A_KEY: CANARY });
    expect(resolveSecrets("", root, ["A_KEY"], { env: {}, keychain })).toEqual({});
    expect(keychain.lookups).toEqual([]);
  });

  it("returns nothing for infisical in the free CLI", () => {
    const root = createTempProject();
    const keychain = fakeKeychain({ A_KEY: CANARY });
    expect(resolveSecrets("infisical", root, ["A_KEY"], { env: {}, keychain })).toEqual({});
    expect(keychain.lookups).toEqual([]);
  });

  it("rejects an unknown provider", () => {
    const root = createTempDir();
    expect(() => resolveSecrets("keychan", root, ["A_KEY"], { env: {} })).toThrow(FliskError);
  });

  it("prints the required Windows message and keeps env-file values", () => {
    const root = createTempProject();
    writeFileSync(join(root, ".env"), `A_KEY=${CANARY}\n`);
    const onUnsupported = vi.fn();
    const values = resolveSecrets("keychain", root, ["A_KEY", "MISSING"], {
      env: {},
      platform: "win32",
      onUnsupported,
    });
    expect(onUnsupported).toHaveBeenCalledWith(KEYCHAIN_UNSUPPORTED_MESSAGE);
    expect(values).toEqual({ A_KEY: CANARY });
  });

  it("ignores a name that is not declared as a secret", () => {
    const root = createTempProject();
    const keychain = fakeKeychain({ "not a name": CANARY });
    expect(resolveSecrets("keychain", root, ["not a name"], { env: {}, keychain })).toEqual({});
    expect(keychain.lookups).toEqual([]);
  });
});
