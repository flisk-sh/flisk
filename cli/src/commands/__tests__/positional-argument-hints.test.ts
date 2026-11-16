// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { captureExit, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { downCommand } from "../down.js";
import { logsCommand } from "../logs.js";
import { statusCommand } from "../status.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  // The JSON envelope is written with writeSync(1, ...); capture it instead of hitting stdout.
  const writeSyncMock = vi.fn();
  const mockedFs = { ...actual, default: actual, writeSync: writeSyncMock };
  return { ...mockedFs, default: mockedFs };
});

function captureEnvelopeWrites(): string[] {
  return vi
    .mocked(writeSync)
    .mock.calls.filter((call) => call[0] === 1)
    .map((call) => String(call[1]));
}

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
      const stderr: string[] = [];
      vi.mocked(writeSync).mockClear();
      downCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(downCommand.parseAsync(["ok1", "--json"], { from: "user" })).rejects.toThrow();
      } finally {
        downCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }

      expect(stderr.join("")).toBe("");
      const envelope = parseEnvelope(captureEnvelopeWrites().join(""));
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
      const stderr: string[] = [];
      vi.mocked(writeSync).mockClear();
      statusCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(
          statusCommand.parseAsync(["ok1", "--json"], { from: "user" }),
        ).rejects.toThrow();
      } finally {
        statusCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }

      expect(stderr.join("")).toBe("");
      const envelope = parseEnvelope(captureEnvelopeWrites().join(""));
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
      const stderr: string[] = [];
      vi.mocked(writeSync).mockClear();
      logsCommand.configureOutput({ writeErr: (text) => stderr.push(text) });
      const { exit } = captureExit();
      try {
        await expect(logsCommand.parseAsync(["ok1", "--json"], { from: "user" })).rejects.toThrow();
      } finally {
        logsCommand.configureOutput({ writeErr: (text) => process.stderr.write(text) });
        exit.mockRestore();
      }

      expect(stderr.join("")).toBe("");
      const envelope = parseEnvelope(captureEnvelopeWrites().join(""));
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

    it("flisk distribute status ok1 does not get the top-level status hint", () => {
      const result = runFlisk(["distribute", "status", "ok1"], { cwd: process.cwd() });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toContain("status shows the whole project");
    });

    it("flisk down --help --json exits 0 without appending a USAGE error envelope", () => {
      const result = runFlisk(["down", "--help", "--json"], { cwd: process.cwd() });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: flisk down");
      expect(result.stdout).not.toContain('"schemaVersion"');
    });
  });
});
