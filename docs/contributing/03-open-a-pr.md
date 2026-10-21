# 3. Check your change and open a pull request

## Run the checks for your change

Run checks from the repository root unless a command says otherwise.

| Change | Checks to run |
|---|---|
| CLI code or generated CLI behavior | `bun run typecheck`, `bun run lint`, `bun run test` |
| Engine/Starlark generator used by the CLI tests | Run `bun run typecheck`, `bun run lint`, and `cd cli && TDK_REQUIRE_TILT=1 npm test`. The CI test job installs Tilt and sets this flag. |
| Python engine test area | Install the test packages once with `python3 -m pip install -r tests/requirements.txt`, then run the relevant test file with `pytest`, or `make test-tilt-engine` for that suite. Some tests there fail on a clean checkout; see #700 for which and why. These Python checks are not run by `.github/workflows/ci.yml`. |
| Docs only | Check links and commands you changed; read the page once as a newcomer. |

Do not say a check passed unless you ran it. If you cannot run a check, say so and give the reason.

### If the golden-output test fails

The generated Tilt and Compose files for three sample projects are checked against committed copies in `cli/src/generator/__tests__/golden/`. If you changed a template in `cli/templates/` or the generator on purpose, the test fails and names each file that moved. Accept the change by running `UPDATE_GOLDEN=1 bun run test -- golden-generated-output`, read the diff of the golden files, and commit them with your change. If you did not mean to change generated output, fix the cause instead of updating the files. Existing projects see the same bytes change, so `flisk config verify` reports them out of sync until their next `flisk config regenerate`; say so in the PR.

## Show what changed

For a bug fix or behavior change, use the same steps on `main` and your branch when possible. Paste the real before-and-after output; do not recreate it from memory. Include the command, project or fixture, and any setup needed to repeat it. Cover the empty, error, or recovery cases named in the issue.

If you test the built CLI entry point, run `bun run build` first so it does not use old compiled files. Check interactive commands such as `flisk ui` in a real terminal. If an automated test is missing, say why and link an issue to add it. New behavior and bug fixes need tests in the same pull request; see [Tests in CONTRIBUTING.md](../../CONTRIBUTING.md#tests).

## Push your branch

If you have write access to the repository:

```bash
git add path/to/your/files
git commit -m "Describe the change"
git push -u origin my-change
```

If you are contributing from a fork, push to your fork and open a pull request from that branch.

## Open the pull request

Go to the repository on GitHub. Click **Compare & pull request** for your branch, or choose **Pull requests → New pull request**. Select `main` as the base branch, then fill in:

```markdown
## What changed
<!-- One or two sentences. Link the issue with Fixes #123 when applicable. -->

## How I checked it
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] Other check: ...

## Evidence
<!-- Paste useful output or show before/after behavior. Say what you did not check. -->
```

Delete checklist items that do not apply. Add a screenshot or real terminal output when it helps a reviewer see the change. Never include passwords, tokens, private URLs, or personal file paths.

## Before you click “Create pull request”

- [ ] The PR does one main thing.
- [ ] I linked the issue or explained why the change is useful.
- [ ] I updated docs or examples affected by the change.
- [ ] I listed the checks I actually ran and noted any gaps.
- [ ] I included before/after evidence when behavior changed.

After opening it, GitHub runs CI. If a check fails, read its log, fix the issue on the same branch, push again, and the PR updates automatically. Then answer reviewer questions on the PR.

GitHub also adds **Grok**, **Claude**, and **Codex** buttons to the end of your PR description. Click one to get an AI review of your own PR before anyone else looks at it. [Review a pull request](04-review-a-pr.md) explains how the buttons work and how reviewers approve or request changes.

## What GitHub runs

The [PR template](../../.github/pull_request_template.md) asks you to select the areas you changed and opens short instructions for each area. GitHub also adds matching `area:*` labels from changed paths and removes stale area labels when you push an updated diff. Labels organize the PR; workflow path rules decide which automation runs.

- **Every pull request:** [CI](../../.github/workflows/ci.yml) runs lint, typecheck, CLI tests, and a package smoke check. Some extra CI jobs depend on which files changed or repository settings.
- **Runtime files changed:** the [E2E journeys gate](../../.github/workflows/e2e-journeys.yml) runs on every PR, and its quickstart suite runs when a changed file matches that suite's paths in `tests/e2e/journeys/quickstart/suite.json` (for example files under `cli/`, `engine/`, or `discovery/`).
- **Framework example:** adding Vue, React, or another provider changes `cli/` and `engine/`, so both the always-run CI and Quickstart E2E run.
- **Docs-only change:** the always-run CI still runs. the quickstart suite does not run unless the PR also changes one of its paths.

Other example-app and 100-service fixture-bench checks run on a schedule or by manual request, not on each PR. You can always see a workflow's trigger paths at the top of its file in `.github/workflows/`.
