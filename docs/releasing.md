# Release operations

The ops checklist for cutting a Flisk CLI release, repairing one that only half finished, and the settings behind the pipeline. Background — npm authentication, candidate lessons, the publish gate in detail — lives in the [operator runbook](operator-runbook.md#cutting-a-release); this page is what you run.

## Table of contents

1. [What a release publishes](#what-a-release-publishes)
2. [The pipeline at a glance](#the-pipeline-at-a-glance)
3. [Cutting a release](#cutting-a-release)
4. [Where to look](#where-to-look) and [verify a release](#verify-a-release)
5. [Repair a half-finished release](#repair-a-half-finished-release)
6. [Backfill GitHub Packages](#backfill-github-packages)
7. [Unscoped npm package (flisk)](#unscoped-npm-package-flisk)
8. [Troubleshooting](#troubleshooting)
9. [Settings and secrets](#settings-and-secrets)
10. [Building binaries by hand](#building-binaries-by-hand)

## What a release publishes

| Channel | Name | Consumers | Produced by |
| --- | --- | --- | --- |
| Public npm | `@flisk-sh/flisk` | `npm i -g`, `flisk upgrade` | `publish` job (OIDC) |
| Binary release | [`flisk-sh/releases`](https://github.com/flisk-sh/releases/releases) tag `v<version>` | `install.sh`, winget-style installers, checksums | `publish` job (`scripts/release-binaries.sh --publish-only`) |
| GitHub Packages | `@flisk-sh/flisk` on `npm.pkg.github.com` | environments that require GitHub-hosted packages ([setup](github-packages.md)) | `publish-github-packages` job |
| Checksums release | `flisk-sh/flisk` tag `v<version>` | OpenSSF Scorecard Signed-Releases; signature verification | `publish` job (cosign sign + attestation) |

The version is picked by the workflow, not by a file: the highest of `package.json` and the latest npm version, plus one for every version already on npm or on `flisk-sh/releases`. `package.json` on `main` can lag; the workflow bumps it back through a PR.

## The pipeline at a glance

`release-binaries.yml` runs on a push to `main` that touches `package.json` or `cli/package.json`, or on `workflow_dispatch`.

```text
build ──► windows-binary ──► publish ──► publish-github-packages
                         │
                    (on the bump-PR merge push to main)
                    tag-bumped-release: tag vX.Y.Z + publish the checksums draft
```

The `publish` job, in order:

1. `Require a passing release candidate` — the [publish gate](#cutting-a-release) (`scripts/check-release-candidate.mjs`).
2. `Publish verified binary release` — binaries to `flisk-sh/releases`.
3. `Publish to npm` — `@flisk-sh/flisk`, OIDC or `NPM_TOKEN`.
4. `Sign the checksums` and `Attest build provenance` — the draft checksums release on `flisk-sh/flisk` and the signature on `flisk-sh/releases` (both `continue-on-error`).
5. `Commit the version bump` — last on purpose: opens `release/bump-<version>` and its PR, and enables auto-merge. Bookkeeping failure never skips the signing steps again (regression seen in 1.3.207).
6. `Tag the released commit and publish the GitHub release` — only when no bump was needed (`package.json` on `main` already carried the version). There is no bump PR then, so `tag-bumped-release` never runs; this step tags the released commit and publishes the draft instead (1.3.206 and 1.4.5 were finished by hand before it existed).

## Cutting a release

### 0. Preconditions

- npm trusted publisher on `@flisk-sh/flisk` for this repo and `release-binaries.yml` (`npm trust list @flisk-sh/flisk`), or the `NPM_TOKEN` secret set.
- `BINARY_RELEASE_TOKEN` (write to `flisk-sh/releases`) and optionally `RELEASE_PAT` (opens the bump PR as a user so its checks run).
- `main` is protected by the **main merge queue** ruleset: the bump PR needs the required checks and approvals before auto-merge lands it. Check open PRs afterwards; approve it.

### 1. Land the code

Merge what you want to ship. If `cli/src` changed, `cli/dist` must be rebuilt in the same merge or the `📦 Pack CLI` job fails on `main`:

```bash
npm --prefix cli run check:dist   # builds, then diffs cli/dist
git add -f cli/dist && git commit -s -m "Rebuild cli/dist" && git push
```

`cli/dist` is committed so a source checkout runs without a build step; new files under it need `git add -f` (it is gitignored file-by-file). The npm package ships the CLI once, as `cli/dist-bundle/` (built by `prepack` from `cli/dist`), plus the two `cli/dist/` files of its `main` entry; `scripts/check-npm-package.mjs` rejects a tarball that carries more of `cli/dist/`.

### 2. Release candidate

The publish gate refuses a commit no passing candidate covers. `main` moves every few minutes, so run the candidate on an `rc-*` tag or a `release/*` branch at the commit you are releasing. Never dispatch it on `main`: the `package` job refuses `refs/heads/main` and the whole candidate fails.

```bash
# either: a release branch at the commit (no local clone needed)
# a fresh branch per attempt: a retry after a fix on main needs a new name (release/<version>-rc2, ...)
gh api repos/flisk-sh/flisk/git/refs -f ref=refs/heads/release/<version>-rc<n> -f sha=<commit>
gh workflow run release-candidate.yml --ref release/<version>-rc<n>
# or: an rc tag at the commit
git tag rc-<version> <commit> && git push origin refs/tags/rc-<version>

gh run watch <candidate-run-id> --exit-status   # ~25 min: 30 jobs, quickstart + every resource type
```

Cut the branch from the newest green `main`, not from an older release branch: a fix that landed after the branch was cut (for example #2498, which made `flisk up` print ingress URLs instead of the Tilt UI port) is not in the candidate, and a candidate failure that `main` already fixed costs a full cycle.

The candidate (`release-candidate.yml`) packs the CLI, then runs the quickstart journey and every release-blocking resource-type suite against that exact tarball. Retry a run whose failures are all the same infrastructure readiness check (Docker Compose on a slow runner); never bypass the gate.

Check the gate for any commit before dispatching:

```bash
GH_TOKEN="$(gh auth token)" node scripts/check-release-candidate.mjs --sha <commit> --repo flisk-sh/flisk
```

It accepts an **exact** candidate, or an **ancestor** candidate when no commit since changed a release input (`cli/**`, `runtime/engine/**`, `package.json`, `bun.lock`, `Tiltfile`, `runtime/discovery/**`, `runtime/specs/**`, `runtime/ext/**`, `scripts/release-binaries.sh`, `release-binaries.yml`).

### 3. Dispatch the release

```bash
gh workflow run release-binaries.yml --ref main
```

Dispatch on `main` only when `main` is still at the candidate's commit, or no release input changed since (the gate above). Watch the run. `build`, `windows-binary` and `publish` must be green. Publication happens inside `publish`: by the time it finishes, npm and `flisk-sh/releases` are live even if later steps failed.

### 4. Merge the version-bump PR

Only when the run bumped the version (`build` printed `<old> is already released; releasing this commit as <version>`). When `main` already carried the version there is no bump PR: the publish job tagged the commit and published the release itself (pipeline step 6), so skip to [verify](#verify-a-release).

The publish job opens `Release <version> (automatic version bump)` from `release/bump-<version>`. `main` requires checks and approvals, so:

```bash
gh pr list --search "automatic version bump" --state open
gh pr checks <number> --watch && gh pr review <number> --approve
```

Auto-merge takes it from there. The merge push triggers `tag-bumped-release`, which tags `v<version>` on the bump commit and publishes the checksums draft. It only publishes a draft that already exists; it never creates the release.

## Where to look

Two repositories carry a release per version, and both are linked from each other's notes:

- [`flisk-sh/releases`](https://github.com/flisk-sh/releases/releases): the binaries, `checksums.txt`, signature and provenance. This is what `install.sh` downloads.
- [`flisk-sh/flisk` releases](https://github.com/flisk-sh/flisk/releases): the signed checksums only, which is what Scorecard reads. Its notes link back to the binaries on `flisk-sh/releases`.

## Verify a release

```bash
npm view "@flisk-sh/flisk" dist-tags                      # latest = version
npm view "@flisk-sh/flisk@<version>" dist.tarball
gh release view "v<version>" --repo flisk-sh/releases \
  --json assets --jq '.assets[].name'                     # 5 binaries + engine + zip + checksums + sigstore
gh release view "v<version>" --repo flisk-sh/flisk \
  --json isDraft,assets --jq '{draft:.isDraft,assets:[.assets[].name]}'   # draft false, checksums.txt + checksums.txt.sigstore.json + checksums.txt.intoto.jsonl
git ls-remote --tags origin "refs/tags/v<version>"        # tag exists
git show "v<version>":package.json | grep '"version"'     # version field matches
```

Signature and provenance (the two checks OpenSSF Scorecard's Signed-Releases reads). Both files live on the `flisk-sh/flisk` release:

```bash
mkdir -p verify && gh release download "v<version>" --repo flisk-sh/flisk \
  --pattern checksums.txt --pattern checksums.txt.sigstore.json --dir verify
cosign verify-blob --bundle verify/checksums.txt.sigstore.json \
  --certificate-identity-regexp 'https://github.com/flisk-sh/flisk/.github/workflows/(release-binaries|sign-release)\.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  verify/checksums.txt                                    # signature: Verified OK
gh attestation verify verify/checksums.txt --repo flisk-sh/flisk   # provenance: only releases built by release-binaries.yml have it
```

A release without `checksums.txt.intoto.jsonl` has no provenance; that is expected for versions cut before provenance was added. A release without a signature is a gap to close with [sign-release.yml](#repair-a-half-finished-release), not something to fix by hand.

See also the [maintainer checks for GitHub Packages](github-packages.md#maintainer-release-checks).

## Repair a half-finished release

`publish` can fail after npm and the binaries are already out (a rejected bump push, a missing secret). The artifacts are live; only bookkeeping is missing. Do not re-dispatch the release — it would skip npm (already published) and pick the **next** version.

| What is missing | Fix |
| --- | --- |
| No version-bump PR | Apply the bump on `main` yourself (both `package.json` files), commit as `Release <version> (automatic version bump)`, push. The message triggers `tag-bumped-release`, which tags and publishes the release. |
| Draft checksums release never created (sign step did not run) | Create an empty draft first: `gh release create "v<version>" --repo flisk-sh/flisk --draft --latest=false --title "v<version>" --notes "Signed checksums for flisk <version>."`, then run `sign-release.yml` (next row), which uploads the checksums **and** their signature into it, **before** pushing the bump commit. `tag-bumped-release` finds the draft and publishes it. Never upload a bare `checksums.txt`: that is how 1.3.207 ended up unsigned. |
| No `v<version>` tag | `tag-bumped-release` creates it on the bump push. To do it by hand: `git tag "v<version>" <bump-commit> && git push origin "refs/tags/v<version>"`. |
| GitHub Packages missing the version | [Backfill](#backfill-github-packages). |
| Signature (`checksums.txt.sigstore.json`) missing on a published version | Run **Actions → Sign an existing release**, or `gh workflow run sign-release.yml -f version=<version>`. It downloads the published binaries from `flisk-sh/releases`, checks them against `checksums.txt`, signs it keyless, and attaches the signature to the `flisk-sh/releases` release and the `flisk-sh/flisk` release. Do not re-run the `publish` job: it uses the workflow file of the original run. Provenance cannot be added afterwards; it has to come from the run that built the binaries, so that version stays without `checksums.txt.intoto.jsonl`. |

Case studies: 1.4.5 (four dispatches failed the publish gate because the candidate on `release/1.4.5` failed quickstart Q4, a test fault already fixed on `main` by #2498; a candidate on a fresh `release/1.4.6` branch from `main` passed and the release published; `main` already said 1.4.5, so no bump ran and the tag and the draft were finished by hand — the publish job now does that itself; `publish-unscoped-npm` lost its downloaded archive to a later checkout, fixed by checking out first), 1.3.187 (bump push rejected, signing skipped), 1.3.206 (version already in `package.json`, so no bump PR ran — tag and draft published by hand), 1.3.207 (bump push rejected by the `release/*` ruleset at branch creation — ruleset relaxed, bump and tag done by hand; the signing steps had run after the bump step and were skipped, and the hand-made release carried an unsigned `checksums.txt`, which OpenSSF Scorecard flagged. The bump step now runs last, and `sign-release.yml` signs a version after the fact. 1.3.205 on `flisk-sh/releases` was also unsigned).

Both repositories are scored: `flisk-sh/flisk` (checksums, signature, provenance) and `flisk-sh/releases` (the binaries, which have no workflows of their own). Every signing or provenance step has to attach its file to both.

### Why provenance is missing on 1.3.205 and 1.3.207

OpenSSF Scorecard's Signed-Releases check reads the last five releases of `flisk-sh/flisk` and wants a signature **and** provenance on each. A GitHub attestation is bound to the workflow run that created it, so it cannot be added after the fact. 1.3.205 and 1.3.207 were finished by hand (bump and tag) after the signing steps were skipped, so they have a signature (added later with `sign-release.yml`) but no `checksums.txt.intoto.jsonl`. The fix is forward only: every release cut by `release-binaries.yml` since the bump step moved last carries both files, and the two gaps leave the five-release window after five more releases. Do not hand-craft a provenance file to close them.

## Backfill GitHub Packages

To publish an already-released npm version to GitHub Packages without cutting another release:

**Actions → Publish existing npm version to GitHub Packages** → enter the version, or:

```bash
gh workflow run publish-existing-npm-to-github-packages.yml -f version=<version>
```

It downloads the exact public npm tarball, publishes it to `npm.pkg.github.com`, then fetches the tarball back from GitHub Packages, checks its sha512 against the npm tarball, and installs that file in a clean prefix to verify. If the package is the first publication, make it public in the package settings and confirm it is linked to `flisk-sh/flisk`.

## Unscoped npm package (flisk)

There is no unscoped `flisk` package, and the release does not try to publish one. npm refuses the name: the 1.4.7 run's `publish-unscoped-npm` job got `E403 Forbidden - PUT https://registry.npmjs.org/flisk - Package name too similar to existing package plist`. npm's name-similarity rule rejects that publish for any account and any token, so claiming the name, a stub package, `npm trust` or an `NPM_TOKEN` cannot fix it; only npm support can grant an exception. Install with `npm i -g @flisk-sh/flisk`. The job was removed after that run; its earlier hint about a `404` was wrong for this name.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `📦 Pack CLI`: `cli/dist is stale` | `cli/src` changed without rebuilding the committed `cli/dist` | `npm --prefix cli run check:dist`, `git add -f cli/dist`, commit `Rebuild cli/dist`, push |
| `error: GH013 ... release/bump-*` on the bump push | A ruleset enforced required status checks at branch creation | `do_not_enforce_on_create` must be on for the required-status-checks rule of the `release branch protections` ruleset (`gh api repos/flisk-sh/flisk/rulesets`) |
| `resource-types / mcp`: `timed out ... mcpres answers /health`, container `Restarting (0)`, log `imported as a module, not listening` | `cli/scripts/bundle.mjs` rewrote `import.meta.url` inside a template string, so the scaffolded server compared its path with `../dist/...` (1.4.23-rc1, #2847). Only the packed package runs the bundle, so PR tests on `dist/` miss it | A real bug, not a timeout: fix the bundler or template on `main`, cut `rc<N+1>`. `pin-module-location.mjs` now substitutes through esbuild `define`, which never touches strings |
| Publish gate: `No passing Release candidate covers <sha>` | No candidate on that commit, or release inputs changed since the last one | Push an `rc-*` tag at the commit, let it pass, re-dispatch |
| Publish gate lists `release inputs changed since (cli/**)` | A candidate exists but `cli/**` changed after it | New candidate on the release commit |
| Candidate `package`: `Release candidates run on a release/* branch or an rc-* tag, not refs/heads/main` | The candidate was dispatched on `main` | Dispatch it on a `release/*` branch or push an `rc-*` tag at the commit ([step 2](#2-release-candidate)) |
| Candidate quickstart Q4: `entry script '/static/js/main.<hash>.js' is not under /<frontend>/` | The CLI under test printed Tilt UI URLs (`localhost:10350`) in its health list; Q4 loaded Tilt's own React page. Fixed by #2498 | Cut the candidate from a `main` that has #2498 |
| `Release \| Binaries` red, but npm and both GitHub releases fine except `v<version>` on `flisk-sh/flisk` is a draft with no tag | `main` already had the version, so no bump PR and no `tag-bumped-release` (before the publish job tagged it itself) | `gh api repos/flisk-sh/flisk/git/refs -f ref=refs/tags/v<version> -f sha=<released commit>`, then `gh release edit v<version> --repo flisk-sh/flisk --tag v<version> --draft=false --latest=false` |
| `npm ERR! code EOTP` | An empty `NPM_TOKEN` was exported; npm tried token auth instead of OIDC | Never export an empty `NODE_AUTH_TOKEN`; the workflow only exports it when the secret exists |
| Workflow red but npm and `flisk-sh/releases` are live | A post-publication step failed (bump push, signing) | [Repair a half-finished release](#repair-a-half-finished-release) |
| GitHub Packages verify: `bin/flisk: No such file or directory` | Pre-rebrand releases link `bin/flisk`, newer ones link `bin/flisk` | The backfill workflow accepts both names |
| Tag exists but `package.json` on it is one version behind | Tag pointed at the pre-bump commit | Tags must point at the version-bump commit (`tag-bumped-release` does this; fix by re-tagging the bump commit) |

## Settings and secrets

| Name | Where | Used for |
| --- | --- | --- |
| `RELEASE_PAT` | repo secret | Bump PR opened as a user so its checks run; fall back is `github.token` |
| `NPM_TOKEN` | repo secret | Fallback publish for `@flisk-sh/flisk` and `flisk` when OIDC has no trusted publisher; must be absent-or-valid, never empty |
| `BINARY_RELEASE_TOKEN` | repo secret | Uploads to `flisk-sh/releases` |
| `main merge queue` ruleset | repository rules | `main`: merge queue, required checks, 2 approvals, code coverage floor |
| `release branch protections` ruleset | repository rules | `release/*`: PR required, required checks with `do_not_enforce_on_create` on (branch creation must stay pushable) |

## Building binaries by hand

```bash
scripts/release-binaries.sh                    # build only: release-dist-<version>/
scripts/release-binaries.sh --publish          # build, create a draft release, verify bytes, publish
scripts/release-binaries.sh --publish-only     # reuse an existing release-dist-<version>/
```

Output: `flisk-linux-{amd64,arm64}`, `flisk-darwin-{amd64,arm64}`, `flisk-windows-amd64.exe`, `flisk-cli-engine.tar.gz`, `checksums.txt` (SHA-256). The installer verifies each binary against `checksums.txt`.
