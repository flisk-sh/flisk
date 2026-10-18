## What changed?

<!-- Explain the change in plain language. Link the issue with Fixes #123 when applicable. -->

## Which parts of TDK changed?

GitHub uses one static PR template, so it cannot hide or add checklist items based on your diff. Use this quick routing guide: open **Files changed**, match your paths below, then complete only those rows. A PR can match several rows. The label workflow adds matching `area:*` labels automatically once the labeler change is on the base branch; labels are a hint, not a checklist.

- [ ] CLI (`cli/src/`)
- [ ] Terminal UI or environment diagnostics (`cli/src/components/`, `doctor`)
- [ ] Frontend framework provider (`cli/src/frontend-frameworks/`, `engine/topologies/tilt/generators/vite/`, frontend schemas or templates)
- [ ] Database or infrastructure (`engine/topologies/platform/`, `engine/topologies/tilt/resources/`, `discovery/services/platform/`)
- [ ] Engine or service discovery (`engine/`, `discovery/`, `Tiltfile`)
- [ ] Extension or shared platform package (`ext/`, `shared-platform-engineering/`)
- [ ] Tests, scripts, or benchmarks (`tests/`, `scripts/`, `benchmarks/`)
- [ ] Spec or schema (`openspec/`, `specs/`, `engine/schemas/`)
- [ ] GitHub Actions or repository setup (`.github/`, package files)
- [ ] Contributor, agent, or user documentation

Open the matching guide below. If more than one area changed, follow every matching guide.

| If your changed files include… | Follow… |
| --- | --- |
| `cli/src/frontend-frameworks/**`, Vite templates/config generators, or frontend schemas | **Frontend framework provider** |
| `engine/topologies/platform/**/*.star` | **Starlark platform / Docker / networking / database** and **Engine or service discovery** |
| `engine/topologies/tilt/**/*.star` or `Tiltfile` | **Starlark / Tilt generators and resources** and **Engine or service discovery** |
| `discovery/services/platform/**` or `discovery/services/**/*.yaml` | **Database or infrastructure tool** and **Engine or service discovery** |
| `cli/src/**/*.ts`, `cli/src/**/*.tsx`, or `cli/dist/**` | **CLI command or generated output**; include the TUI/doctor guide too when those paths changed |
| `ext/**` or `shared-platform-engineering/**` | **Extension or shared platform package** |
| `tests/**`, `**/*.test.ts`, `**/*.test.tsx`, or `scripts/**` | **Tests, scripts, or benchmarks** |
| `openspec/**`, `specs/**`, or `engine/schemas/**` | **OpenSpec, schemas, or generated contracts** |
| `.github/**`, package manifests, or lockfiles | **GitHub Actions or repository setup** |

For example: a new database usually changes Tilt `.star` files, Docker/Compose `.star` files, a service manifest, and tests. Follow every matching row, then document how to enable it and how to check both enabled and disabled behavior.

<details>
<summary>CLI command or generated output</summary>

- Find or add tests under `cli/src/**/__tests__/`.
- Update `cli/README.md` if a command, option, or output changed.
- Run `bun run typecheck`, `bun run lint`, and `bun run test` from the repo root.
- If you changed anything under `cli/src/`, run `npm run check:dist` in `cli/`, then commit the changed `cli/dist/` files (use `git add -f` for new files). CI fails with "cli/dist is stale" otherwise.

</details>

<details>
<summary>Terminal UI or doctor checks</summary>

- TUI files are under `cli/src/components/` and the `cli/src/commands/ui.tsx` command.
- Doctor behavior is under `cli/src/commands/doctor.ts` and `cli/src/utils/doctor-*.ts`.
- Add or update the matching test under `cli/src/commands/__tests__/` or `cli/src/utils/__tests__/`.
- Check behavior in a real terminal when changing interactive screens.

</details>

<details>
<summary>Frontend framework provider</summary>

- Follow the [frontend provider guide](../docs/frontend-framework-providers.md).
- Keep React as the default and add one Vite-based provider per PR.
- Test generated files, Vite configs, unknown ids, old manifests, and the unchanged React path.
- Keep Docker, nginx, Traefik, and shared API/environment behavior common to providers.
- Run `bun run typecheck`, `bun run lint`, and `cd cli && TDK_REQUIRE_TILT=1 npm test`.
- Update the provider guide and `cli/README.md`.

