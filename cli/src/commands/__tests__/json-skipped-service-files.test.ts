// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// #3825: `resources --json`, `stacks --json` and `status --json` name the service.json files discovery skipped, so a
// program reading stdout is not told a project with a broken manifest has no resources and no problems.
import { describe, expect, it } from "vitest";
import { createTempProject, runFlisk } from "../../test-support/index.js";

const BROKEN = "services/app/broken/service.json";

function project(broken: boolean): string {
  return createTempProject({
    projectJson: {},
    resources: {
      "app/api": { appType: "backend", stack: "app", schemaVersion: 1, port: 3000 },
    },
    ...(broken
      ? { files: { [BROKEN]: '{"appName":"broken","appType":"backend","stack":"app",}' } }
      : {}),
  });
}

function json(args: string[], cwd: string) {
  const result = runFlisk(args, { cwd, timeout: 60_000 });
  return { ...result, envelope: JSON.parse(result.stdout) };
}

describe.each([
  ["resources", ["resources", "--json"]],
  ["stacks", ["stacks", "--json"]],
  ["status", ["status", "--json"]],
])("flisk %s --json with an invalid service.json", (_name, args) => {
  it("lists the skipped file with its reason in data.skipped and keeps exit code 0", () => {
    const { status, stderr, envelope } = json(args, project(true));

    expect(status).toBe(0);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data.skipped).toEqual([
      { file: BROKEN, reason: expect.stringMatching(/^invalid JSON/) },
    ]);
    // The human warning stays on stderr, as before.
    expect(stderr).toContain(`skipped `);
    expect(stderr).toContain(BROKEN);
  });

  it("leaves data.skipped out when every service.json is valid", () => {
    const { status, envelope } = json(args, project(false));

    expect(status).toBe(0);
    expect(envelope.data).not.toHaveProperty("skipped");
  });
});

it("flisk resources --json still lists the valid resources next to the skipped one", () => {
  const { envelope } = json(["resources", "--json"], project(true));
  expect(envelope.data.resources.map((r: { name: string }) => r.name)).toEqual(["api"]);
});
