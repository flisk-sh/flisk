// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { createTempProject } from "../../test-support/index.js";
import { FliskError } from "../errors.js";
import {
  assertValidSecretName,
  createKeychain,
  KEYCHAIN_UNSUPPORTED_MESSAGE,
  type KeychainRequest,
  keychainProjectName,
} from "../keychain.js";

const CANARY = "canary-value-never-print-7c1f";

function fakeStore(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const requests: KeychainRequest[] = [];
  return {
    store,
    requests,
    runner: (request: KeychainRequest): string => {
      requests.push(request);
      const name =
        request.command === "security"
          ? (request.args[request.args.indexOf("-a") + 1] ?? "")
          : (request.args.at(-1) ?? "");
      if (request.command === "security") {
        if (request.args[0] === "find-generic-password") {
          const value = store.get(name);
          if (value === undefined) throw new Error("not found");
          return `${value}\n`;
        }
        if (request.args[0] === "dump-keychain") {
          return [...store.keys()]
            .map((key) => `attributes:\n    "acct"<blob>="${key}"\n    "svce"<blob>="flisk.demo"`)
            .join("\n");
        }
        if (request.args[0] === "add-generic-password") {
          store.set(name, request.args.at(-1) ?? "");
          return "";
        }
        if (request.args[0] === "delete-generic-password") {
          store.delete(name);
          return "";
        }
      }
      if (request.command === "secret-tool") {
        if (request.args[0] === "lookup") {
          const value = store.get(name);
          if (value === undefined) throw new Error("not found");
          return `${value}\n`;
        }
        if (request.args[0] === "search") {
          return [...store.keys()].map((key) => `attribute.flisk.secret = ${key}`).join("\n");
        }
        if (request.args[0] === "store") {
          store.set(name, request.stdin ?? "");
          return "";
        }
        if (request.args[0] === "clear") {
          store.delete(name);
          return "";
        }
      }
      throw new Error("unexpected request");
    },
  };
}

describe("keychain", () => {
  it("uses the project name from .flisk/project.json for every checkout", () => {
    const root = createTempProject({ projectJson: { project: { name: "Lychee" } } });
    expect(keychainProjectName(root)).toBe("lychee");
    const chain = createKeychain({ projectRoot: root, platform: "linux", runner: () => "" });
    expect(chain.project).toBe("lychee");
  });

  it("stores on Linux through stdin so the value is never in argv", () => {
    const fake = fakeStore();
    const chain = createKeychain({ project: "demo", platform: "linux", runner: fake.runner });
    chain.set("CANARY_KEY", CANARY);
    expect(chain.get("CANARY_KEY")).toBe(CANARY);
    const set = fake.requests.find((request) => request.args[0] === "store");
    expect(set?.stdin).toBe(CANARY);
    expect(set?.args.join(" ")).not.toContain(CANARY);
    expect(chain.list()).toEqual(["CANARY_KEY"]);
    chain.unset("CANARY_KEY");
    expect(chain.get("CANARY_KEY")).toBeUndefined();
    expect(chain.list()).toEqual([]);
  });

  it("finds a value on macOS and treats a missing entry as undefined", () => {
    const fake = fakeStore({ CANARY_KEY: CANARY });
    const chain = createKeychain({ project: "demo", platform: "darwin", runner: fake.runner });
    expect(chain.get("CANARY_KEY")).toBe(CANARY);
    expect(chain.get("MISSING_KEY")).toBeUndefined();
    expect(fake.requests[0]?.args).toEqual([
      "find-generic-password",
      "-a",
      "CANARY_KEY",
      "-s",
      "flisk.demo",
      "-w",
    ]);
  });

  it("returns only names from list and never the value", () => {
    const fake = fakeStore({ CANARY_KEY: CANARY, OTHER: "second-value" });
    const chain = createKeychain({ project: "demo", platform: "linux", runner: fake.runner });
    expect(chain.list()).toEqual(["CANARY_KEY", "OTHER"]);
    expect(JSON.stringify(chain.list())).not.toContain(CANARY);
  });

  it("prints the exact unsupported message and falls back to no-op on Windows", () => {
    const onUnsupported = vi.fn();
    const runner = vi.fn(() => "");
    const chain = createKeychain({ project: "demo", platform: "win32", runner, onUnsupported });
    expect(onUnsupported).toHaveBeenCalledWith(KEYCHAIN_UNSUPPORTED_MESSAGE);
    expect(chain.get("CANARY_KEY")).toBeUndefined();
    expect(chain.list()).toEqual([]);
    chain.set("CANARY_KEY", CANARY);
    chain.unset("CANARY_KEY");
    expect(runner).not.toHaveBeenCalled();
  });

  it("rejects a name that is not an environment variable name", () => {
    assertValidSecretName("VALID_NAME");
    expect(() => assertValidSecretName("MY-KEY")).toThrow(FliskError);
    expect(() => assertValidSecretName("NAME;rm -rf")).toThrow(FliskError);
  });

  it("does not include the value in a tool failure message", () => {
    const throwWithValue = (): string => {
      throw new Error(`security: ${CANARY}`);
    };
    const chain = createKeychain({ project: "demo", platform: "darwin", runner: throwWithValue });
    let caught: unknown;
    try {
      chain.set("CANARY_KEY", CANARY);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FliskError);
    expect((caught as Error).message).not.toContain(CANARY);
    expect((caught as FliskError).suggestions?.join(" ")).not.toContain(CANARY);
  });
});
