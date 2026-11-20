// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempProject } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { statusCommand } from "../status.js";

interface StatusResource {
  name: string;
  port?: number;
  containerPort?: number;
  directUrl?: string | null;
}

interface StatusOutput {
  data: {
    runtime?: string;
    urls?: string[];
    resources: StatusResource[];
  };
}

async function runStatus(): Promise<StatusOutput> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    lines.push(parts.map(String).join(" "));
  });
  try {
    await statusCommand.parseAsync(["--json"], { from: "user" });
  } finally {
    log.mockRestore();
  }
  return JSON.parse(lines.at(-1) ?? "{}") as StatusOutput;
}

describe("status --json with checkout-local native ports (#4047)", () => {
  const originalCwd = process.cwd();
  afterEach(() => {
    process.chdir(originalCwd);
    clearDiscoveryCache();
  });

  it("reports the real port and URL from run.json, not the port in service.json", async () => {
    const root = createTempProject({
      projectJson: { project: { name: "shop" }, worktree: { name: "agent-two" } },
      resources: {
        api: { appName: "api", appType: "backend", command: "node api.js", port: 4100 },
        web: {
          appName: "web",
          appType: "frontend",
          command: "node web.js",
          port: 4200,
          dependsOn: ["api"],
        },
      },
    });
    process.chdir(root);
    clearDiscoveryCache();

    const runState = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      services: {
        api: { pid: process.pid, port: 4101, url: "http://localhost:4101", ready: true },
        web: { pid: process.pid, port: 4200, url: "http://localhost:4200", ready: true },
      },
    };
    const runFile = join(root, ".flisk", "native", "run.json");
    mkdirSync(dirname(runFile), { recursive: true });
    writeFileSync(runFile, JSON.stringify(runState));

    const output = await runStatus();
    const data = output.data;
    expect(data.runtime).toBe("native");
    expect(data.urls).toEqual(["http://localhost:4101", "http://localhost:4200"]);
    const api = data.resources.find((resource) => resource.name === "api");
    expect(api).toMatchObject({
      port: 4101,
      containerPort: 4101,
      directUrl: "http://localhost:4101",
    });
    const web = data.resources.find((resource) => resource.name === "web");
    expect(web).toMatchObject({
      port: 4200,
      containerPort: 4200,
      directUrl: "http://localhost:4200",
    });

    // The manifest on disk still holds the declared port.
    const serviceJson = join(root, "services", "api", "service.json");
    expect(JSON.parse(readFileSync(serviceJson, "utf-8")).port).toBe(4100);
  });
});
