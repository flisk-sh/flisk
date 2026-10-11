# Contributing to TDK

English | [简体中文](docs/contributing/translations/CONTRIBUTING-zh_cn.md) | [繁體中文](docs/contributing/translations/CONTRIBUTING-zh_tw.md) | [日本語](docs/contributing/translations/CONTRIBUTING-ja.md) | [한국어](docs/contributing/translations/CONTRIBUTING-ko.md)

Welcome! Small fixes and large features are both useful. Start with the short [contributor guide](docs/contributing/README.md); it walks you through finding a change, making it, checking it, and opening a pull request.

## Start here

1. [Choose your change and get the repo ready](docs/contributing/01-first-change.md).
2. [Follow the recipe for your kind of change](docs/contributing/02-feature-recipes.md).
3. [Check your work and open a pull request](docs/contributing/03-open-a-pr.md).
4. [Review someone else's pull request](docs/contributing/04-review-a-pr.md), with one-click AI review buttons.

The focused [frontend provider guide](docs/frontend-framework-providers.md) has the exact steps for adding another Vite framework like Vue. The [backend provider guide](docs/backend-language-providers.md) covers adding a backend language like Python.

## Quick setup

You need Git, [Bun](https://bun.sh) and Node.js 22.12+. Docker and Tilt are not needed for most changes.

```bash
git clone https://github.com/tdk-landscape/tdk-cli-core.git
cd tdk-cli-core
bun install
bun run typecheck && bun run lint && bun run test   # about a minute; all of it should pass before you change anything
```

If one of these fails on a clean checkout, that is a bug in the project, not in your setup: please [open an issue](https://github.com/tdk-landscape/tdk-cli-core/issues/new/choose).

## Code review

Every change goes through a pull request. Before a pull request is merged:

- The required checks pass: lint, typecheck, tests and fuzz (see `.github/workflows/ci.yml`).
- At least one person other than the author has reviewed the change. Authors cannot approve their own pull requests.
- The reviewer checks that the change does what the linked issue asks, that it has tests (see [Tests](#tests)), and that it does not weaken security checks or validation.
- Review comments that request changes are resolved before merge, or the author explains why they do not apply.

The full steps for reviewers, including what to look at, are in [docs/contributing/04-review-a-pr.md](docs/contributing/04-review-a-pr.md#who-can-approve-and-merge).

## Tests

Every new feature or behavior change needs automated tests in the same pull request. Put tests next to the code they cover, or in the existing suite for that area (`cli/src/**/__tests__/`, `tests/fuzz/`). A bug fix adds a test that fails before the fix and passes after it. If a test is not practical, the pull request says why and links an issue that tracks adding it. Reviewers check this in every pull request, and the checks listed in [03-open-a-pr.md](docs/contributing/03-open-a-pr.md#run-the-checks-for-your-change) run the suite in CI.

Run focused checks from the repository root while you work, then use `make test` as the comprehensive pre-PR entry point:

| I changed | Run |
| --- | --- |
| TypeScript or CLI logic | `make test-ts` |
| Python code, generators or Starlark-related logic | `make test-python` |
| Shell verification scripts | `make test-shell` |
| Multiple areas or anything before a PR | `make test` |

The TypeScript target requires Bun and Node.js 22.12+. The Python target requires the packages in `tests/requirements.txt`; it includes the known clean-checkout failures tracked in [#700](https://github.com/tdk-landscape/tdk-cli-core/issues/700) rather than hiding or skipping them. The shell target only runs Bash syntax validation on `scripts/verify-*.sh`. Run an affected verification script separately when you need its real integration coverage; those scripts document their own arguments and may require Docker, Tilt, a built CLI or network access.

## Find bugs

You do not need to write code to help. Run a command, compare what it prints with what TDK promises (its `--help`, the docs, or another command), and report any difference. That is a bug.

[Finding bugs in TDK](docs/contributing/finding-bugs.md) has the exact steps: a scratch project to test in, a checklist of commands with the output you should see, the patterns that found past bugs, and the report format maintainers can act on. For example, if `tdk networks` lists no URLs while `tdk up --dry-run` prints them, the two commands disagree, so one of them is wrong.

## Review pull requests

You can help without writing code by reviewing open [pull requests](https://github.com/tdk-landscape/tdk-cli-core/pulls). Every PR ends with **Grok**, **Claude**, and **Codex** buttons that open an AI chat already asked to review that PR. The AI is your helper: check what it says against the diff, then submit your own review on GitHub as **Comment**, **Approve**, or **Request changes**.

Before your first review, read the [required docs](docs/contributing/04-review-a-pr.md#before-your-first-review-required-reading) (about an hour, once). [Review a pull request](docs/contributing/04-review-a-pr.md) then explains the buttons step by step, with example comments for approving and for requesting changes.

## Find something to work on

- 🗺️ [The TDK Journey](docs/journey/README.md): pick an island, finish a quest, rank up (8 kyu → 1 dan)
- [Good first issues](https://github.com/tdk-landscape/tdk-cli-core/labels/good%20first%20issue)
- [Help wanted](https://github.com/tdk-landscape/tdk-cli-core/labels/help%20wanted)
- [Hunt for bugs](docs/contributing/finding-bugs.md) with the step-by-step checklist
- [Report a bug or ask a question](https://github.com/tdk-landscape/tdk-cli-core/issues/new/choose)

If you pick an issue, comment `I'll take this` (or `I would like this one`, `I'd like to work on this`, `Can I take this?`). A bot assigns you and adds the `claimed` label so two people do not do the same work. A claim with no pull request is nudged after 14 days and released after 21; a draft PR counts as progress. For a bug report, include the output of `tdk doctor` when you can.

## Spell check

Install the pinned checker with `cargo install typos-cli --version 1.50.3`, then run `typos` from the repository root to check spelling.

## Labels

Use labels to find work that fits your interests and experience. Maintainers apply
labels during triage; issue forms and the PR labeler also apply some automatically.
The live [label list](https://github.com/tdk-landscape/tdk-cli-core/labels) includes
each label's description.

| Label | Meaning | When it is applied |
| --- | --- | --- |
| `bug` | Something does not work as expected. | Bug report forms and confirmed defects. |
| `enhancement` | A feature or improvement. | Feature request forms and accepted improvements. |
| `documentation` | Missing, incorrect, or unclear documentation. | Documentation forms and docs work. |
| `good first issue` | A small, self-contained task with little repo knowledge needed. | Maintainers identify a suitable first contribution. |
| `help wanted` | A task that needs community help, often larger than a first issue. | Maintainers welcome someone taking it on. |
| `difficulty: easy`, `difficulty: medium`, `difficulty: hard` | A few hours, a day or two, or work requiring deep repo knowledge or design. | Maintainers estimate the task's difficulty; these complement the contributor labels. |
| `question` | A request for clarification. | Maintainers triage a question rather than an implementation task. |
| `duplicate` | Another issue or PR already covers the work. | Maintainers link the original discussion. |
| `invalid`, `wontfix` | An invalid report or work the project will not take on. | Maintainers explain why the issue does not proceed. |
| `premium` | Premium license requests and paid features. | The premium issue form or maintainer triage. |
| `tracking` | An umbrella issue with related tasks. | Maintainers group work that spans multiple issues. |
| `community`, `examples`, `growth` | Community work, sample projects, or adoption improvements. | Maintainers identify outreach and adoption tasks. |
| `dx`, `design`, `guide` | Developer experience, visual or UX polish, or written guides. | Maintainers identify the kind of improvement. |
| `testing`, `ci`, `packaging` | Tests, GitHub Actions, or installers and packages. | Maintainers identify verification and delivery work. |
| `agents` | Documentation and files for AI coding agents. | Maintainers identify agent-facing work. |
| `rfc` | A design discussion before implementation. | Maintainers request agreement on a proposal's scope. |
| `windows` | Windows and WSL2 support. | Maintainers identify platform-specific work. |
| `performance`, `benchmark` | Speed or memory improvements, or measurement tooling. | Maintainers identify optimization and measurement work. |
| `hacktoberfest` | Work participating in Hacktoberfest. | Maintainers select eligible contributions for the event. |
| `area:*` | The affected surface, such as `area: tui`, `area: doctor`, or `area: cli`. | Maintainers label issues; the PR labeler derives areas from changed paths. |
| `tech:*` | A relevant technology, such as TypeScript, Docker, or Tilt. | Maintainers identify the tools involved in a task. |
| `rank:*`, `island:*` | Task size and topic on the TDK Journey. | Maintainers place a quest on the contributor map. |
| `event:*` | Work targeting a named event, such as GitHub Universe. | Maintainers organize event-specific work. |

## Sign your commits

Every commit needs a [Developer Certificate of Origin](DCO) sign-off. Add it with `git commit -s`, which appends `Signed-off-by: Your Name <you@example.com>`. To fix existing commits, run `git rebase --signoff origin/main` and force-push your branch. A pull request check fails when a commit is missing the line.

## Add your team to the adopters list

Run TDK on your own repository? You can be listed in [ADOPTERS.md](ADOPTERS.md) in either of two ways: open the [We use TDK](https://github.com/tdk-landscape/tdk-cli-core/issues/new?template=we-use-tdk.yml) issue form, or add a row to the table in a pull request. [What counts](ADOPTERS.md#what-counts) explains what to link and what does not count.

## Governance

See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and maintainers are added, [MAINTAINERS.md](MAINTAINERS.md) for who can merge, and [ADOPTERS.md](ADOPTERS.md) for teams using TDK.

## Be kind

By taking part, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Please report security problems privately using [SECURITY.md](SECURITY.md), not in a public issue.
