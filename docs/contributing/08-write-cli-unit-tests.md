# 8. Write unit tests for the CLI

Unit tests in Flisk verify CLI commands, generators, and utility modules without starting a live Docker or Tilt stack. This guide explains how to write fast, hermetic, and deterministic unit tests using Vitest, how to mock external systems, how to test with temporary projects and golden files, and how to avoid common pitfalls.

For end-to-end tests that boot a running stack, see [writing an e2e test](05-write-e2e.md). For how unit tests are organized across CI shards, see [run unit tests in a matrix](07-unit-test-matrix.md).

---

## 1. Unit test basics

Flisk uses [Vitest](https://vitest.dev/) for CLI unit testing.

### Where tests live

- Place unit tests in a `__tests__/` directory directly next to the module under test:
  - CLI commands: `cli/src/commands/__tests__/<command>.test.ts`
  - Code generators: `cli/src/generator/__tests__/<generator>.test.ts`
  - Shared utilities: `cli/src/utils/__tests__/<utility>.test.ts`
- **Naming convention**: Name the test file after the source file, suffixed with `.test.ts` (or `.test.tsx` for Ink-based terminal UI components). For example, `completion-install.test.ts` tests `completion-install.ts`.

### Core Vitest structure

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPathSafe } from "../paths.js";

describe("isPathSafe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["ordinary relative path", "src/index.ts", true],
    ["parent traversal", "../secret", false],
    ["nested traversal", "a/../../b", false],
    ["empty string", "", false],
  ])("%s -> %s", (_label, input, expected) => {
    expect(isPathSafe(input)).toBe(expected);
  });
});
```

### Table-driven tests (`it.each`)

Prefer parameterized tables (`it.each`) for pure functions and validators. Every input-handling function should test:
1. **Happy path**: valid inputs for each documented format.
2. **Empty and error cases**: empty strings, missing keys, malformed inputs, and thrown exceptions.
3. **Boundary conditions**: edge values (e.g., minimum and maximum ports, path depth limits).

---

## 2. Running unit tests

You can run tests with Bun or Node.js from the repository root:

| Task | Command | Notes |
| --- | --- | --- |
| Run all unit tests | `bun run test` | Fast run across all test suites |
| Run a single test file | `bun run test -- <filename>` | e.g. `bun run test -- completion-install` |
| Filter by test name | `bun run test -t "<test-name>"` | Matches `describe` or `it` titles |
| Watch mode | `bun run test --watch` | Re-runs on file changes |
| Generate coverage report | `cd cli && bun run test:coverage` | Writes HTML report to `cli/coverage/index.html` |
| Pre-PR verification | `make test-ts` | Runs typecheck, lint, and full test suite |

---

## 3. Mocking external tools and dependencies

Unit tests must stay isolated from the host environment: they should never depend on running network services, live Docker engines, or external binaries unless specifically marked as integration tests.

### Mocking built-in Node modules

Mock child processes, network sockets, or file systems with Vitest:

```ts
import { describe, expect, it, vi } from "vitest";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));

describe("execExternalTool", () => {
  it("invokes external CLI with proper flags", () => {
    vi.mocked(childProcess.spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from("ok"),
      stderr: Buffer.from(""),
      output: [],
      pid: 1234,
      signal: null,
    });

    // Run your module under test...
    expect(childProcess.spawnSync).toHaveBeenCalledWith("git", ["status"], expect.any(Object));
  });
});
```

### Mocking internal Flisk utilities with `importOriginal`

When you only need to override specific functions while keeping the rest of a module intact, use `importOriginal`:

```ts
import { describe, expect, it, vi } from "vitest";
import { findProjectRoot } from "../../utils/paths.js";

vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  findProjectRoot: vi.fn(),
}));

describe("command requiring project root", () => {
  it("fails gracefully when outside a project", async () => {
    vi.mocked(findProjectRoot).mockReturnValue(null);

    // Call command function...
    expect(findProjectRoot).toHaveBeenCalled();
  });
});
```

### Capturing process exit and test doubles

Use the test helpers from `cli/src/test-support/doubles.ts`:

- **`captureExit()`**: Intercepts `process.exit` without terminating the Vitest test runner.
- **`makeResource(name, appType, config)`**: Builds an in-memory `DiscoveredResource` object for pure logic tests without creating files on disk.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureExit, makeResource } from "../../test-support/doubles.js";

describe("command exit handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits with status 1 on invalid argument", async () => {
    const { expectExit } = captureExit();
    const resource = makeResource("my-api", "backend", { port: 4000 });

    // Expect the function to call process.exit(1)
    await expect(async () => {
      // functionUnderTest(resource);
    }).rejects.toThrow("process.exit");

    expectExit(1);
  });
});
```

