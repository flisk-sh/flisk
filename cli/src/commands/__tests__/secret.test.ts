// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempProject } from "../../test-support/index.js";
import type { Keychain } from "../../utils/keychain.js";
import {
  assertDeclaredSecret,
  listSecrets,
  type SecretCommandDeps,
  setSecret,
  unsetSecret,
} from "../secret.js";

const CANARY = "canary-value-never-print-08b6";
const originalCwd = process.cwd();

function project(): string {
  const root = createTempProject({
    projectJson: { project: { name: "secret-test" } },
    resources: {
      api: { appType: "backend", schemaVersion: 1, secrets: { required: ["CANARY_KEY"] } },
    },
  });
  process.chdir(root);
  return root;
}

function fakeKeychain(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    chain: {
      project: "secret-test",
      platform: "linux",
      get: (name: string) => store.get(name),
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      unset: (name: string) => {
        store.delete(name);
      },
      list: () => [...store.keys()].sort(),
    } satisfies Keychain,
  };
}

function piped(value: string): NodeJS.ReadStream {
  return {
    isTTY: false,
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  } as unknown as NodeJS.ReadStream;
}

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

describe("flisk secret", () => {
  it("stores a piped value without ever printing it", async () => {
    project();
    const { store, chain } = fakeKeychain();
    const lines: string[] = [];
    const deps: SecretCommandDeps = {
      keychain: chain,
      stdin: piped(CANARY),
      stdout: (t) => lines.push(t),
    };
    await setSecret("CANARY_KEY", deps);
    expect(store.get("CANARY_KEY")).toBe(CANARY);
    expect(lines.join("\n")).not.toContain(CANARY);
    expect(lines.join("\n")).toContain("CANARY_KEY");
  });

  it("registers only the name argument, never a value argument", async () => {
    project();
    const { secretCommand } = await import("../secret.js");
    const set = secretCommand.commands.find((command) => command.name() === "set");
    expect(set?.registeredArguments.map((argument) => argument.name())).toEqual(["name"]);
    expect(secretCommand.commands.flatMap((command) => command.registeredArguments)).toHaveLength(
      2,
    );
  });

  it("removes a stored value and lists names only", async () => {
    project();
    const { store, chain } = fakeKeychain({ CANARY_KEY: CANARY });
    const lines: string[] = [];
    const deps: SecretCommandDeps = { keychain: chain, stdout: (t) => lines.push(t) };
    expect(listSecrets(deps)).toEqual(["CANARY_KEY"]);
    unsetSecret("CANARY_KEY", deps);
    expect(store.has("CANARY_KEY")).toBe(false);
    expect(listSecrets(deps)).toEqual([]);
    expect(lines.join("\n")).not.toContain(CANARY);
  });

  it("refuses a name that is not declared in secrets", () => {
    project();
    expect(() => assertDeclaredSecret("NOT_DECLARED", project())).toThrow(/not declared/);
  });

  it("refuses an empty piped value", async () => {
    project();
    const { chain } = fakeKeychain();
    await expect(
      setSecret("CANARY_KEY", { keychain: chain, stdin: piped(""), stdout: () => {} }),
    ).rejects.toThrow(/No value/);
  });
});
