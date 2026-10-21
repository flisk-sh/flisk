# Upgrading Flisk and keeping a team on one version

## Set a minimum version for the repo

Add `minTdkVersion` to `.tdk/project.json` and commit it:

```json
{ "minTdkVersion": "1.3.80" }
```

`flisk doctor` and `flisk up` then fail on any older CLI, locally and in CI, and say what to run:

```text
flisk 1.3.79 is older than the 1.3.80 this project requires (minTdkVersion)
Run: flisk upgrade
```

- It is a **floor**: newer versions pass. Nothing pins an exact version.
- The value must be `MAJOR.MINOR.PATCH`; anything else fails the check.
- `flisk up` checks it first, before the Docker checks and before Tilt starts, and exits 1 with the two lines above. A malformed value stops it too. A project without `minTdkVersion` is not checked.
- `flisk up --dry-run` runs the same check and exits 1 on a failure, as it does for generated-file drift; nothing is started either way.
- `flisk up --ignore-version` skips the check and prints a warning. Use it only to get past a pin you know is stale; `flisk doctor` still reports it.

## Upgrade every Flisk installation

If PATH contains more than one Flisk install, run `flisk upgrade --all` to update each detected installation. Preview the paths first with `flisk upgrade --all --dry-run`. Git-linked installs update from the remote default branch, even when the local checkout is on a branch that no longer exists remotely. The command leaves local modifications untouched and asks you to commit or stash them first.

## Install a specific version

- npm: `npm install -g flisk@1.3.80`
- `flisk upgrade` always goes to the latest release; it has no version argument.
- `install.sh` and the release binaries: whether `install.sh` can install an older tag is **not documented**. Versions are listed on the [releases page](https://github.com/flisk-sh/tdk-cli-releases/releases).

## What is versioned

| Thing | Version | Where |
| --- | --- | --- |
| CLI, bundled engine and binaries | One number, the npm package version | `flisk version`, [CHANGELOG](../CHANGELOG.md) |
| `service.json` format | `schemaVersion` (currently `1`); `flisk doctor` rejects an unsupported value | [configuration](configuration.md) |
| `--json` output of `status`, `resources`, `networks`, `doctor`, `config verify` | `schemaVersion` in the envelope | [CHANGELOG](../CHANGELOG.md) |
| `.tdk/project.json` | No format version; optional `minTdkVersion` | this page |

## Compatibility policy

There is no written semver promise yet. What the changelog shows in practice: a flag that is going away is kept for a while and named with its removal version (for example `networks --json-legacy`, kept through 1.4.x and scheduled for removal in 1.5.0). Read the changelog's **Unreleased** and version sections before bumping `minTdkVersion`.

Not written down yet: how long a deprecated field keeps working, and whether an older `service.json` is migrated automatically. After an upgrade, run `flisk config verify` and `flisk doctor`; they report generated files that drifted and manifests that no longer validate.