---

## 4. Working with the file system and golden files

### Temporary projects with `createTempProject`

When testing discovery, configuration loading, or file generators, use `createTempProject` from `cli/src/test-support/temp-project.ts`. It creates an isolated directory in the system temp directory and registers automatic cleanup via `onTestFinished`:

```ts
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject } from "../../test-support/temp-project.js";

describe("service discovery", () => {
  it("finds services defined in stacks", () => {
    const projectRoot = createTempProject({
      projectJson: { name: "test-landscape" },
      stacks: {
        api: {
          "user-service": { port: 4001, appType: "backend" },
          "order-service": { port: 4002, appType: "backend" },
        },
      },
      files: {
        "README.md": "# Test Project",
      },
    });

    expect(fs.existsSync(path.join(projectRoot, "services/api/user-service/service.json"))).toBe(true);
    // run discovery on projectRoot...
  });
});
```

### Testing generated outputs and golden files

When validating code generators (such as Dockerfiles, Tiltfiles, or Vite configs), compare the generated output against deterministic golden assertions:

1. **Exact or substring matching**: Test critical directives directly:
   ```ts
   expect(generatedTiltfile).toContain("GOLDEN_IMAGE_RESOURCE = Infra.load_all(");
   expect(generatedDockerfile).toMatch(/^FROM scratch\b/m);
   ```
2. **Snapshot testing**: For large templates or structured JSON where complete regression locking is intended:
   ```ts
   expect(generatedConfig).toMatchSnapshot();
   // Or inline:
   expect(formatOutput(data)).toMatchInlineSnapshot(`"..."`);
   ```
   To update snapshots after intentional changes, run `bun run test -u`.

---

## 5. Common pitfalls to avoid

1. **State leakage between tests**:
   - Always restore mocks in `afterEach(() => { vi.restoreAllMocks(); })`.
   - If a test alters `process.env`, capture the original value in `beforeEach` and restore it in `afterEach`.
