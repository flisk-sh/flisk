// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionTiltfilePath, tiltSessionIsForProject } from "../tilt-session-owner.js";

const projectRoot = resolve("work", "myapp");
const ownTiltfile = join(projectRoot, ".flisk", ".flisk-out", "Tiltfile");
const otherTiltfile = join(resolve("work", "other"), ".flisk", ".flisk-out", "Tiltfile");

const session = (tiltfilePath: string): string =>
  JSON.stringify({
    apiVersion: "tilt.dev/v1alpha1",
    kind: "SessionList",
    items: [
      {
        apiVersion: "tilt.dev/v1alpha1",
        kind: "Session",
        metadata: { name: "Tiltfile" },
        spec: { exitCondition: "manual", tiltfilePath },
      },
    ],
  });

describe("sessionTiltfilePath", () => {
  it("reads the Tiltfile path from a Session answer", () => {
    expect(sessionTiltfilePath(session(otherTiltfile))).toBe(otherTiltfile);
  });

  it("reads the path from a Tiltfile answer", () => {
    const answer = JSON.stringify({ items: [{ spec: { path: otherTiltfile } }] });
    expect(sessionTiltfilePath(answer)).toBe(otherTiltfile);
  });

  it.each([null, undefined, "", "not json", "{}", JSON.stringify({ items: "nope" }), session("")])(
    "returns null when no path can be identified: %j",
    (answer) => {
      expect(sessionTiltfilePath(answer)).toBeNull();
    },
  );
});

describe("tiltSessionIsForProject", () => {
  it("accepts the project's own absolute Tiltfile", () => {
    expect(tiltSessionIsForProject(session(ownTiltfile), projectRoot)).toBe(true);
  });

  it("normalizes separators", () => {
    const slashed = join(projectRoot, ".flisk", ".flisk-out", "Tiltfile").replace(/\\/g, "/");
    const backslashed = slashed.replace(/\//g, "\\");
    expect(tiltSessionIsForProject(session(slashed), projectRoot)).toBe(true);
    expect(tiltSessionIsForProject(session(backslashed), projectRoot)).toBe(true);
  });

  it("resolves a relative Tiltfile against the project root", () => {
    const relative = join(".flisk", ".flisk-out", "Tiltfile");
    expect(tiltSessionIsForProject(session(relative), projectRoot)).toBe(true);
  });

  it("rejects another project's Tiltfile even when it has the same file name", () => {
    expect(tiltSessionIsForProject(session(otherTiltfile), projectRoot)).toBe(false);
    expect(tiltSessionIsForProject(session("Tiltfile"), projectRoot)).toBe(false);
    expect(tiltSessionIsForProject(session(join("..", "other", "Tiltfile")), projectRoot)).toBe(
      false,
    );
  });

  it("is inconclusive when Tilt did not name a Tiltfile", () => {
    expect(tiltSessionIsForProject(null, projectRoot)).toBeNull();
    expect(tiltSessionIsForProject("not json", projectRoot)).toBeNull();
  });
});
