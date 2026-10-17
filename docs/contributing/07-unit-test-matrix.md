# 7. Run unit tests in a matrix

Unit tests run in one `cli` vitest job today, and the matrix on this page is **proposed, not yet in CI**. This page describes how to split them into parallel matrix legs in the same shape as the e2e groups (see [run e2e suites in a matrix](06-e2e-matrix.md)), and how to write a new unit test so it fits a leg. It is the model for the coverage and unit-test items in the [test-quality initiative](https://github.com/tdk-landscape/tdk-cli-core/issues/1388).

## What a unit test is here

A unit test lives in `cli/src/**/__tests__/` and does not boot a live stack. Three kinds exist:

| Kind | File pattern | Runs in |
|---|---|---|
| unit | `*.test.ts` that mocks I/O | the unit matrix |
| CLI integration | `*-e2e.test.ts` that spawns `tdk` on a temp project, no stack | the vitest run; not a live-stack group |
| stack-backed | anything that boots a running Tilt or Compose stack | a live-stack e2e suite, see [write an e2e test](05-write-e2e.md) |

Some tests run a real tool without a stack, such as Tilt for the Starlark generator tests. They are not fully mocked. They stay in the unit job until they are split out, so do not describe them as mocked.

If a test needs a running stack, it is not a unit test. Move it to an e2e suite instead of skipping it.

## Shape of a unit-test file

Group by the function under test. Use a table for the input space and write each row as one named case, so a failure names the input.

```ts
describe("isPathSafe", () => {
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

Every function that handles input covers these rows:

- **happy path**: one valid input per documented form;
- **empty and error**: empty input, the error code or message the function returns, and a thrown error where it throws;
- **boundaries**: values at the edges of each documented range or format (for example port 1, 65535, and 65536).

Add **recovery** rows only when the function has mutable state, performs a side effect, or can leave partly finished work behind (a file write, a prompt, a cache, a process). For pure functions, partition the inputs meaningfully instead of adding recovery rows to meet a checklist.

A test that mocks I/O restores the mock in `afterEach` (`vi.restoreAllMocks()`), so no test depends on the order of the others.

## Split the suite into legs (proposed)

Nothing below exists in CI yet. Do not copy it into a workflow until the implementation issue (#1380 for coverage output, #1381 for the gate) has landed and been run end to end, including the blob merge and the coverage file the gate reads.

Vitest can split one run across legs with `--shard`. The matrix is the set of shard indexes, and each leg runs one slice and writes a blob report. A final job merges the blobs:

```yaml
unit:
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    # checkout, Bun and Node setup, and `bun install --frozen-lockfile` run first, as in the Test job of ci.yml
    - working-directory: cli
      run: npx vitest run --shard=${{ matrix.shard }}/4 --reporter=blob
    - uses: actions/upload-artifact@v7
      with:
        name: unit-blob-${{ matrix.shard }}
        path: cli/.vitest-reports/
```

The final job downloads the blobs and runs `npx vitest --merge-reports` in `cli`. Check that this produces the merged coverage the gate needs before the gate depends on it.

Rules for legs:

- **Keep legs equal in time.** Vitest shards split by file, not by time, so keep one file per concern. Check each leg's duration in the job summary and raise the shard count when the slowest leg is twice the fastest.
- **Do not share state between legs.** A leg must not depend on a file another leg wrote. Tests that touch the built `cli/dist` stay out of the matrix and keep their own job.
- **Keep the pull-request run fast.** The unit matrix runs on every pull request. Anything slower than a few minutes moves to `nightly`.
- **Merge the reports once.** The final job merges the blob reports for the PR summary and the coverage table. Legs do not post comments.
- **Gate once.** A final `gate` job fails when any leg failed, and that job is the required check. A skipped leg must not pass.

## Add a unit test

1. Put the test next to the code under `cli/src/<area>/__tests__/<name>.test.ts`.
2. Start with the happy path, then cover meaningful empty, error and boundary cases. Add recovery cases when the function's state or side effects make them relevant.
3. Use `it.each` for any input space with more than two rows.
4. Mock only the boundary (process, filesystem, prompt, network). Do not mock the function under test.
5. Run it alone with `cd cli && npx vitest run <path>`, then the full suite with `make test-ts`.

## Coverage per area

Coverage is measured per area, not globally. Each leg writes its coverage data, the final job merges it, and the gate compares each area with its recorded baseline (see the ratchet item in the initiative). An area is one of: command implementations, validation, discovery, stack and project handling, install and update.

## Check it locally

```bash
cd cli && npx vitest run --shard=1/4
make test-ts
```

The first command runs one leg. The second runs the whole TypeScript suite the way CI does.
