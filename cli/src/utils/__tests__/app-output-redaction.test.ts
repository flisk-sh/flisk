// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Every path that shows an application's own output (what it printed to its logs) masks secrets: the values of the project's
// .env and of its services, and the common secret shapes. One case per path, plus the pattern list.
import type { ChildProcess, execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFliskTools } from "../../mcp/tools.js";
import { probeContainerRuntimeError } from "../doctor-runtime.js";
import {
  createEnvRedactor,
  createPrivateKeyLineGuard,
  envSecretValues,
  OUTPUT_WITHHELD,
  projectSecretValues,
  REDACTED,
  redactLogLines,
  redactProjectText,
  redactSecretPatterns,
  redactSecrets,
  redactValue,
  SECRET_PATTERNS,
} from "../secret-redaction.js";
import { tiltResourceLogs } from "../up-readiness.js";
import { type UpWaitDeps, upAndWait } from "../up-wait.js";

const DB_PASSWORD = "p4ssw0rd-from-dotenv-0001";
const STRIPE = "sk_" + "live_51HabcdEFGHijklMNOPqrstUV";
const KEY_BLOCK = [
  "-----" + "BEGIN RSA PRIVATE KEY-----",
  "MIIEowIBAAKCAQEA7bq0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "-----" + "END RSA PRIVATE KEY-----",
];

