import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createTempDir,
  createTempProject,
  parseEnvelope,
  runFlisk,
} from "../../test-support/index.js";

it("previews writes in the explicit project directory", () => {
  const root = createTempProject();
  const cwd = createTempDir("connect-from");
  const result = runFlisk(["connect", "claude", "--project", root, "--dry-run", "--json"], { cwd });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.stringify(parseEnvelope(result.stdout).data)).toContain(join(root, ".mcp.json"));
  expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  const bare = runFlisk(["connect", "claude", "--project", "--dry-run", "--json"], { cwd: root });
  expect(bare.status, bare.stdout + bare.stderr).toBe(0);
});
