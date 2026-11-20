import { expect, it } from "vitest";
import { createTempDir, parseEnvelope, runFlisk } from "../../test-support/index.js";

it("lists running projects in a structured result from a non-project folder", () => {
  const result = runFlisk(["projects", "--json"], { cwd: createTempDir("projects-outside") });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(parseEnvelope(result.stdout).data.projects).toEqual(expect.any(Array));
});
