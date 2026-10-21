// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyEnvFileSelection,
  assertEngineSupportsEnvFile,
  ENV_FILE_ENGINE_EXIT_CODE,
  ENV_FILE_ERROR_EXIT_CODE,
  EnvFileError,
  envFileWarning,
  isInsideProject,
  missingRequiredEnvKeys,
  PROJECT_ENV_FILE_VAR,
  REQUIRED_ENV_FILE_KEYS,
  readEnvFileValues,
  resolveEnvFilePath,
  selectEnvFile,
} from "../env-selection.js";

const dirs: string[] = [];

const COMPLETE_ENV = [
  "TILT_ENV=dev",
  "DB_PASSWORD=local-db-password",
  "JWT_SECRET=local-jwt-secret",
  "",
].join("\n");

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tdk-env-selection-"));
  dirs.push(root);
  return root;
}

function writeEnv(root: string, name: string, content = COMPLETE_ENV): string {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function vendoredEngine(root: string, content: string): void {
  const path = join(
    root,
    ".tdk",
    ".tdk-out",
    "tdk-cli-ext",
    "engine",
    "topologies",
    "tilt",
    "common",
    "utils_env.star",
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env[PROJECT_ENV_FILE_VAR];
});

describe("resolveEnvFilePath", () => {
  it("resolves a relative path against the current directory", () => {
    const root = projectRoot();
    writeEnv(root, ".env.integration");
    expect(resolveEnvFilePath(root, ".env.integration", { baseDir: root })).toBe(
      join(root, ".env.integration"),
    );
  });

  it("accepts an absolute path inside the project", () => {
    const root = projectRoot();
    const path = writeEnv(root, "config/.env.integration");
    expect(resolveEnvFilePath(root, path, { baseDir: root })).toBe(path);
  });

  it("refuses a path outside the project", () => {
    const root = projectRoot();
    const outside = mkdtempSync(join(tmpdir(), "tdk-env-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, ".env"), COMPLETE_ENV);

    expect(() => resolveEnvFilePath(root, join(outside, ".env"), { baseDir: root })).toThrow(
      /Env file is outside the project/,
    );

    // A file next to the project directory is outside the project too.
    const parent = join(root, "..");
    writeFileSync(join(parent, ".env.next-to-project"), COMPLETE_ENV);
    expect(() =>
      resolveEnvFilePath(root, join(parent, ".env.next-to-project"), { baseDir: root }),
    ).toThrow(/Env file is outside the project/);
  });

  it("refuses a symbolic link that points outside the project", () => {
    const root = projectRoot();
    const outside = mkdtempSync(join(tmpdir(), "tdk-env-outside-"));
    dirs.push(outside);
    const target = join(outside, ".env");
    writeFileSync(target, COMPLETE_ENV);
    symlinkSync(target, join(root, ".env.integration"));

    expect(() => resolveEnvFilePath(root, ".env.integration", { baseDir: root })).toThrow(
      /Env file is outside the project/,
    );
  });

  it("refuses a file that does not exist", () => {
    const root = projectRoot();
    expect(() => resolveEnvFilePath(root, ".env.integration", { baseDir: root })).toThrow(
      /Env file not found/,
    );
  });

  it("refuses a directory", () => {
    const root = projectRoot();
    mkdirSync(join(root, "envs"));
    expect(() => resolveEnvFilePath(root, "envs", { baseDir: root })).toThrow(
      /Env file is not a file/,
    );
  });

  it("refuses an empty path", () => {
    const root = projectRoot();
    expect(() => resolveEnvFilePath(root, "  ", { baseDir: root })).toThrow(
      /No env file was given/,
    );
  });

  it("uses the invalid-argument exit code", () => {
    const root = projectRoot();
    try {
      resolveEnvFilePath(root, ".env.integration", { baseDir: root });
      expect.unreachable("resolveEnvFilePath should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvFileError);
      expect((error as { exitCode?: number }).exitCode).toBe(ENV_FILE_ERROR_EXIT_CODE);
      expect((error as { code?: string }).code).toBe("ENV_FILE_INVALID");
    }
  });
});

describe("selectEnvFile", () => {
  it("returns the absolute path, the project-relative path and the values", () => {
    const root = projectRoot();
    writeEnv(root, ".env.integration");

    const selection = selectEnvFile(root, ".env.integration", { baseDir: root });

    expect(selection.path).toBe(join(root, ".env.integration"));
    expect(selection.relativePath).toBe(".env.integration");
    expect(selection.values.get("TILT_ENV")).toBe("dev");
  });

  it("needs the keys the platform requires, and names only the key", () => {
    const root = projectRoot();
    writeEnv(root, ".env.integration", "TILT_ENV=dev\nDB_PASSWORD=secret-password\n");

    expect(() => selectEnvFile(root, ".env.integration", { baseDir: root })).toThrow(
      /is missing JWT_SECRET/,
    );
    try {
      selectEnvFile(root, ".env.integration", { baseDir: root });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("secret-password");
      expect(message).not.toContain("dev");
    }
  });

  it("treats a key that is present but empty as missing", () => {
    const root = projectRoot();
    writeEnv(root, ".env.integration", COMPLETE_ENV.replace(/JWT_SECRET=.*/, "JWT_SECRET="));

    expect(() => selectEnvFile(root, ".env.integration", { baseDir: root })).toThrow(
      /is missing JWT_SECRET/,
    );
  });

  it("lists the platform keys it requires", () => {
    expect([...REQUIRED_ENV_FILE_KEYS]).toEqual(["TILT_ENV", "DB_PASSWORD", "JWT_SECRET"]);
    expect(missingRequiredEnvKeys(new Map())).toEqual(["TILT_ENV", "DB_PASSWORD", "JWT_SECRET"]);
  });
});

describe("readEnvFileValues", () => {
  it("fails with a clear message when the file cannot be read", () => {
    const root = projectRoot();
    const path = writeEnv(root, ".env.integration");
    chmodSync(path, 0o000);
    const readable = (() => {
      try {
        readFileSync(path, "utf-8");
        return true;
      } catch {
        return false;
      }
    })();
    if (readable) {
      // The test user can read the file anyway (root, or a platform that ignores the mode).
      return;
    }
    expect(() => readEnvFileValues(path)).toThrow(/Could not read env file/);
  });
});

describe("applyEnvFileSelection", () => {
  it("points the engine at the selected file", () => {
    const root = projectRoot();
    writeEnv(root, ".env.integration");
    const selection = selectEnvFile(root, ".env.integration", { baseDir: root });

    applyEnvFileSelection(selection);

    expect(process.env[PROJECT_ENV_FILE_VAR]).toBe(selection.path);
  });
});

describe("assertEngineSupportsEnvFile", () => {
  it("accepts a project whose vendored engine knows the option", () => {
    const root = projectRoot();
    vendoredEngine(root, `PROJECT_ENV_FILE_VAR = '${PROJECT_ENV_FILE_VAR}'\n`);

    expect(() => assertEngineSupportsEnvFile(root)).not.toThrow();
  });

  it("refuses a project whose vendored engine is older than the option", () => {
    const root = projectRoot();
    vendoredEngine(root, "def load_dotenv(project_root=''):\n    pass\n");

    expect(() => assertEngineSupportsEnvFile(root)).toThrow(/does not support --env-file yet/);
    try {
      assertEngineSupportsEnvFile(root);
    } catch (error) {
      expect((error as { code?: string }).code).toBe("ENV_FILE_ENGINE_TOO_OLD");
      expect((error as { exitCode?: number }).exitCode).toBe(ENV_FILE_ENGINE_EXIT_CODE);
    }
  });

  it("accepts a project that has no vendored engine yet", () => {
    expect(() => assertEngineSupportsEnvFile(projectRoot())).not.toThrow();
  });
});

describe("envFileWarning", () => {
  it("warns when the selected file sets another database password", () => {
    const root = projectRoot();
    writeEnv(root, ".env", COMPLETE_ENV);
    writeEnv(
      root,
      ".env.integration",
      COMPLETE_ENV.replace(
        "DB_PASSWORD=local-db-password",
        "DB_PASSWORD=other-db-password",
      ),
    );

    const warning = envFileWarning(
      root,
      selectEnvFile(root, ".env.integration", { baseDir: root }),
    );

    expect(warning).toMatch(/different DB_PASSWORD/);
    expect(warning).not.toContain("other-db-password");
  });

  it("says nothing when the password is the same or the project has no .env", () => {
    const root = projectRoot();
    writeEnv(root, ".env.integration");
    expect(
      envFileWarning(root, selectEnvFile(root, ".env.integration", { baseDir: root })),
    ).toBeNull();

    writeEnv(root, ".env", COMPLETE_ENV);
    expect(
      envFileWarning(root, selectEnvFile(root, ".env.integration", { baseDir: root })),
    ).toBeNull();
  });
});

describe("isInsideProject", () => {
  it("accepts the project directory itself and refuses a path above it", () => {
    const root = projectRoot();
    expect(isInsideProject(root, root)).toBe(true);
    expect(isInsideProject(root, join(root, "a", "b"))).toBe(true);
    expect(isInsideProject(root, join(root, "..", "elsewhere"))).toBe(false);
  });

  it("does not mistake a sibling directory that starts with two dots for a path above the project", () => {
    const root = projectRoot();
    expect(isInsideProject(root, join(root, "..config"))).toBe(true);
  });
});
