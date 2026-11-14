// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import {
  generatedFieldErrorsForFile,
  validateServiceManifestFile,
} from "../../utils/service-manifest.js";

const promptMocks = vi.hoisted(() => ({
  promptSelect: vi.fn(),
  promptText: vi.fn(),
  promptConfirm: vi.fn(),
  promptMultiSelect: vi.fn(),
}));
vi.mock("../../utils/prompt.js", () => promptMocks);

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

const originalCwd = process.cwd();

// #4162: `flisk resource --base-path` wrote values service.json's schema rejects, so `flisk config verify` failed after a
// create that reported success.
describe("--base-path validation", () => {
  describe("resolveBasePath", () => {
    it("keeps a path the schema accepts", async () => {
      const { resolveBasePath } = await import("../../commands/resource.js");
      expect(resolveBasePath("/storefront")).toBe("/storefront");
      expect(resolveBasePath("/shop/web-2")).toBe("/shop/web-2");
    });

    it("adds the leading slash the engine would add at runtime", async () => {
      const { resolveBasePath } = await import("../../commands/resource.js");
      expect(resolveBasePath("no-slash")).toBe("/no-slash");
    });

    it("treats an absent or empty value as the default", async () => {
      const { resolveBasePath } = await import("../../commands/resource.js");
      expect(resolveBasePath(undefined)).toBeUndefined();
      expect(resolveBasePath("")).toBeUndefined();
    });

    it.each([
      ["Bad Path/x y", "/bad-path/x-y"],
      ["/Storefront", "/storefront"],
      ["/shop_web", "/shop-web"],
      ["/a\nb: c", "/a-b-c"],
      ["   ", "/storefront"],
      ["!!!", "/storefront"],
    ])("refuses %j and suggests %s", async (value, suggestion) => {
      const { resolveBasePath } = await import("../../commands/resource.js");
      let thrown: unknown;
      try {
        resolveBasePath(value);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain("--base-path must be a path such as /storefront");
      expect((thrown as { suggestions?: string[] }).suggestions).toContain(
        `Try --base-path ${suggestion}`,
      );
      expect(resolveBasePath(suggestion)).toBe(suggestion);
    });
  });

  describe("flisk resource --type frontend --base-path", () => {
    let tempDir: string;

    beforeEach(() => {
      vi.clearAllMocks();
      tempDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-base-path-test-")));
      mkdirSync(join(tempDir, ".flisk"), { recursive: true });
      writeFileSync(
        join(tempDir, ".flisk", "project.json"),
        JSON.stringify({
          version: "1.0.0",
          project: { name: "test", version: "1.0.0" },
          phases: Object.fromEntries(
            ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
              name,
              { name, description: "", enabledStacks: [] },
            ]),
          ),
          optional_infra: {
            monitoring: false,
            elk: false,
            golden_image: false,
            verdaccio: false,
          },
          discovery: { paths: ["services/**"] },
        }),
      );
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      clearDiscoveryCache();
    });

    async function runFreshResource(
      args: string[],
      options: { isTTY?: boolean } = {},
    ): Promise<{ exitCode: number | undefined; errorText: string }> {
      vi.resetModules();
      const { resourceCommand } = await import("../../commands/resource.js");
      clearDiscoveryCache();

      const errors: string[] = [];
      const errorSpy = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
        errors.push(parts.map(String).join(" "));
      });
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { exit } = captureExit();
      const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
      if (options.isTTY !== undefined) {
        Object.defineProperty(process.stdin, "isTTY", {
          value: options.isTTY,
          configurable: true,
        });
      }
      let exitCode: number | undefined;
      try {
        await resourceCommand
          .parseAsync(["node", "flisk", ...args], { from: "node" })
          .catch(() => {});
        exitCode = exit.mock.calls.at(-1)?.[0] as number | undefined;
      } finally {
        if (options.isTTY !== undefined) {
          if (originalTTY) {
            Object.defineProperty(process.stdin, "isTTY", originalTTY);
          } else {
            Object.defineProperty(process.stdin, "isTTY", {
              value: undefined,
              configurable: true,
            });
          }
        }
        errorSpy.mockRestore();
        logSpy.mockRestore();
        exit.mockRestore();
      }
      return { exitCode, errorText: errors.join("\n") };
    }

    async function createFrontend(name: string, basePath: string): Promise<string> {
      const { exitCode, errorText } = await runFreshResource([
        name,
        "--type",
        "frontend",
        "--stack",
        "shop",
        "--base-path",
        basePath,
        "--yes",
      ]);
      expect(exitCode, errorText).toBeUndefined();
      return join(tempDir, "services", "shop", name, "service.json");
    }

    function expectVerifiable(serviceJson: string): void {
      expect(validateServiceManifestFile(serviceJson, "service.json").errors).toEqual([]);
      expect(generatedFieldErrorsForFile(serviceJson, "service.json")).toEqual([]);
    }

    function writeExistingManifest(
      relativeDir: string,
      manifest: Record<string, unknown>,
    ): { serviceJsonPath: string; raw: string } {
      const resourceDir = join(tempDir, relativeDir);
      mkdirSync(resourceDir, { recursive: true });
      const serviceJsonPath = join(resourceDir, "service.json");
      const raw = JSON.stringify(manifest, null, 2);
      writeFileSync(serviceJsonPath, raw);
      return { serviceJsonPath, raw };
    }

    function expectZeroPrompts(): void {
      expect(promptMocks.promptText).not.toHaveBeenCalled();
      expect(promptMocks.promptSelect).not.toHaveBeenCalled();
      expect(promptMocks.promptConfirm).not.toHaveBeenCalled();
      expect(promptMocks.promptMultiSelect).not.toHaveBeenCalled();
    }

    it("writes a valid path as given and the file passes the config verify checks", async () => {
      const serviceJson = await createFrontend("web", "/storefront");
      expect(JSON.parse(readFileSync(serviceJson, "utf-8")).basePath).toBe("/storefront");
      expectVerifiable(serviceJson);
    });

    it("adds the leading slash to a slash-less path, so the file still verifies", async () => {
      const serviceJson = await createFrontend("w3", "no-slash");
      expect(JSON.parse(readFileSync(serviceJson, "utf-8")).basePath).toBe("/no-slash");
      expectVerifiable(serviceJson);
    });

    it("refuses a path the schema rejects, exits 1, reports suggestion, and writes nothing", async () => {
      const { exitCode, errorText } = await runFreshResource([
        "w5",
        "--type",
        "frontend",
        "--stack",
        "shop",
        "--base-path",
        "Bad Path/x y",
        "--yes",
      ]);
      expect(exitCode).toBe(1);
      expect(errorText).toContain("--base-path must be a path such as /storefront");
      expect(errorText).toContain("Try --base-path /bad-path/x-y");
      expect(existsSync(join(tempDir, "services", "shop", "w5"))).toBe(false);
    });

    it("refuses whitespace-only --base-path with suggestion /storefront and writes nothing", async () => {
      const { exitCode, errorText } = await runFreshResource([
        "w5",
        "--type",
        "frontend",
        "--stack",
        "shop",
        "--base-path",
        "   ",
        "--yes",
      ]);
      expect(exitCode).toBe(1);
      expect(errorText).toContain("--base-path must be a path such as /storefront");
      expect(errorText).toContain("Try --base-path /storefront");
      expect(existsSync(join(tempDir, "services", "shop", "w5"))).toBe(false);
    });

    it("rejects an invalid --base-path before the resource name prompt on a terminal", async () => {
      const { exitCode, errorText } = await runFreshResource(
        ["--type", "frontend", "--base-path", "Bad Path/x y"],
        { isTTY: true },
      );
      expect(exitCode).toBe(1);
      expect(errorText).toContain("--base-path must be a path such as /storefront");
      expect(errorText).toContain("Try --base-path /bad-path/x-y");
      expectZeroPrompts();
    });

    it("applies a valid --base-path override when updating an existing frontend", async () => {
      const { serviceJsonPath } = writeExistingManifest("services/main/w3", {
        appName: "w3",
        appType: "frontend",
        stack: "main",
        port: 3000,
        basePath: "/old",
      });
      const { exitCode, errorText } = await runFreshResource([
        "w3",
        "--type",
        "frontend",
        "--stack",
        "main",
        "--path",
        "services/main/w3",
        "--base-path",
        "/fixed",
        "--yes",
      ]);
      expect(exitCode, errorText).toBeUndefined();
      expect(JSON.parse(readFileSync(serviceJsonPath, "utf-8")).basePath).toBe("/fixed");
      expectVerifiable(serviceJsonPath);
    });

    it("normalizes a slash-less --base-path override when updating a legacy invalid frontend", async () => {
      const { serviceJsonPath } = writeExistingManifest("services/main/w3", {
        appName: "w3",
        appType: "frontend",
        stack: "main",
        port: 3000,
        basePath: "no-slash",
      });
      const { exitCode, errorText } = await runFreshResource([
        "w3",
        "--type",
        "frontend",
        "--stack",
        "main",
        "--path",
        "services/main/w3",
        "--base-path",
        "fixed",
        "--yes",
      ]);
      expect(exitCode, errorText).toBeUndefined();
      expect(JSON.parse(readFileSync(serviceJsonPath, "utf-8")).basePath).toBe("/fixed");
      expectVerifiable(serviceJsonPath);
    });

    it('clears basePath when updating an existing frontend with --base-path ""', async () => {
      const { serviceJsonPath } = writeExistingManifest("services/main/w3", {
        appName: "w3",
        appType: "frontend",
        stack: "main",
        port: 3000,
        basePath: "/old",
      });
      const { exitCode, errorText } = await runFreshResource([
        "w3",
        "--type",
        "frontend",
        "--stack",
        "main",
        "--path",
        "services/main/w3",
        "--base-path",
        "",
        "--yes",
      ]);
      expect(exitCode, errorText).toBeUndefined();
      const parsed = JSON.parse(readFileSync(serviceJsonPath, "utf-8"));
      expect("basePath" in parsed).toBe(false);
      expectVerifiable(serviceJsonPath);
    });

    it("preserves a valid existing basePath when --base-path is omitted during registration", async () => {
      const { serviceJsonPath } = writeExistingManifest("services/main/w3", {
        appName: "w3",
        appType: "frontend",
        stack: "main",
        port: 3000,
        basePath: "/keep-me",
      });
      const { exitCode, errorText } = await runFreshResource([
        "w3",
        "--type",
        "frontend",
        "--stack",
        "main",
        "--path",
        "services/main/w3",
        "--yes",
      ]);
      expect(exitCode, errorText).toBeUndefined();
      expect(JSON.parse(readFileSync(serviceJsonPath, "utf-8")).basePath).toBe("/keep-me");
      expectVerifiable(serviceJsonPath);
    });

    it("rejects an invalid --base-path during registration without modifying service.json or prompting", async () => {
      const { serviceJsonPath, raw } = writeExistingManifest("services/main/w3", {
        appName: "w3",
        appType: "frontend",
        stack: "main",
        port: 3000,
        basePath: "/old",
      });
      const { exitCode, errorText } = await runFreshResource(
        ["w3", "--type", "frontend", "--path", "services/main/w3", "--base-path", "Bad Path/x y"],
        { isTTY: true },
      );
      expect(exitCode).toBe(1);
      expect(errorText).toContain("--base-path must be a path such as /storefront");
      expect(errorText).toContain("Try --base-path /bad-path/x-y");
      expect(readFileSync(serviceJsonPath, "utf-8")).toBe(raw);
      expectZeroPrompts();
    });

    it("rejects registering a legacy frontend with invalid string basePath before framework or stack prompts", async () => {
      const { serviceJsonPath, raw } = writeExistingManifest("services/main/web", {
        appName: "web",
        appType: "frontend",
        stack: "main",
        port: 3000,
        basePath: "no-slash",
      });
      const { exitCode, errorText } = await runFreshResource(
        ["web", "--type", "frontend", "--path", "services/main/web"],
        { isTTY: true },
      );
      expect(exitCode).toBe(1);
      expect(errorText).toContain(
        `Existing service.json at ${serviceJsonPath} has invalid basePath "no-slash"`,
      );
      expect(errorText).toContain("Pass --base-path /no-slash to replace it");
      expect(readFileSync(serviceJsonPath, "utf-8")).toBe(raw);
      expectZeroPrompts();
    });

    it.each(["backend", ""])(
      "rejects invalid explicit --base-path before name prompt when existing manifest has appType %j",
      async (existingAppType) => {
        const { serviceJsonPath, raw } = writeExistingManifest("services/main/existing", {
          appName: "existing",
          appType: existingAppType,
          stack: "main",
          port: 3000,
        });
        const { exitCode, errorText } = await runFreshResource(
          ["--type", "frontend", "--path", "services/main/existing", "--base-path", "Bad Path/x y"],
          { isTTY: true },
        );
        expect(exitCode).toBe(1);
        expect(errorText).toContain("--base-path must be a path such as /storefront");
        expect(errorText).toContain("Try --base-path /bad-path/x-y");
        expect(readFileSync(serviceJsonPath, "utf-8")).toBe(raw);
        expectZeroPrompts();
      },
    );

    it("rejects registering an existing manifest with empty appType and invalid legacy basePath before prompts", async () => {
      const { serviceJsonPath, raw } = writeExistingManifest("services/main/legacy-empty", {
        appName: "legacy-empty",
        appType: "",
        stack: "main",
        port: 3000,
        basePath: "no-slash",
      });
      const { exitCode, errorText } = await runFreshResource(
        ["--type", "frontend", "--path", "services/main/legacy-empty"],
        { isTTY: true },
      );
      expect(exitCode).toBe(1);
      expect(errorText).toContain(
        `Existing service.json at ${serviceJsonPath} has invalid basePath "no-slash"`,
      );
      expect(errorText).toContain("Pass --base-path /no-slash to replace it");
      expect(readFileSync(serviceJsonPath, "utf-8")).toBe(raw);
      expectZeroPrompts();
    });

    it("rejects registering a legacy frontend with non-string basePath and suggests /storefront without prompting", async () => {
      const { serviceJsonPath, raw } = writeExistingManifest("services/main/w3", {
        appName: "w3",
        appType: "frontend",
        stack: "main",
        port: 3000,
        basePath: 123,
      });
      const { exitCode, errorText } = await runFreshResource(
        ["w3", "--type", "frontend", "--stack", "main", "--path", "services/main/w3"],
        { isTTY: true },
      );
      expect(exitCode).toBe(1);
      expect(errorText).toContain(
        `Existing service.json at ${serviceJsonPath} has invalid basePath 123`,
      );
      expect(errorText).toContain("Pass --base-path /storefront to replace it");
      expect(readFileSync(serviceJsonPath, "utf-8")).toBe(raw);
      expectZeroPrompts();
    });

    it("ignores --base-path on backend creation and registration without writing basePath", async () => {
      const { exitCode: createExit, errorText: createErr } = await runFreshResource([
        "api",
        "--type",
        "backend",
        "--stack",
        "shop",
        "--base-path",
        "Bad Path/x y",
        "--yes",
      ]);
      expect(createExit, createErr).toBeUndefined();
      const createdManifest = join(tempDir, "services", "shop", "api", "service.json");
      expect("basePath" in JSON.parse(readFileSync(createdManifest, "utf-8"))).toBe(false);
      expectVerifiable(createdManifest);

      const { serviceJsonPath } = writeExistingManifest("services/shop/worker-api", {
        appName: "worker-api",
        appType: "backend",
        stack: "shop",
        port: 3001,
      });
      const { exitCode: regExit, errorText: regErr } = await runFreshResource([
        "worker-api",
        "--type",
        "backend",
        "--stack",
        "shop",
        "--path",
        "services/shop/worker-api",
        "--base-path",
        "/ignored",
        "--yes",
      ]);
      expect(regExit, regErr).toBeUndefined();
      expect("basePath" in JSON.parse(readFileSync(serviceJsonPath, "utf-8"))).toBe(false);
      expectVerifiable(serviceJsonPath);
    });
  });
});