</details>

<details>
<summary>Database or infrastructure tool</summary>

- Trace the feature setting from validation to generated Compose config and Tilt resource registration.
- Check startup order, health/readiness, environment/secrets, disable behavior, and cleanup.
- Test the enabled and disabled paths and update `docs/FEATURES.md` or the relevant CLI guide.
- Run the CLI checks; use `TDK_REQUIRE_TILT=1` for Starlark generator tests.

</details>

<details>
<summary>Starlark platform, Docker, networking, or Tilt resource</summary>

- Identify the entry point and follow its imports: platform code is under `engine/topologies/platform/`; Tilt code is under `engine/topologies/tilt/`.
- Preserve deterministic generation and existing output contracts. Update golden/fixture tests when generated output changes.
- For a new infrastructure resource, check registration, dependencies/startup order, health/readiness, disable behavior, and cleanup.
- Run the targeted Starlark/Tilt tests. Use `cd cli && TDK_REQUIRE_TILT=1 npm test` for CLI tests that require Tilt; use `make test-tilt-engine` for `tests/tilt-engine/` when its Python environment is available.
- Include a small before/after generated-output example in **Evidence**.

</details>

<details>
<summary>Engine or service discovery</summary>

- Check generated output and existing `service.json` manifests for compatibility.
- Update the relevant Starlark or discovery tests and user-facing docs.
- Run the CLI checks; use `cd cli && TDK_REQUIRE_TILT=1 npm test` for Tilt-dependent generator tests.
- Changes under `engine/`, `discovery/`, `cli/`, or `Tiltfile` also trigger Quickstart E2E.

</details>

<details>
<summary>Extension or shared platform package</summary>

- Check the extension entry point, metadata, and dependent platform code together.
- Keep shared generated-service and engine contracts compatible.
- Run the tests that cover the changed extension/package, plus the CLI checks if CLI behavior changed.
- Update its README or the matching user guide.

</details>

<details>
<summary>Tests, scripts, or benchmarks</summary>

- Keep test fixtures focused on the behavior under change; avoid changing benchmark baselines without recording the run conditions.
- Run the target test or script and include the exact command and result.
- For `tests/tilt-engine/`, use `make test-tilt-engine` when the Python test environment is available.

</details>

<details>
<summary>OpenSpec, schemas, or generated contracts</summary>

- Update the schema/spec and a representative example or fixture together.
- Check that existing manifests remain valid and generated output stays compatible.
- Run `openspec validate <change-name>` for an OpenSpec change.

</details>

<details>
<summary>GitHub Actions or repository setup</summary>

- Keep workflow permissions as narrow as the job allows. Do not expose secrets to untrusted pull-request code.
- If you change a workflow, check its event, path filters, permissions, and fork behavior.
- `.github/workflows/**` changes trigger the workflow audit in CI.
- For dependency files, update the lockfile and confirm the package smoke check still applies.

</details>

<details>
<summary>Documentation only</summary>

- Check the links and commands you changed.
- Read the page once as someone new to TDK.
- The main CI workflow still runs for docs-only PRs; Quickstart E2E does not.

</details>

## How did you check it?

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] If I changed `cli/src/`: `npm run check:dist` in `cli/` passes and I committed `cli/dist/`
- [ ] Other check: <!-- Include the command and result. -->
- [ ] I said which checks I did not run and why.

<!-- Remove or uncheck checks that do not apply. Mark a check only if you ran it successfully. -->

<!-- For behavior changes, show real before/after output and repeatable steps. See the [PR guide](../docs/contributing/03-open-a-pr.md#show-what-changed). -->

## Evidence

<!-- Paste useful output or add screenshots. Remove secrets, private URLs, and personal paths. -->

<!-- Three AI review links (Grok, Claude, Codex) are added at the bottom for same-repository PRs when opened, reopened, or edited. Fork pull requests are skipped so the workflow token is never used to write untrusted bodies. Title changes regenerate the prefilled prompt. Do not delete the ai-review-buttons marker. -->
