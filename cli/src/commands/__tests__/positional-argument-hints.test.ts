// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { captureExit, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { downCommand } from "../down.js";
import { logsCommand } from "../logs.js";
import { statusCommand } from "../status.js";

describe("positional argument hints and --json error routing (#4251)", () => {
  describe("text mode: commands with no positionals explain that they take no service name", () => {
    it("down explains that it stops the whole project and names --project", async () => {
      const stderr: string[] = [];
      downCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(downCommand.parseAsync(["ok1"], { from: "user" })).rejects.toThrow();
      } finally {
        downCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }
      const output = stderr.join("");
      expect(output).toContain("too many arguments");
      expect(output).toContain("down stops the whole project");
      expect(output).toContain("--project");
    });

    it("status explains that it shows the whole project and names logs --service", async () => {
      const stderr: string[] = [];
      statusCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(statusCommand.parseAsync(["ok1"], { from: "user" })).rejects.toThrow();
      } finally {
        statusCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }
      const output = stderr.join("");
      expect(output).toContain("too many arguments");
      expect(output).toContain("status shows the whole project");
      expect(output).toContain("logs --service");
    });

    it("logs keeps its existing hint pointing to flisk logs --service <name>", async () => {
      const stderr: string[] = [];
      logsCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(logsCommand.parseAsync(["ok1"], { from: "user" })).rejects.toThrow();
      } finally {
        logsCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }
      const output = stderr.join("");
      expect(output).toContain("too many arguments");
      expect(output).toContain(
        "Service names are not positional. Use: flisk logs --service <name>",
      );
    });
  });

  describe("json mode: excess positional arguments emit a JSON envelope, not plain text", () => {
    it("down ok1 --json prints a versioned JSON error on stdout and suppresses stderr", async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const origLog = console.log;
      console.log = (line) => stdout.push(String(line));
      downCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(downCommand.parseAsync(["ok1", "--json"], { from: "user" })).rejects.toThrow();
      } finally {
        console.log = origLog;
        downCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }

      expect(stderr.join("")).toBe("");
      const envelope = parseEnvelope(stdout.join("\n"));
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
      expect(envelope.errors[0]?.code).toBe("USAGE");
      expect(envelope.errors[0]?.message).toContain("too many arguments");
      expect((envelope.errors[0] as { suggestions?: string[] }).suggestions?.[0]).toContain(
        "down stops the whole project",
      );
    });

    it("status ok1 --json prints a versioned JSON error on stdout and suppresses stderr", async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const origLog = console.log;
      console.log = (line) => stdout.push(String(line));
      statusCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(
          statusCommand.parseAsync(["ok1", "--json"], { from: "user" }),
        ).rejects.toThrow();
      } finally {
        console.log = origLog;
        statusCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }

      expect(stderr.join("")).toBe("");
      const envelope = parseEnvelope(stdout.join("\n"));
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
      expect(envelope.errors[0]?.code).toBe("USAGE");
      expect(envelope.errors[0]?.message).toContain("too many arguments");
      expect((envelope.errors[0] as { suggestions?: string[] }).suggestions?.[0]).toContain(
        "status shows the whole project",
      );
    });

    it("logs ok1 --json prints a versioned JSON error on stdout and suppresses stderr", async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const origLog = console.log;
      console.log = (line) => stdout.push(String(line));
      logsCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(logsCommand.parseAsync(["ok1", "--json"], { from: "user" })).rejects.toThrow();
      } finally {
        console.log = origLog;
        logsCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }

      expect(stderr.join("")).toBe("");
      const envelope = parseEnvelope(stdout.join("\n"));
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
      expect(envelope.errors[0]?.code).toBe("USAGE");
      expect(envelope.errors[0]?.message).toContain("too many arguments");
      expect((envelope.errors[0] as { suggestions?: string[] }).suggestions?.[0]).toContain(
        "Service names are not positional",
      );
    });
  });

  describe("CLI subprocess integration via runFlisk", () => {
    it("flisk down ok1 --json prints JSON error envelope on stdout and exits non-zero", () => {
      const result = runFlisk(["down", "ok1", "--json"], { cwd: process.cwd() });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toBe("");
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.data).toBeNull();
      expect(envelope.errors[0]?.code).toBe("USAGE");
      expect(envelope.errors[0]?.message).toContain("too many arguments");
    });

    it("flisk status ok1 --json prints JSON error envelope on stdout and exits non-zero", () => {
      const result = runFlisk(["status", "ok1", "--json"], { cwd: process.cwd() });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toBe("");
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.data).toBeNull();
      expect(envelope.errors[0]?.code).toBe("USAGE");
      expect(envelope.errors[0]?.message).toContain("too many arguments");
    });

    it("flisk down --help --json exits 0 without appending a USAGE error envelope", () => {
      const result = runFlisk(["down", "--help", "--json"], { cwd: process.cwd() });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: flisk down");
      expect(result.stdout).not.toContain('"schemaVersion"');
    });
  });
});
