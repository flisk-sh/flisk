import { expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

it.each([
  [["assign", "a1", "main"], "flisk stack main --resources a1"],
  [["create", "web"], "flisk stack web --resources <name>"],
])("explains the stack command for invalid positionals %j", (args, expected) => {
  const result = runFlisk(["stack", ...args, "--json"], { cwd: createTempProject() });
  expect(result.status).toBe(1);
  expect(parseEnvelope(result.stdout).errors[0]).toEqual(
    expect.objectContaining({ suggestions: expect.arrayContaining([expected]) }),
  );
});
