# 7. Run unit tests in a matrix

Unit tests run in one `cli` vitest job today. This page describes how to split them into parallel matrix legs in the same shape as the e2e groups (see [run e2e suites in a matrix](06-e2e-matrix.md)), and how to write a new unit test so it fits a leg. It is the model for the coverage and unit-test items in the [test-quality initiative](https://github.com/tdk-landscape/tdk-cli-core/issues/1388).

## What a unit test is here

A unit test lives in `cli/src/**/__tests__/` and does not start Docker, Tilt or a stack. Three kinds exist, and only the first is a unit test:

| Kind | File pattern | Runs in |
|---|---|---|
| unit | `*.test.ts` that mocks I/O | the unit matrix |
| CLI integration | `*-e2e.test.ts` that spawns `tdk` on a temp project, no stack | the `cli-integration` group |
| stack-backed | anything that boots Tilt or Compose | a live-stack e2e suite, see [write an e2e test](05-write-e2e.md) |

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

Every function that handles input covers three groups of rows:

- **happy path**: one valid input per documented form;
- **empty and error**: empty input, the error code or message the function returns, and a thrown error where it throws;
- **recovery**: a call after an error still works (no cached bad state), and an injected failure does not leave a file or a prompt half done.

A test that mocks I/O restores the mock in `afterEach` (`vi.restoreAllMocks()`), so no test depends on the order of the others.

## Split the suite into legs

Vitest can split one run across legs with `--shard`. The matrix is the set of shard indexes, and each leg runs one slice:

```yaml
unit:
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - run: npx vitest run --shard=${{ matrix.shard }}/4 --reporter=json --outputFile=results-${{ matrix.shard }}.json
```

Rules for legs:

- **Keep legs equal in time.** Vitest balances by file, so keep one file per concern. Check each leg's duration in the job summary and raise the shard count when the slowest leg is twice the fastest.
- **Do not share state between legs.** A leg must not depend on a file another leg wrote. Tests that touch the built `cli/dist` stay out of the matrix and run in the build job.
- **Keep the pull-request run fast.** The unit matrix runs on every pull request. Anything slower than a few minutes moves to `nightly`.
- **Merge the reports.** Each leg uploads its JSON report. One final job merges them for the PR summary and the coverage table.
- **Gate once.** A final `gate` job fails when any leg failed, and that job is the required check. A skipped leg must not pass.

## Add a unit test

1. Put the test next to the code under `cli/src/<area>/__tests__/<name>.test.ts`.
2. Start with the happy path, then add the empty, error and recovery rows.
3. Use `it.each` for any input space with more than two rows.
4. Mock only the boundary (process, filesystem, prompt, network). Do not mock the function under test.
5. Run it alone with `cd cli && npx vitest run <path>`, then the full suite with `make test-ts`.

## Coverage per area

Coverage is measured per area, not globally. Each leg uploads its coverage JSON, and the gate compares each area with its recorded baseline (see the ratchet item in the initiative). An area is one of: command implementations, validation, discovery, stack and project handling, install and update.

## Check it locally

```bash
cd cli && npx vitest run --shard=1/4
make test-ts
```

The first command runs one leg. The second runs the whole TypeScript suite the way CI does.
