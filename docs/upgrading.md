# Upgrading TDK and keeping a team on one version

## Set a minimum version for the repo

Add `minTdkVersion` to `.tdk/project.json` and commit it:

```json
{ "minTdkVersion": "1.3.80" }
```

`tdk doctor` and `tdk up` then fail on any older CLI, locally and in CI, and say what to run:

```text
tdk 1.3.79 is older than the 1.3.80 this project requires (minTdkVersion)
Run: tdk upgrade
```

- It is a **floor**: newer versions pass. Nothing pins an exact version.
- The value must be `MAJOR.MINOR.PATCH`; anything else fails the check.
- `tdk up` checks it first, before the Docker checks and before Tilt starts, and exits 1 with the two lines above. A malformed value stops it too. A project without `minTdkVersion` is not checked.
- `tdk up --dry-run` runs the same check and exits 1 on a failure, as it does for generated-file drift; nothing is started either way.
- `tdk up --ignore-version` skips the check and prints a warning. Use it only to get past a pin you know is stale; `tdk doctor` still reports it.

## Upgrade every TDK installation

If PATH contains more than one TDK install, run `tdk upgrade --all` to update each detected installation. Preview the paths first with `tdk upgrade --all --dry-run`. Git-linked installs update from the remote default branch, even when the local checkout is on a branch that no longer exists remotely. The command leaves local modifications untouched and asks you to commit or stash them first.

## Install a specific version

- npm: `npm install -g @tdk-landscape/tdk-cli-core@1.3.80`
- `tdk upgrade` always goes to the latest release; it has no version argument.
- `install.sh` and the release binaries: whether `install.sh` can install an older tag is **not documented**. Versions are listed on the [releases page](https://github.com/tdk-landscape/tdk-cli-releases/releases).

## What is versioned

| Thing | Version | Where |
| --- | --- | --- |
| CLI, bundled engine and binaries | One number, the npm package version | `tdk version`, [CHANGELOG](../CHANGELOG.md) |
| `service.json` format | `schemaVersion` (currently `1`); `tdk doctor` rejects an unsupported value | [configuration](configuration.md) |
| `--json` output of `status`, `resources`, `networks`, `doctor`, `config verify` | `schemaVersion` in the envelope | [CHANGELOG](../CHANGELOG.md) |
| `.tdk/project.json` | No format version; optional `minTdkVersion` | this page |

## Compatibility policy

There is no written semver promise yet. What the changelog shows in practice: a flag that is going away is kept for a while and named with its removal version (for example `networks --json-legacy`, kept through 1.4.x and scheduled for removal in 1.5.0). Read the changelog's **Unreleased** and version sections before bumping `minTdkVersion`.

Not written down yet: how long a deprecated field keeps working, and whether an older `service.json` is migrated automatically. After an upgrade, run `tdk config verify` and `tdk doctor`; they report generated files that drifted and manifests that no longer validate.
