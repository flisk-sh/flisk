## 1. Preflight foundation

- [x] 1.1 Inspect `doctor.ts`, `doctor-runtime.ts`, project detection, and existing doctor tests; identify reusable check functions and output contracts.
- [x] 1.2 Implement `cli/src/utils/cold-preflight.ts` with Node threshold helper, project-aware ordered checks, structured result, formatter, and safe conversion of missing Docker/Tilt into failed checks.
- [x] 1.3 Add focused unit tests in `cli/src/utils/cold-preflight.test.ts` for Node versions, headers, ordering, and omission of Prisma outside projects.

## 2. CLI integration

- [x] 2.1 Add the plain JavaScript Node 22.12+ guard to `cli/bin/flisk.js` before compiled CLI loading, preserving the file's module system.
- [x] 2.2 Change no-argument handling in `cli/src/cli.ts` to print preflight plus the concise command hint and set exit status from readiness.
- [x] 2.3 Add `--doctor` alias behavior and wire `doctor` to print ranked preflight before existing detailed diagnostics.
- [x] 2.4 Add a single early machine-readiness gate to `project` and `up` command actions before side effects; retain help/version/completion bypass behavior.

## 3. Documentation

- [x] 3.1 Add the root README cold npx / first-run section and npx install invocation, keeping the new section within the requested 8–15 lines.
- [x] 3.2 Update `cli/README.md` doctor documentation to say ranked cold-start failures print first and include the npx invocation.
- [x] 3.3 Add the optional website quickstart mention only if the relevant file is present in this repository.

## 4. Acceptance

- [x] 4.1 Confirm unit tests cover formatter ordering and context-sensitive headers without network or Docker dependencies.
- [x] 4.2 Verify no-argument cold invocation and doctor output on a Node 22.12+ environment without Tilt: Tilt is reported, while Prisma and NATS broker are absent outside a project.
- [x] 4.3 Verify unsupported Node exits before compiled CLI loading where an older Node runtime is available.
- [x] 4.4 Confirm help and version remain usable when Docker is down, and that `project`/`up` gates occur before side effects.
- [x] 4.5 Confirm implementation changes remain within the specified files and do not alter generated stack defaults or engine files.
