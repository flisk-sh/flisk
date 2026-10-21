// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  getDockerfileTemplate,
  getShutdownHandlerTemplate,
  getTestTemplate,
  getWorkerIndexTemplate,
} from "../resource-templates.js";

describe("resource scaffold templates", () => {
  describe("getDockerfileTemplate", () => {
    it("uses the requested port and health path in the Dockerfile", () => {
      const dockerfile = getDockerfileTemplate(4123, "/health");

      expect(dockerfile).toContain("ENV PORT=4123");
      expect(dockerfile).toContain("EXPOSE 4123");
      expect(dockerfile).toContain("http://localhost:4123/health");
      expect(dockerfile).toContain("HEALTHCHECK --interval=10s --timeout=5s --retries=3");
      expect(dockerfile).toContain("FROM oven/bun:1.2");
      expect(dockerfile).toContain('CMD ["bun", "run", "start"]');
    });

    it("omits the healthcheck block when no healthCheckPath is provided", () => {
      const dockerfile = getDockerfileTemplate(3000);

      expect(dockerfile).not.toContain("HEALTHCHECK");
      expect(dockerfile).toContain("ENV PORT=3000");
      expect(dockerfile).toContain("EXPOSE 3000");
      expect(dockerfile).toContain("FROM oven/bun:1.2");
    });

    it("handles standard and privileged ports correctly", () => {
      const port80 = getDockerfileTemplate(80);
      expect(port80).toContain("ENV PORT=80");
      expect(port80).toContain("EXPOSE 80");

      const port8080 = getDockerfileTemplate(8080, "/ready");
      expect(port8080).toContain("ENV PORT=8080");
      expect(port8080).toContain("EXPOSE 8080");
      expect(port8080).toContain("http://localhost:8080/ready");
    });
  });

  describe("getShutdownHandlerTemplate", () => {
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

    it("generates shutdown handlers for standard POSIX signals", () => {
      const sigterm = getShutdownHandlerTemplate("SIGTERM");
      expect(sigterm).toContain("process.on('SIGTERM'");
      expect(sigterm).toContain("process.exit(0)");

      const sigint = getShutdownHandlerTemplate("SIGINT");
      expect(sigint).toContain("process.on('SIGINT'");
      expect(sigint).toContain("process.exit(0)");

      const sighup = getShutdownHandlerTemplate("SIGHUP");
      expect(sighup).toContain("process.on('SIGHUP'");
      expect(sighup).toContain("process.exit(0)");
    });
  });

  describe("getWorkerIndexTemplate", () => {
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

    it("declares the Job interface, CONFIG, and error handlers", () => {
      const worker = getWorkerIndexTemplate("email-sender");

      expect(worker).toContain("interface Job {");
      expect(worker).toContain("id: string;");
      expect(worker).toContain("type: string;");
      expect(worker).toContain("payload: Record<string, unknown>;");
      expect(worker).toContain("WORKER_POLL_INTERVAL");
      expect(worker).toContain("WORKER_MAX_RETRIES");
      expect(worker).toContain("WORKER_BATCH_SIZE");
      expect(worker).toContain("console.error('[Worker] Fatal error:', err);");
    });
  });

  describe("getTestTemplate", () => {
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

    it("handles kebab-case and path-like resource names", () => {
      const template = getTestTemplate("services/order-processor");
      expect(template).toContain("describe('services/order-processor'");
      expect(template).toContain("expect(true).toBe(true);");
    });
  });
});