const dirs: string[] = [];
const savedEnv = { ...process.env };
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "flisk-appout-"));
  dirs.push(root);
  mkdirSync(join(root, ".flisk"), { recursive: true });
  writeFileSync(join(root, ".flisk", "project.json"), JSON.stringify({ name: "appout" }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
beforeEach(() => {
  delete process.env.FLISK_ENV_FILE;
});
afterEach(() => {
  process.env = { ...savedEnv };
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("secret shapes", () => {
  const cases: Array<[string, string, string]> = [
    [
      "a bearer token",
      "Authorization: Bearer abcdef1234567890XYZ",
      `Authorization: Bearer ${REDACTED}`,
    ],
    [
      "a bearer token, any case",
      "authorization: bearer abcdef1234567890",
      `authorization: bearer ${REDACTED}`,
    ],
    [
      "a connection string",
      "connecting to postgres://app:hunter2hunter2@db:5432/app",
      `connecting to postgres://app:${REDACTED}@db:5432/app`,
    ],
    [
      "an http basic auth url",
      "GET https://user:s3cr3t@example.com/x",
      `GET https://user:${REDACTED}@example.com/x`,
    ],
    ["an AWS access key id", "key=AKI" + "AIOSFODNN7EXAMPLE end", `key=${REDACTED} end`],
    ["an AWS temporary key id", "ASI" + "AIOSFODNN7EXAMPLE", REDACTED],
    ["a GitHub token", `token ghp_${"a1B2".repeat(9)}`, `token ${REDACTED}`],
    ["a GitHub fine-grained token", `github_pat_${"A1b2C3d4E5".repeat(3)}`, REDACTED],
    ["a Slack token", "xo" + "xb-1234567890-abcdefghij", REDACTED],
    ["a Stripe key", `stripe ${STRIPE}`, `stripe ${REDACTED}`],
    ["an API key with the sk- prefix", "sk-ant-api03-abcdefghijklmnopqrstuvwx", REDACTED],
    [
      "a JSON web token",
      `jwt ${["ey" + "JhbGciOiJIUzI1NiJ9", "ey" + "JzdWIiOiIxMjM0NTY3ODkwIn0", "dBjftJeZ4CVPmB92K27uhbUJU1p1r"].join(".")}`,
      `jwt ${REDACTED}`,
    ],
    ["a private key block", KEY_BLOCK.join("\n"), REDACTED],
    ["a private key block inside one JSON string", KEY_BLOCK.join("\\n"), REDACTED],
    [
      "a private key header whose block is cut off",
      "-----" + "BEGIN PRIVATE KEY----- MIIE",
      REDACTED,
    ],
  ];
  it.each(cases)("masks %s", (_name, input, expected) => {
    expect(redactSecretPatterns(input)).toBe(expected);
    expect(redactSecrets(input, [])).toBe(expected);
  });

  it("leaves ordinary log lines alone", () => {
    const text = [
      "listening on http://localhost:3000",
      "GET /health 200 3ms",
      "postgres://postgres:5432/app",
      "Bearer",
      "AKIA is a prefix",
      "key: value, token: short",
      "2026-11-14T10:00:00Z INFO user=anna id=ghp_short",
    ].join("\n");
    expect(redactSecretPatterns(text)).toBe(text);
  });

  it("has a pattern list with unique names", () => {
    const names = SECRET_PATTERNS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "bearer token",
        "private key block",
        "url credentials",
        "aws access key id",
        "github token",
        "github fine-grained token",
      ]),
    );
  });

  it("masks shapes inside a JSON-shaped value even when there are no env values", () => {
    expect(redactValue({ lines: [{ text: "Bearer abcdef1234567890" }] }, [])).toEqual({
      lines: [{ text: `Bearer ${REDACTED}` }],
    });
  });
});

describe("private keys printed line by line", () => {
  it("masks the lines between BEGIN and END, per stream", () => {
    const guard = createPrivateKeyLineGuard();
    const out = ["start", ...KEY_BLOCK, "done"].map((line) => redactSecretPatterns(guard(line)));
    expect(out).toEqual(["start", REDACTED, REDACTED, REDACTED, REDACTED, "done"]);
  });

  it("keeps one open block per resource in a merged log", () => {
    const lines = [
      { resource: "api", text: KEY_BLOCK[0] as string },
      { resource: "web", text: "hello" },
      { resource: "api", text: KEY_BLOCK[1] as string },
      { resource: null, text: "no resource" },
      { resource: "api", text: KEY_BLOCK[3] as string },
      { resource: "api", text: "after" },
    ];
    expect(redactLogLines(lines, []).map((line) => line.text)).toEqual([
      REDACTED,
      "hello",
      REDACTED,
      "no resource",
      REDACTED,
      "after",
    ]);
  });
});

describe("secret values from the project and its services", () => {
  it("reads .env, the --env-file file, a service's envFile, its declared secrets and secret-named env", () => {
    const root = project({
      ".env": `DB_PASSWORD=${DB_PASSWORD}\nPORT=4000\n`,
      "selected.env": "SELECTED_TOKEN=selected-file-value-777\n",
      "services/byo/extra.env": "EXTRA=byo-env-file-value-888\n",
      "services/byo/service.json": JSON.stringify({
        appName: "byo",
        appType: "bring-your-own",
        envFile: ["extra.env"],
        secrets: { required: ["SHELL_ONLY_SECRET"] },
        env: { API_TOKEN: "service-env-token-999", LOG_LEVEL: "informational-debug" },
      }),
    });
    process.env.SHELL_ONLY_SECRET = "value-from-the-shell-1234";
    process.env.FLISK_ENV_FILE = join(root, "selected.env");
    const values = envSecretValues(root);
    expect(values).toEqual(
      expect.arrayContaining([
        DB_PASSWORD,
        "selected-file-value-777",
        "byo-env-file-value-888",
        "value-from-the-shell-1234",
        "service-env-token-999",
      ]),
    );
    // A plain setting is not a secret, and a short value is never masked.
    expect(values).not.toContain("informational-debug");
    expect(values).not.toContain("4000");
    expect(createEnvRedactor(root)("pw=service-env-token-999 level=informational-debug")).toBe(
      `pw=${REDACTED} level=informational-debug`,
    );
  });

  it("projectSecretValues is empty outside a project and null when an env file cannot be read", () => {
    const outside = mkdtempSync(join(tmpdir(), "flisk-appout-none-"));
    dirs.push(outside);
    expect(projectSecretValues(outside)).toEqual([]);
    expect(redactProjectText("Bearer abcdef1234567890", outside)).toBe(`Bearer ${REDACTED}`);

    const unreadable = project({});
    mkdirSync(join(unreadable, ".env")); // a directory: reading it fails
    expect(projectSecretValues(unreadable)).toBeNull();
    expect(redactProjectText(`x ${DB_PASSWORD}`, unreadable)).toBe(OUTPUT_WITHHELD);
  });
});

describe("flisk up: a failed or timed-out wait", () => {
  it("masks the tail of the up log it prints", async () => {
    const root = project({ ".env": `DB_PASSWORD=${DB_PASSWORD}\n` });
    const log = `build step\nconnect postgres://app:${DB_PASSWORD}@db/app\nBearer abcdef1234567890\n`;
    const child = new EventEmitter() as unknown as ChildProcess;
    (child as { unref: () => void }).unref = () => {};
    let clock = 0;
    const deps: UpWaitDeps = {
      spawnUp: () => {
        queueMicrotask(() => child.emit("exit", 1));
        return child;
      },
      readLog: () => log,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      logFile: () => "/tmp/up.log",
    };
    const outcome = await upAndWait(["up"], 5, deps, root);
    expect(outcome.kind).toBe("exited");
    const tail = "logTail" in outcome ? outcome.logTail : "";
    expect(tail).toContain(`postgres://app:${REDACTED}@db/app`);
    expect(tail).toContain(`Bearer ${REDACTED}`);
    expect(tail).not.toContain(DB_PASSWORD);
  });
});

describe.skipIf(process.platform === "win32")("Tilt resource logs read by flisk up", () => {
  it("masks what `tilt logs` printed before the failure reason, timeout excerpt or URL check uses it", async () => {
    const root = project({ ".env": `DB_PASSWORD=${DB_PASSWORD}\n` });
    const bin = mkdtempSync(join(tmpdir(), "flisk-appout-bin-"));
    dirs.push(bin);
    const fake = join(bin, "tilt");
    writeFileSync(
      fake,
      `#!/bin/sh\nprintf 'db password ${DB_PASSWORD}\\nBearer abcdef1234567890\\n'\n`,
    );
    chmodSync(fake, 0o755);
    process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
    const previous = process.cwd();
    process.chdir(root);
    try {
      const logs = await tiltResourceLogs(10350, "api");
      expect(logs).toBe(`db password ${REDACTED}\nBearer ${REDACTED}\n`);
    } finally {
      process.chdir(previous);
    }
  });
});

describe.skipIf(process.platform === "win32")("flisk doctor", () => {
  it("masks the container log before quoting a failure line from it", () => {
    const root = project({ ".env": `DB_PASSWORD=${DB_PASSWORD}\n` });
    const fakeExec = (cmd: string) => {
      if (cmd.includes("docker ps")) return "appout-orders-autogenerated-api-1\n";
      if (cmd.includes("docker logs"))
        return `error: Failed to connect with ${DB_PASSWORD} Bearer abcdef1234567890`;
      return "";
    };
    const previous = process.cwd();
    process.chdir(root);
    try {
      const error = probeContainerRuntimeError(
        "api",
        fakeExec as unknown as typeof execSync,
        "appout",
      );
      expect(error).toContain("Failed to connect");
      expect(error).not.toContain(DB_PASSWORD);
      expect(error).not.toContain("abcdef1234567890");
    } finally {
      process.chdir(previous);
    }
  });
});

describe("MCP tools", () => {
  it("masks secrets in what any tool returns, whatever the child printed", async () => {
    const root = project({ ".env": `DB_PASSWORD=${DB_PASSWORD}\n` });
    const stdout = JSON.stringify({
      schemaVersion: 1,
      data: { lines: [{ resource: "api", text: `pw ${DB_PASSWORD} Bearer abcdef1234567890` }] },
      errors: [],
    });
    const tools = createFliskTools(async () => ({ exitCode: 0, stdout, stderr: "" }));
    const logs = tools.find((tool) => tool.name === "logs");
    const result = await logs?.handler({ projectPath: root });
    const text = JSON.stringify(result?.data);
    expect(text).toContain(`pw ${REDACTED} Bearer ${REDACTED}`);
    expect(text).not.toContain(DB_PASSWORD);
  });

  it("masks the tail of a failed `up` that exits before it printed a result", async () => {
    const root = project({ ".env": `DB_PASSWORD=${DB_PASSWORD}\n` });
    const child = new EventEmitter() as unknown as ChildProcess;
    const tools = createFliskTools(undefined, {
      spawnUp: () => {
        queueMicrotask(() => child.emit("exit", 1));
        return child;
      },
      readLog: () => `crashed with ${DB_PASSWORD}\n`,
      sleep: async () => {},
      now: () => 0,
      logFile: () => "/tmp/mcp-up.log",
    });
    const up = tools.find((tool) => tool.name === "up");
    const result = await up?.handler({ projectPath: root, waitSeconds: 1 });
    const text = JSON.stringify(result?.data);
    expect(text).toContain("crashed with [REDACTED]");
    expect(text).not.toContain(DB_PASSWORD);
  });

  it("returns an error, not the text, when the project's env cannot be read", async () => {
    const root = project({});
    mkdirSync(join(root, ".env"));
    const tools = createFliskTools(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        schemaVersion: 1,
        data: { lines: [{ text: DB_PASSWORD }] },
        errors: [],
      }),
      stderr: "",
    }));
    const result = await tools.find((tool) => tool.name === "logs")?.handler({ projectPath: root });
    expect(result?.isError).toBe(true);
    expect(JSON.stringify(result?.data)).not.toContain(DB_PASSWORD);
    expect(JSON.stringify(result?.data)).toContain("ENV_UNREADABLE");
  });
});
