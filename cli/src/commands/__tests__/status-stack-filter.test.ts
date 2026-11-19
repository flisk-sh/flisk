import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

it("limits the JSON report to the requested stack", () => {
  const cwd = createTempProject({
    stacks: {
      one: { app: { appType: "backend", port: 4011, command: "node app.js" } },
      two: { worker: { appType: "backend", port: 4012, command: "node worker.js" } },
    },
  });
  const result = runFlisk(["status", "--stack", "one", "--json"], { cwd });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const report = parseEnvelope(result.stdout).data;
  expect(report.stacks.map((entry: { name: string }) => entry.name)).toEqual(["one"]);
  expect(JSON.stringify(report.resources)).not.toContain('"name":"worker"');
});

it("rejects a stack for a bare Node project, which has none", () => {
  const cwd = mkdtempSync(join(tmpdir(), "flisk-status-bare-"));
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "bare", scripts: { dev: "node app.js" } }),
  );
  const result = runFlisk(["status", "--stack", "shop", "--json"], { cwd });
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toContain('Unknown stack "shop"');
});