2. **Hardcoded platform-specific paths**:
   - Never hardcode `/` or `\` in path comparisons. Use `path.join()`, `path.resolve()`, or normalize paths with `path.normalize()`.
3. **Spawning unmocked subprocesses**:
   - Spawning Docker, Tilt, or shell scripts in unit tests makes tests slow and brittle across environments (especially on Windows / WSL2). Use Vitest mocks or move the test to `tests/e2e/`.
4. **Ignoring coverage baseline ratchets**:
   - High-risk CLI modules are guarded by `cli/coverage-baseline.json`. Check that your new tests maintain or raise line and branch coverage (`cd cli && bun run test:coverage`).
5. **Swallowing errors silently**:
   - Avoid empty `catch {}` blocks in tests. Always assert either that an operation succeeds or that the expected typed error is thrown (`await expect(...).rejects.toThrow(...)`).

---

## 6. High-value unit test patterns in the codebase

Rather than reinventing test patterns from scratch, reference these canonical, high-value unit test suites across the repository. Each exemplifies a specific testing approach that maximizes confidence while keeping execution fast and hermetic.

### Pattern 1: Pure utility test with parameterization and table-driven cases
- **Reference**: [`cli/src/utils/__tests__/validation.test.ts`](../../cli/src/utils/__tests__/validation.test.ts) and [`cli/src/utils/__tests__/paths.test.ts`](../../cli/src/utils/__tests__/paths.test.ts)
- **Why this pattern is valuable**:
  - Tests pure path algorithms, kebab-case rules, and schema validators in sub-millisecond execution.
  - Leverages table-driven `it.each` to exhaustively test happy paths, directory-traversal exploits (`../secret`, `a/../../b`), empty strings, and malformed characters.
  - Leaves zero state behind by never touching real disk I/O.
- **Key pattern snippet**:
  ```ts
  describe("validateResourceName", () => {
    it.each([
      ["hyphenated", "my-service"],
      ["letters and digits", "service123"],
      ["hyphenated gateway", "api-gateway"],
      ["single letter", "a"],
      ["digits and hyphens", "test-123-abc"],
    ])("should validate correct kebab-case name (%s): %s", (_label, name) => {
      expect(validateResourceName(name)).toEqual({ valid: true });
    });
  });
  ```

### Pattern 2: Command test avoiding full E2E
- **Reference**: [`cli/src/commands/__tests__/completion-install.test.ts`](../../cli/src/commands/__tests__/completion-install.test.ts) and [`cli/src/commands/__tests__/flag-contract.test.ts`](../../cli/src/commands/__tests__/flag-contract.test.ts)
- **Why this pattern is valuable**:
  - Tests CLI commands and argument contracts without running full integration suites or modifying the host shell environment (`~/.bashrc`, `~/.zshrc`).
  - Mocks `node:os` homedir and captures console stdout/stderr while operating entirely within a temporary scratch directory (`mkdtempSync`), cleaning up in `afterEach`.
- **Key pattern snippet**:
  ```ts
  const home = vi.hoisted(() => ({ dir: "" }));
  vi.mock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return { ...actual, homedir: () => home.dir };
  });

  let workDir: string;
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "tdk-completion-"));
    home.dir = join(workDir, "home");
    mkdirSync(home.dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("installs the bash script under ~/.bash_completion.d and prints the source line", async () => {
    const { stdout } = await runCompletion(["bash", "--install"]);
    const installPath = join(home.dir, ".bash_completion.d", "tdk-completion.bash");
    expect(readFileSync(installPath, "utf-8")).toContain("complete -F _tdk_completions flisk");
    expect(stdout).toContain("Installed bash completion to:");
  });
  ```

### Pattern 3: Hermetic generator unit tests vs. tool-backed golden tests
- **Reference**: [`cli/src/commands/__tests__/frontend-vite-generator.test.ts`](../../cli/src/commands/__tests__/frontend-vite-generator.test.ts) (hermetic generator unit test) and [`cli/src/utils/__tests__/golden-build-tilt.test.ts`](../../cli/src/utils/__tests__/golden-build-tilt.test.ts) (tool-backed Tilt integration test)
- **Why this pattern is valuable**:
  - Distinguishes hermetic unit tests that evaluate generator logic and Starlark templates in-memory without spawning container engines, from tool-backed integration suites that test Tilt-generated shell scripts against a mock Docker executable on PATH.
  - Verifies exact directive presence (`FROM scratch`, `GOLDEN_IMAGE_RESOURCE = Infra.load_all(...)`) and structural snapshot fidelity across different service configurations.
- **Key pattern snippet**:
  ```ts
  // Hermetic generator unit test: evaluates Starlark templates in memory
  it("generates deterministic vite frontend definitions", async () => {
    const result = await evaluateStarlark(frontendGenerator, {
      project_name: "my-app",
      port: 3000,
    });
    expect(result.stdout).toContain("vite_frontend");
  });

  // Tool-backed golden build test: exercises generated script against fake docker
  it("checks the skip, bake, version-gate and serial-fallback paths", () => {
    const script = generatedGoldenScript();
    const result = runGolden(script, { labelMatches: true });
    expect(result.built).toBe(false);
  });
  ```

### Pattern 4: Error-path and edge-case coverage
- **Reference**: [`cli/src/commands/__tests__/error-handling.test.ts`](../../cli/src/commands/__tests__/error-handling.test.ts) (in-process unit error tests) and [`cli/src/commands/__tests__/project-root-errors.test.ts`](../../cli/src/commands/__tests__/project-root-errors.test.ts) (subprocess CLI entrypoint test)
- **Why this pattern is valuable**:
  - Pure unit error tests (`error-handling.test.ts`) assert typed exceptions, rejection reasons, and input validation in sub-millisecond execution without spawning processes.
  - As an explicit documented exception, CLI process tests (`project-root-errors.test.ts`) use `spawnSync` on the compiled `tdk.js` binary to assert that unhandled exceptions do not leak raw stack traces to the user and that consistent human-readable errors and exit codes (exit 1) are returned across commands outside a project root.
- **Key pattern snippet**:
  ```ts
  // In-process unit error validation:
  it("rejects invalid resource names with actionable error message", () => {
    const result = validateResourceName("Invalid_Name!");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("lowercase letters, numbers, and hyphens only");
  });

  // CLI entrypoint error test (subprocess exception):
  it("uses identical human-readable errors across project commands", () => {
    const results = commands.map((command) => runOutsideProject([command]));
    expect(results.map((result) => result.status)).toEqual([1, 1, 1, 1]);
    expect(new Set(results.map((result) => result.stderr)).size).toBe(1);
    expect(results[0].stderr).toContain("initialize a new project");
  });
  ```
