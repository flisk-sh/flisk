// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnvelope, runFlisk } from "../../test-support/index.js";

/**
 * `flisk config verify` and `flisk up --dry-run` must judge a service.json by the same rules (#4191): a file verify passes must
 * not stop `flisk up`, and a file `flisk up` refuses must not pass verify. Each case edits one field of a scaffolded backend.
 */

const SERVICE_JSON = path.join("services", "main", "api", "service.json");

let baseRoot = "";
let baseManifest: Record<string, unknown> = {};

// Each case spawns the built CLI twice; on a loaded machine that takes well over the default timeout.
const TIMEOUT = 120_000;

beforeAll(() => {
  baseRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "flisk-validation-parity-")));
  expect(runFlisk(["project", "--yes", "--no-agent-skills"], { cwd: baseRoot }).status).toBe(0);
  expect(
    runFlisk(["resource", "api", "--type", "backend", "--yes", "--stack", "main"], {
      cwd: baseRoot,
    }).status,
  ).toBe(0);
  baseManifest = JSON.parse(fs.readFileSync(path.join(baseRoot, SERVICE_JSON), "utf-8"));
}, TIMEOUT);

afterAll(() => {
  if (baseRoot) fs.rmSync(baseRoot, { recursive: true, force: true });
});

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/** A copy of the scaffolded project with `edit` applied to its service.json. */
function projectWith(edit: Record<string, unknown>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "flisk-validation-case-")));
  roots.push(root);
  fs.cpSync(baseRoot, root, { recursive: true });
  fs.writeFileSync(
    path.join(root, SERVICE_JSON),
    `${JSON.stringify({ ...baseManifest, ...edit }, null, 2)}\n`,
  );
  return root;
}

interface Outcome {
  isRejected: boolean;
  output: string;
}

function verify(root: string): Outcome {
  const result = runFlisk(["config", "verify", "--json"], { cwd: root });
  const envelope = parseEnvelope(result.stdout);
  const data = envelope.data as { valid: boolean; errors: string[] };
  // The exit code and the envelope have to agree, or a script reading one would disagree with one reading the other.
  expect(result.status !== 0, result.stdout).toBe(!data.valid);
  return { isRejected: !data.valid, output: data.errors.join("\n") };
}

function upDryRun(root: string): Outcome {
  const result = runFlisk(["up", "main", "--dry-run"], { cwd: root });
  return { isRejected: result.status !== 0, output: `${result.stdout}${result.stderr}` };
}

describe("an empty dev.command", () => {
  const message =
    /services\/main\/api\/service\.json: service "api": dev\.command must be a non-empty string/;

  it.each(["", "   "])(
    "is refused by config verify --json (%j)",
    (command) => {
      const outcome = verify(projectWith({ dev: { command } }));
      expect(outcome.isRejected).toBe(true);
      expect(outcome.output).toMatch(message);
    },
    TIMEOUT,
  );

  it.each(["", "   "])(
    "is refused by up --dry-run (%j)",
    (command) => {
      const outcome = upDryRun(projectWith({ dev: { command } }));
      expect(outcome.isRejected).toBe(true);
      expect(outcome.output).toMatch(message);
      expect(outcome.output).not.toMatch(/Would run: tilt up/);
    },
    TIMEOUT,
  );

  it(
    "is worded like an empty top-level command",
    () => {
      const outcome = verify(projectWith({ command: "" }));
      expect(outcome.output).toMatch(
        /services\/main\/api\/service\.json: service "api": command must be a non-empty string/,
      );
    },
    TIMEOUT,
  );
});

describe("config verify and up --dry-run agree (#4191)", () => {
  it(
    "both accept the scaffolded service.json",
    () => {
      const root = projectWith({});
      expect(verify(root).isRejected).toBe(false);
      expect(upDryRun(root).isRejected).toBe(false);
    },
    TIMEOUT,
  );

  // The six cases from the issue. Every one of them is invalid, so both commands must refuse it.
  it.each<[string, Record<string, unknown>]>([
    ["a string port", { port: "4000" }],
    ["a fractional port", { port: 4000.5 }],
    ["a healthCheckPath without a leading slash", { healthCheckPath: "health" }],
    ["a stack with a space", { stack: "Bad Stack" }],
    ["an unknown appType", { appType: "bogus" }],
    ["an empty dev.command", { dev: { command: "" } }],
  ])(
    "both refuse %s",
    (_label, edit) => {
      const root = projectWith(edit);
      const verified = verify(root);
      const started = upDryRun(root);
      expect(
        { verify: verified.isRejected, up: started.isRejected },
        `verify:\n${verified.output}\n\nup --dry-run:\n${started.output}`,
      ).toEqual({ verify: true, up: true });
    },
    TIMEOUT,
  );
});
