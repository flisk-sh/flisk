import { expect, it } from "vitest";
import {
  createTempDir,
  createTempProject,
  parseEnvelope,
  runFlisk,
} from "../../test-support/index.js";

it("warns once outside a project and keeps JSON structured", () => {
  const cwd = createTempDir("connect-outside");
  const text = runFlisk(["connect", "claude", "--dry-run"], { cwd });
  expect(text.status).toBe(0);
  expect(text.stderr.match(/No Flisk project found here/g)).toHaveLength(1);
  const json = runFlisk(["connect", "claude", "--dry-run", "--json"], { cwd });
  expect(parseEnvelope(json.stdout).data.warnings).toHaveLength(1);
  const inside = runFlisk(["connect", "claude", "--dry-run"], { cwd: createTempProject() });
  expect(inside.stderr).not.toContain("No Flisk project found here");
});
