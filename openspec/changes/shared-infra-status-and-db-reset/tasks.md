# Tasks

## 1. Grouping and `flisk status` (this PR)

- [x] 1.1 Add `cli/src/utils/shared-infra.ts` with a pure grouping function over discovered stacks.
- [x] 1.2 Unit tests: one stack, two stacks sharing one instance, a stack with no shared usage, `dependsOn` alias `database-management`, empty project.
- [x] 1.3 Render the grouping in `flisk status` (human output) and in `--json` as `sharedInfra`.
- [x] 1.4 Verify by exit code: `./node_modules/.bin/biome check . ; echo $?` and `./node_modules/.bin/tsc --noEmit ; echo $?`, then `npm run build` and the status tests.

## 2. Per-stack database reset (follow-up PR)

- [ ] 2.1 `flisk db reset <stack>` drops and recreates only `<project>_<stack>`.
- [ ] 2.2 Warn with declared dependents before dropping; prompt by default; `--yes` skips.
- [ ] 2.3 Do not run migrations or seeds after the reset.
- [ ] 2.4 `--instance` flag for a whole-instance reset.
- [ ] 2.5 Verify against a real `flisk up` with Docker and record the captured output on #682.
