// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseResourceType,
  resolveInferencePort,
  resourceCommand,
} from "../../commands/resource.js";

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

import { clearDiscoveryCache } from "../../utils/discovery-context.js";

const originalCwd = process.cwd();

describe("inference resource type", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-inference-test-"));
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
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/**"] },
      }),
    );
    process.chdir(tempDir);
    clearDiscoveryCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function createInference(args: string[] = []): Promise<Record<string, unknown>> {
    const originalLog = console.log;
    console.log = () => {};
    try {
      await resourceCommand.parseAsync(
        ["node", "flisk", "brain", "--type", "inference", "--stack", "kitchen", "--yes", ...args],
        { from: "node" },
      );
    } finally {
      console.log = originalLog;
    }
    const dir = join(tempDir, "services", "kitchen", "brain");
    return JSON.parse(readFileSync(join(dir, "service.json"), "utf-8"));
  }

  it("is a bring-your-own preset", () => {
    expect(parseResourceType("inference")).toBe("bring-your-own");
  });

  it("writes an OpenAI-compatible server with the defaults and no Dockerfile", async () => {
    const service = await createInference();
    expect(service).toMatchObject({
      appName: "brain",
      appType: "bring-your-own",
      port: 11434,
      healthCheckPath: "/v1/models",
      image: "ollama/ollama",
    });
    expect(service).not.toHaveProperty("dockerfile");
    expect(existsSync(join(tempDir, "services", "kitchen", "brain", "Dockerfile"))).toBe(false);
  });

  it("does not make Ollama mandatory: --image, --port and --health-path win", async () => {
    const service = await createInference([
      "--image",
      "vllm/vllm-openai",
      "--port",
      "8000",
      "--health-path",
      "/health",
    ]);
    expect(service).toMatchObject({
      image: "vllm/vllm-openai",
      port: 8000,
      healthCheckPath: "/health",
    });
  });

  it("builds from a Dockerfile when one is given instead of defaulting the image", async () => {
    const service = await createInference(["--dockerfile", "./Dockerfile.llm"]);
    expect(service).toMatchObject({ dockerfile: "./Dockerfile.llm" });
    expect(service).not.toHaveProperty("image");
  });

  it("keeps the port of an existing service.json when registering without --port", async () => {
    const dir = join(tempDir, "services", "kitchen", "brain");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "service.json"),
      JSON.stringify({ appName: "brain", appType: "bring-your-own", port: 8000 }),
    );
    clearDiscoveryCache();
    const service = await createInference(["--register-existing"]);
    expect(service).toMatchObject({ port: 8000 });
  });

  describe("resolveInferencePort", () => {
    it("defaults to 11434", () => {
      expect(resolveInferencePort(undefined, [])).toBe(11434);
    });

    it("rejects values outside 1-65535 and non-integers", () => {
      expect(() => resolveInferencePort("0", [])).toThrow(/1 through 65535/);
      expect(() => resolveInferencePort("70000", [])).toThrow(/1 through 65535/);
      expect(() => resolveInferencePort("80a", [])).toThrow(/1 through 65535/);
    });

    it("rejects a port another resource uses", () => {
      expect(() => resolveInferencePort("8000", [{ config: { port: 8000 } }])).toThrow(
        /already assigned/,
      );
    });
  });
});
