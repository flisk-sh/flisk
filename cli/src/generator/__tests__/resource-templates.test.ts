// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  getDockerfileTemplate,
  getShutdownHandlerTemplate,
  getTestTemplate,
  getWorkerIndexTemplate,
} from "../resource-templates.js";

describe("resource scaffold templates", () => {
  it("uses the requested port and health path in the Dockerfile", () => {
    const dockerfile = getDockerfileTemplate(4123, "/health");

    expect(dockerfile).toContain("ENV PORT=4123");
    expect(dockerfile).toContain("EXPOSE 4123");
    expect(dockerfile).toContain("http://localhost:4123/health");
  });

  it("uses the supplied shutdown signal", () => {
    expect(getShutdownHandlerTemplate("SIGUSR1")).toBe(
      [
        "process.on('SIGUSR1', () => {",
        "  console.log('[Worker] SIGUSR1 received, shutting down gracefully...');",
        "  process.exit(0);",
        "});",
      ].join("\n"),
    );
  });

  it("interpolates the worker name and shutdown handlers", () => {
    const worker = getWorkerIndexTemplate("test-worker");

    expect(worker).toContain("test-worker worker started");
    expect(worker).toContain("process.on('SIGTERM'");
    expect(worker).toContain("process.on('SIGINT'");
  });

  it("logs the fetched job count instead of the literal placeholder", () => {
    const worker = getWorkerIndexTemplate("test-worker");
    const line = worker.split("\n").find((candidate) => candidate.includes("[Worker] Fetched"));
    expect(line).toBeDefined();

    const logged: unknown[][] = [];
    const log = (...args: unknown[]) => logged.push(args);
    new Function("jobs", "console", line as string)([{}, {}, {}], { log });

    expect(logged).toEqual([["[Worker] Fetched 3 jobs"]]);
  });

  it("hands out one demo job so the scaffolded worker processes a job", () => {
    const worker = getWorkerIndexTemplate("test-worker");

    expect(worker).toContain("type: 'demo'");
    expect(worker).toContain("demoJobSent");
    expect(worker).toContain("'[Worker] Job completed:'");
  });

  it("interpolates the generated test name", () => {
    expect(getTestTemplate("catalog")).toBe(
      [
        "import { describe, it, expect } from 'vitest';",
        "",
        "describe('catalog', () => {",
        "  it('should pass a basic test', () => {",
        "    expect(true).toBe(true);",
        "  });",
        "});",
        "",
      ].join("\n"),
    );
  });
});
