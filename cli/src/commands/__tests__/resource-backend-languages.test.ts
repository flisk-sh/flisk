// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BACKEND_LANGUAGES, DEFAULT_BACKEND_LANGUAGE } from "../../backend-languages/registry.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = join(repoRoot, "cli", "bin", "tdk.js");

function tdk(args: string[], cwd: string, input = "y\n") {
  return spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    encoding: "utf-8",
    input,
    env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
  });
}

function listFiles(root: string, dir = root): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? listFiles(root, path) : [relative(root, path)];
    })
    .sort();
}

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

// Captured from the CLI on main before the provider extraction: `tdk resource orders-api
// --type backend --stack shop` with no --language. Any drift here changes historical output.
// The service.json hash was re-captured on purpose, twice, so a fresh scaffold writes the keys the engine reads and trips no warning:
// the unread `healthCheck` became `healthCheckPath` (#402), and the deprecated `dependencies` became `dependsOn`.
const BUN_BASELINE: Record<string, string> = {
  Dockerfile: "d5d856331ea4307ac42e36886407298a9fc63b1600b4ed18870940a6ec72a063",
  "package.json": "398877b088717f97af437af3d2233a7863af6ef442a62ba0fafcf29830d29ee1",
  "service.json": "bc6598c626865ea3350e5204bbdb14aefd0eb0c36e64b6db6b8c6fe01ae76e6f",
  "src/index.ts": "f50139530382e929db7128be7cb55f3bbc5f2fae03264979d675d3be4d0f4ef3",
  "tests/orders-api.test.ts": "a4946ac3123eb4bee78d7b84304cad8b7c36d4268688e3c878da2aaa11ef98ab",
  "tsconfig.json": "c0503e8c2d9e7cb0b77a1e0eaea674f4ee03f3182ff9f5429b9bb7ba0fabee41",
};

describe("backend language registry", () => {
  it("keeps Bun the default and registers exactly bun, go, node, python, rust", () => {
    expect(DEFAULT_BACKEND_LANGUAGE).toBe("bun");
    expect(Object.keys(BACKEND_LANGUAGES).sort()).toEqual(["bun", "go", "node", "python", "rust"]);
  });

  it("keeps the service schema open to every registered language", () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, "engine", "schemas", "service-schema.json"), "utf-8"),
    );
    expect(schema.properties.language.enum).toBeUndefined();
    const idPattern = new RegExp(schema.properties.language.pattern);
    for (const id of Object.keys(BACKEND_LANGUAGES)) expect(id).toMatch(idPattern);
  });

  it("does not add generated-service dependencies to the CLI package", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "cli", "package.json"), "utf-8"));
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const forbidden of ["fastapi", "uvicorn", "@hono/node-server"]) {
      expect(all).not.toContain(forbidden);
    }
  });
});

