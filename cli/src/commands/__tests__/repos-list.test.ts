import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

it("lists cloned and missing repositories without cloning", () => {
  const root = createTempProject({
    projectJson: {
      version: "1.0",
      project: { name: "repos", version: "1.0.0" },
      phases: Object.fromEntries(
        ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
          name,
          { name, description: "", enabledStacks: [] },
        ]),
      ),
      optional_infra: {
        monitoring: false,
        elk: false,
        debezium: false,
        golden_image: false,
        verdaccio: false,
      },
      discovery: { paths: ["services"] },
    },
  });
  const configPath = join(root, ".flisk", "project.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.repos = [
    { url: "https://example.com/team/app.git", dir: "services/app" },
    { url: "https://example.com/team/missing.git", dir: "services/missing" },
  ];
  writeFileSync(configPath, JSON.stringify(config));
  mkdirSync(join(root, "services", "app", ".git"), { recursive: true });
  const result = runFlisk(["repos", "list", "--json"], { cwd: root });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(parseEnvelope(result.stdout).data.repos).toEqual([
    { name: "app", url: "https://example.com/team/app.git", path: "services/app", cloned: true },
    {
      name: "missing",
      url: "https://example.com/team/missing.git",
      path: "services/missing",
      cloned: false,
    },
  ]);
});
