# Finding bugs in TDK

You do not need to read the code to find a bug. Most TDK bugs so far were found by running a command and comparing what it printed with what TDK promised.

**The rule:** TDK promises something in its help text, its docs, or another command's output. If you run it and see something else, that is a bug. Write down the command, what you expected, and what you saw.

## 1. Make a scratch project

Work in an empty directory, never in a project you care about.

```bash
mkdir /tmp/tdk-bugs && cd /tmp/tdk-bugs
tdk --version
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk resource billing-api --type backend --stack shop --yes
tdk resource storefront --type frontend --stack shop --yes
```

To test the code on `main` instead of a released version, run the CLI from your clone: `bun /path/to/tdk-cli-core/cli/src/cli.ts <command>`. Put that in a small `tdk` script on your `PATH` so the commands below work unchanged.

Most checks below need only Bun. Checks marked **(Docker)** need Docker and Tilt running.

## 2. Run the checks

Each row is one promise. Run the command. If the output does not match the middle column, you have found a bug. The last column links to a real bug of that kind.

### Commands agree with each other

`tdk up`, `tdk status`, `tdk doctor`, `tdk networks` and `tdk resources` read the same `service.json` files. They should never disagree.

| Run | You should see | Real example |
|---|---|---|
| `grep '"port"' services/shop/*/service.json` | Each resource has its own port (here 4000, 4001 and 3000). | [#713](https://github.com/flisk-sh/tdk-cli-core/issues/713): every backend got 4000 |
| `tdk up shop --dry-run` then `tdk networks` | `networks` lists the same URLs that `up --dry-run` prints. | [#719](https://github.com/flisk-sh/tdk-cli-core/issues/719): `networks` printed "No services with basePath found" |
| `tdk resources --ports` | A `Port:` line for every resource, matching `service.json`. | [#715](https://github.com/flisk-sh/tdk-cli-core/issues/715): no ports shown |
| `tdk status --json` | Every resource has its real `type` (`frontend`, `backend`), never `"unknown"`. | [#715](https://github.com/flisk-sh/tdk-cli-core/issues/715) |
| `tdk doctor --no-ping` | Passes on a project you just made with `tdk resource` (any `--type`) and did not edit. Any ✗ there is a bug in the scaffold or in doctor. | [#599](https://github.com/flisk-sh/tdk-cli-core/issues/599): a bring-your-own resource failed doctor |

### Docs match behaviour

| Run | You should see | Real example |
|---|---|---|
| Copy each command from the [README](../../README.md) quick start and run it | Every command works and every URL answers. | [#718](https://github.com/flisk-sh/tdk-cli-core/issues/718): the quick-start `curl` returned 404 |
| `tdk --help` | Every command in `cli/src/commands/` and in the docs is listed. | [#721](https://github.com/flisk-sh/tdk-cli-core/issues/721): `logs`, `eject`, `import`, `mcp` missing |
| Any `tdk <command>` named in `docs/` | The command exists. `tdk <name> --help` does not say `unknown command`. | [#723](https://github.com/flisk-sh/tdk-cli-core/issues/723): docs mentioned `tdk smoke` |
| A flag named in the docs | `tdk <command> --help` lists it, and using it changes the output. | |

### Errors help you

| Run | You should see | Real example |
|---|---|---|
| From an empty directory: `tdk status`, `tdk down`, `tdk logs`, `tdk eject --yes` | The same error for all of them: "Could not find project root" plus a suggestion to run `tdk project --yes`. Exit code 1. | [#722](https://github.com/flisk-sh/tdk-cli-core/issues/722): `down`, `eject` and `logs` gave a bare or misleading error |
| Follow the advice in any error message | The advice fixes the problem. An error that tells you to run the command that just failed is a bug. | [#724](https://github.com/flisk-sh/tdk-cli-core/issues/724): an empty `JWT_SECRET=` sent you back to `tdk up` |
| Every `--type` from `tdk resource --help` | Each one creates a resource. A JavaScript stack trace (`TypeError`, `Object.entries…`) is always a bug. | [#714](https://github.com/flisk-sh/tdk-cli-core/issues/714): `--type sdk` crashed |
| `echo $?` after a failed command | Not `0`. A command that fails but exits 0 breaks scripts and CI. | |

### Machine output is stable

| Run | You should see | Real example |
|---|---|---|
| `tdk <command> --json` for each command that has it | Only JSON on stdout, shaped `{"schemaVersion":1,"data":…,"errors":[]}`. Pipe it to `jq .` to check it parses. | [#707](https://github.com/flisk-sh/tdk-cli-core/issues/707) |
| The same `--json` command when it fails (for example outside a project) | Still the envelope, with the problem in `errors`. Not a plain text error. | [#722](https://github.com/flisk-sh/tdk-cli-core/issues/722) |

### Running services **(Docker)**

| Run | You should see | Real example |
|---|---|---|
| `tdk up shop`, then `curl` every URL it prints | Each `/health` URL answers 200. | [#718](https://github.com/flisk-sh/tdk-cli-core/issues/718) |
| `tdk down`, then `docker ps` and `docker network ls` | No container or network of this project is left. | [#583](https://github.com/flisk-sh/tdk-cli-core/issues/583) |
| Edit `.env` by hand (empty a value, add a comment, quote a value), then `tdk up` | TDK reads `.env` the way Docker Compose does, or repairs it and says so. | [#724](https://github.com/flisk-sh/tdk-cli-core/issues/724), [#725](https://github.com/flisk-sh/tdk-cli-core/issues/725) |
| `cd services/shop/orders-api && bun run build` | The scaffolded resource builds on the host. | [#581](https://github.com/flisk-sh/tdk-cli-core/issues/581), [#592](https://github.com/flisk-sh/tdk-cli-core/issues/592) |

### The repository itself

| Run | You should see | Real example |
|---|---|---|
| `bun run typecheck && bun run lint && bun run test` on a clean clone | All pass. A failure on a clean checkout is a project bug, not a setup problem. | |
| Test suites that no workflow runs, such as `pytest tests/tilt-engine` | They pass too. | [#700](https://github.com/flisk-sh/tdk-cli-core/issues/700): 29 failing tests no workflow ran |

## 3. Where bugs hide

These patterns found most of the bugs above. Use them on any command, not only the ones listed.

- **Two commands, one fact.** When two commands show the same thing (a port, a URL, a status), compare them. If they differ, one is wrong.
- **Doctor says one thing, the command does another.** `tdk doctor` flags a problem that `tdk up` then ignores, or the reverse.
- **The docs example.** Copy commands from the README and `docs/` exactly as written. Docs drift when names or routes change.
- **The edge of the input.** An empty value, a name ending in `-api`, a second resource of the same type, a type nobody uses, running outside a project.
- **Tests that build their own data.** A test that passes because it sets a field the real code never sets ([#713](https://github.com/flisk-sh/tdk-cli-core/issues/713)). When a unit test passes but the command fails, compare the test's input with what the real command produces.
- **Success with nothing done.** Output says ✓ or "Added …" but the file, container or URL is unchanged.

## 4. Before you report

1. Run it again in a fresh scratch project, so you know the steps are complete.
2. Check `main`: run the CLI from source (step 1). The bug may be fixed but not released.
3. Search [open and closed issues](https://github.com/flisk-sh/tdk-cli-core/issues?q=is%3Aissue) for the error text or the command name. If you find a match, add your output there instead.
4. Shrink the steps to the fewest commands that still show the bug.

## 5. Write the report

Open a [bug report](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=bug_report.yml). The best reports in this repository share one shape, and [#713](https://github.com/flisk-sh/tdk-cli-core/issues/713) is a good one to copy:

````markdown
<one sentence: what TDK promised and what it did instead>

## Reproduce (TDK <tdk --version> / main at <short commit>)
```bash
mkdir demo && cd demo && tdk project --yes
<the fewest commands that show it>
```
```text
<the output you saw, copied, not retyped>
```

## Cause (optional)
<file:line and why, if you found it>

## Fix (optional)
<what should change, and the test that would catch it>
````

Say what you checked and what you did not. "I could not run `tdk up` because Docker is not running here; the URL comes from `--dry-run`" is useful. A guess written as fact is not.

You do not need the cause or the fix to report a bug. If you want to fix it yourself, comment `I'll take this` on the issue and follow the [CLI recipe](02-feature-recipes.md#change-a-cli-command). Security problems go to [SECURITY.md](../../SECURITY.md), not a public issue.
