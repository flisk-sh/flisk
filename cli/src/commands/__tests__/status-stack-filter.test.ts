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
