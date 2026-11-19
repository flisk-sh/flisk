// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

function projectWithAppStack() {
  return createTempProject({
    stacks: { app: { api: { appType: "backend", port: 4000 } } },
  });
}

describe("flisk resource warns on a stack name close to an existing one (#4378)", () => {
  it("prints a note for --stack ap next to app", () => {
    const root = projectWithAppStack();
    const result = runFlisk(["resource", "api3", "--type", "backend", "--stack", "ap", "--yes"], {
      cwd: root,
      input: "",
    });
    expect(result.status).toBe(0);
    const out = `${result.stdout}\n${result.stderr}`;
    expect(out).toContain("Stack 'ap' is new. Existing stacks: app.");
    expect(out).toContain("Did you mean app?");
  });

  it("puts the note in warnings for --json", () => {
    const root = projectWithAppStack();
    const result = runFlisk(
      ["resource", "api3", "--type", "backend", "--stack", "ap", "--yes", "--json"],
      { cwd: root, input: "" },
    );
    expect(result.status).toBe(0);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data.warnings).toContainEqual(expect.stringContaining("Did you mean app?"));
  });

  it("prints no note for an existing stack", () => {
    const root = projectWithAppStack();
    const result = runFlisk(["resource", "api4", "--type", "backend", "--stack", "app", "--yes"], {
      cwd: root,
      input: "",
    });
    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("is new. Existing stacks");
  });

  it("prints no note for a stack name far from every existing one", () => {
    const root = projectWithAppStack();
    const result = runFlisk(
      ["resource", "api5", "--type", "backend", "--stack", "zzzzzzzz", "--yes"],
      { cwd: root, input: "" },
    );
    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("is new. Existing stacks");
  });
});