describe("tdk resource --language", () => {
  let projectRoot = "";

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-backend-language-"));
    execFileSync(process.execPath, [cliBin, "project", "--yes"], {
      cwd: projectRoot,
      env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
    });
  }, 30000);

  afterAll(() => {
    if (projectRoot.startsWith(tmpdir())) rmSync(projectRoot, { recursive: true, force: true });
  });

  const dir = (name: string) => join(projectRoot, "services", "shop", name);
  const service = (name: string) =>
    JSON.parse(readFileSync(join(dir(name), "service.json"), "utf-8"));

  it("keeps the historical Bun output when --language is omitted", () => {
    const result = tdk(
      ["resource", "orders-api", "--type", "backend", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status).toBe(0);

    const root = dir("orders-api");
    expect(listFiles(root)).toEqual(Object.keys(BUN_BASELINE).sort());
    for (const [file, hash] of Object.entries(BUN_BASELINE)) {
      expect(sha(join(root, file)), file).toBe(hash);
    }
    expect(service("orders-api").language).toBeUndefined();
  });

  it("scaffolds Python with FastAPI, a pytest smoke test, and no Dockerfile of its own", () => {
    const result = tdk(
      ["resource", "py-api", "--type", "backend", "--language", "python", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status).toBe(0);

    const root = dir("py-api");
    expect(service("py-api")).toMatchObject({
      language: "python",
      appType: "backend",
      healthCheckPath: "/health",
    });
    expect(listFiles(root)).toEqual([
      "pyproject.toml",
      "service.json",
      "src/main.py",
      "tests/test_health.py",
    ]);
    const pyproject = readFileSync(join(root, "pyproject.toml"), "utf-8");
    expect(pyproject).toMatch(/fastapi==/);
    expect(pyproject).toMatch(/uvicorn\[standard\]==/);
    // The image is generated by the engine, so the scaffold ships no Dockerfile and no build block.
    expect(existsSync(join(root, "Dockerfile"))).toBe(false);
    expect(service("py-api")).not.toHaveProperty("build");
    const healthTest = readFileSync(join(root, "tests/test_health.py"), "utf-8");
    expect(healthTest).toContain('"/health"');
    expect(healthTest).toContain("def test_root()");
    expect(healthTest).toContain('client.get("/")');
  });

  it("scaffolds Go with net/http, a go test smoke test, and no Dockerfile of its own", () => {
    const result = tdk(
      ["resource", "go-api", "--type", "backend", "--language", "go", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    const root = dir("go-api");
    expect(service("go-api")).toMatchObject({
      language: "go",
      appType: "backend",
      healthCheckPath: "/health",
    });
    expect(listFiles(root)).toEqual(["go.mod", "main.go", "main_test.go", "service.json"]);
    const goTest = readFileSync(join(root, "main_test.go"), "utf-8");
    expect(goTest).toContain("func TestRoot(");
    expect(goTest).toContain('httptest.NewRequest(http.MethodGet, "/", nil)');
    expect(readFileSync(join(root, "go.mod"), "utf-8")).toContain("module go-api");
    const main = readFileSync(join(root, "main.go"), "utf-8");
    expect(main).toContain('os.Getenv("PORT")');
    expect(main).toContain('"GET /health"');
    // Listening on ":" + port binds every interface, which Traefik needs inside the container network.
    expect(main).toContain('http.ListenAndServe(":"+port');
    // No dependency manifest of Bun's, no Prisma, and the image is generated by the engine.
    expect(existsSync(join(root, "package.json"))).toBe(false);
    expect(existsSync(join(root, "Dockerfile"))).toBe(false);
    expect(service("go-api")).not.toHaveProperty("build");
    // Go keeps its files at the root, so the empty src/ and tests/ folders are not created (Python still gets both).
    expect(existsSync(join(root, "src"))).toBe(false);
    expect(existsSync(join(root, "tests"))).toBe(false);
    expect(service("go-api").featuresEnabled).not.toContain("prisma");
  }, 15000);

  it("scaffolds Rust with axum, a cargo test smoke test, and no Dockerfile of its own", () => {
    const result = tdk(
      ["resource", "rust-api", "--type", "backend", "--language", "rust", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    const root = dir("rust-api");
    expect(service("rust-api")).toMatchObject({
      language: "rust",
      appType: "backend",
      healthCheckPath: "/health",
    });
    expect(listFiles(root)).toEqual(["Cargo.toml", "service.json", "src/main.rs"]);
    const cargo = readFileSync(join(root, "Cargo.toml"), "utf-8");
    expect(cargo).toContain('name = "rust-api"');
    // The image copies the release binary by this fixed name, whatever the resource is called.
    expect(cargo).toContain('[[bin]]\nname = "app"');
    expect(cargo).toContain("axum");
    const main = readFileSync(join(root, "src/main.rs"), "utf-8");
    expect(main).toContain('std::env::var("PORT")');
    expect(main).toContain('"/health"');
    expect(main).toContain('format!("0.0.0.0:{port}")');
    expect(main).toContain("#[tokio::test]");
    expect(existsSync(join(root, "package.json"))).toBe(false);
    expect(existsSync(join(root, "Dockerfile"))).toBe(false);
    expect(existsSync(join(root, "tests"))).toBe(false);
    expect(service("rust-api")).not.toHaveProperty("build");
    expect(service("rust-api").featuresEnabled).not.toContain("prisma");
  }, 15000);

  it("scaffolds Node with node:http, node:test, and no Dockerfile of its own", () => {
    const result = tdk(
      ["resource", "node-api", "--type", "backend", "--language", "node", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    const root = dir("node-api");
    expect(service("node-api")).toMatchObject({
      language: "node",
      appType: "backend",
      healthCheckPath: "/health",
    });
    expect(listFiles(root)).toEqual([
      "package-lock.json",
      "package.json",
      "service.json",
      "src/index.js",
      "tests/health.test.js",
    ]);
    // The generated Dockerfile copies package*.json into an empty directory and runs `npm ci`, which fails without a
    // lockfile (#1344). Do the same here: the project root above the service is a workspace, so npm must run elsewhere.
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf-8"));
    expect(lock).toMatchObject({ name: "node-api", lockfileVersion: 3 });
    const isolated = mkdtempSync(join(tmpdir(), "node-api-ci-"));
    try {
      for (const file of ["package.json", "package-lock.json"]) {
        writeFileSync(join(isolated, file), readFileSync(join(root, file)));
      }
      const ci = spawnSync("npm", ["ci", "--omit=dev"], { cwd: isolated, encoding: "utf-8" });
      expect(ci.status, ci.stderr).toBe(0);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
    expect(pkg.name).toBe("node-api");
    expect(pkg.type).toBe("module");
    expect(pkg.scripts.dev).toBe("node --watch src/index.js");
    expect(pkg.scripts.test).toBe("node --test");

    const index = readFileSync(join(root, "src/index.js"), "utf-8");
    expect(index).toContain('import http from "node:http"');
    expect(index).toContain('"/health"');
    expect(index).toContain('"0.0.0.0"');

    expect(existsSync(join(root, "Dockerfile"))).toBe(false);
    expect(existsSync(join(root, "tsconfig.json"))).toBe(false);
    expect(service("node-api")).not.toHaveProperty("build");
    expect(service("node-api").featuresEnabled).not.toContain("prisma");
  }, 15000);

  it("rejects a framework for Go like it does for Python", () => {
    const result = tdk(
      [
        "resource",
        "go-fw",
        "--type",
        "backend",
        "--language",
        "go",
        "--framework",
        "express",
        "--stack",
        "shop",
      ],
      projectRoot,
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/cannot be combined with --language go/);
    expect(existsSync(dir("go-fw"))).toBe(false);
  }, 15000);

  it("persists an explicit bun selection", () => {
    const result = tdk(
      ["resource", "bun-api", "--type", "backend", "--language", "bun", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status).toBe(0);
    expect(service("bun-api").language).toBe("bun");
    expect(listFiles(dir("bun-api"))).toEqual(
      Object.keys(BUN_BASELINE)
        .map((f) => f.replace("orders-api", "bun-api"))
        .sort(),
    );
  });

  it("rejects an unknown language before creating the directory", () => {
    const result = tdk(
      ["resource", "ruby-api", "--type", "backend", "--language", "ruby", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    for (const id of ["bun", "python", "go", "rust", "node"]) expect(output).toContain(id);
    expect(existsSync(dir("ruby-api"))).toBe(false);
  });

  it.each(["frontend", "worker", "bring-your-own", "sdk"])(
    "rejects --language on a %s resource",
    (type) => {
      const name = `lang-${type}`;
      const result = tdk(
        ["resource", name, "--type", type, "--language", "python", "--stack", "shop"],
        projectRoot,
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "--language can only be used with --type backend",
      );
      expect(existsSync(dir(name))).toBe(false);
    },
  );
});
