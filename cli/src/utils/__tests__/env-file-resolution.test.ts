// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateStarlark, tiltAvailable } from "../../test-support/index.js";

// The env file of a run. `flisk up --env-file <path>` sets TDK_ENV_FILE, and the engine reads that file
// instead of the project .env - for the Tilt environment and for the Compose interpolation alike.
// These tests run the engine's own Starlark under Tilt, so a change in the resolution shows up here.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const envUtils = join(repoRoot, "engine/topologies/tilt/common/utils_env.star");
const composeRegistration = join(
  repoRoot,
  "engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star",
);
const infraLoader = join(repoRoot, "engine/topologies/tilt/resources/infra-loader.star");
const hasTilt = tiltAvailable();

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs a Tiltfile body in a scratch project and returns the value it wrote to `out.json`. */
function runStarlark(file: string, body: string, env: Record<string, string> = {}): unknown {
  const result = evaluateStarlark(file, {
    args: `${body}\nlocal('cat > out.json', quiet = True, stdin = encode_json(RESULT))\n`,
    env: { TDK_ENV_FILE: "", ...env },
  });
  if (result.status !== 0) throw new Error(`tilt failed: ${result.stderr || result.stdout}`);
  return JSON.parse(readFileSync(join(result.dir, "out.json"), "utf-8"));
}

describe.skipIf(!hasTilt)("the env file of a run", () => {
  it("is the file TDK_ENV_FILE names, and the project .env is not read then", () => {
    const dir = mkdtempSync(join(tmpdir(), "tdk-selected-env-"));
    dirs.push(dir);
    const selected = join(dir, ".env.integration");
    writeFileSync(selected, "TDK_T_SELECTED=fromselected\n");
    try {
      const result = runStarlark(
        envUtils,
        `load(${JSON.stringify(envUtils)}, "load_dotenv", "project_env_file")
load_dotenv("/project")
RESULT = {
  "selected": project_env_file("/project"),
  "from_selected": os.environ.get("TDK_T_SELECTED", "<unset>"),
  "from_project": os.environ.get("TDK_T_PROJECT", "<unset>"),
}`,
        { TDK_ENV_FILE: selected },
      ) as { selected: string; from_selected: string; from_project: string };

      expect(result.selected).toBe(selected);
      expect(result.from_selected).toBe("fromselected");
      expect(result.from_project).toBe("<unset>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is the project .env when no file is selected", () => {
    const result = runStarlark(
      envUtils,
      `load(${JSON.stringify(envUtils)}, "project_env_file")
RESULT = {
  "rooted": project_env_file("/project"),
  "bare": project_env_file(""),
}`,
    ) as { rooted: string; bare: string };

    expect(result.rooted).toBe("/project/.env");
    expect(result.bare).toBe(".env");
  });
});

describe("the engine resolves the env file of a run in one place", () => {
  // The Compose entry and the shared infrastructure both need the env file of the run. A hardcoded
  // `.env` in either of them would quietly ignore the selection, so the resolution goes through
  // project_env_file().
  it("reads the env file of the run instead of a hardcoded .env", () => {
    for (const file of [composeRegistration, infraLoader]) {
      const source = readFileSync(file, "utf-8");
      expect(source, `${file} must resolve the env file of the run`).toContain("project_env_file(");
      expect(source, `${file} must not hardcode the project .env`).not.toMatch(
        /project_root \+ '\/\.env'/,
      );
      expect(source, `${file} must not hardcode the project .env`).not.toMatch(
        /root_prefix \+ '\.env'/,
      );
    }
  });

  it("loads the env file of the run into the Tilt environment", () => {
    const source = readFileSync(envUtils, "utf-8");
    expect(source).toContain("PROJECT_ENV_FILE_VAR");
    expect(source).toContain("env_path = project_env_file(project_root)");
  });
});

describe.skipIf(!hasTilt)("the selected env file is read by the engine", () => {
  it("keeps the selected value in the Tilt environment, which is what Compose interpolates", () => {
    // Docker Compose prefers the shell environment over --env-file, so the engine has to load the
    // selected file into os.environ. Otherwise the run would interpolate the project .env values.
    const dir = mkdtempSync(join(tmpdir(), "tdk-selected-env-"));
    dirs.push(dir);
    const selected = join(dir, ".env.integration");
    writeFileSync(selected, "TDK_T_SELECTED=fromselected\n");
    const project = join(dir, "project");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, ".env"), "TDK_T_SELECTED=fromproject\n");

    const result = runStarlark(
      envUtils,
      `load(${JSON.stringify(envUtils)}, "load_dotenv")
load_dotenv(${JSON.stringify(project)})
RESULT = {"value": os.environ.get("TDK_T_SELECTED", "<unset>")}`,
      { TDK_ENV_FILE: selected },
    ) as { value: string };

    expect(result.value).toBe("fromselected");
  });
});
