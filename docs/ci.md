# Running TDK in CI (GitHub Actions)

A copy-paste GitHub Actions workflow for **your own repository**, with two jobs: a light one that checks the committed TDK files, and a heavier one that boots a stack and waits for `/health`. It is adapted from this repository's own workflows ([`e2e-examples.yml`](../.github/workflows/e2e-examples.yml), [`e2e-journeys.yml`](../.github/workflows/e2e-journeys.yml), [`ci.yml`](../.github/workflows/ci.yml)). Scope reminder: CI is a throwaway environment for TDK, not a deployment path; see [scope](scope.md#local-only-or-also-staging-and-ci).

## What was and was not checked

- **Checked by running** (TDK 1.3.86 from a checkout of `main`, macOS, no `tdk up`): the commands of the first job, `tdk project --yes`, `tdk doctor --no-ping` and `tdk config verify`, in a scratch git repository and in a fresh clone of it. Results are under [what each command does](#what-each-command-does-in-the-first-job).
- **Checked by running** (CLI 1.3.186 built from the `feature/issue-1735-project-without-docker` branch, macOS, Docker and Tilt removed from `PATH`): `tdk project --yes` in a scratch git repository, and `tdk up` in the project it created. Results are under [what the first job needs from the machine](#what-the-first-job-needs-from-the-machine).
- **Not run anywhere:** the workflow file itself on GitHub, and the second job. Booting a stack needs Docker networks, which could not be created on the machine this page was written on. The second job reuses the logic of `e2e-journeys.yml`, which runs daily in this repository, but the exact script below was **not executed**. Run it once in a throwaway branch before you rely on it.
- **Linting:** the YAML parses and every `run:` block passes `bash -n`. `actionlint` was not installed, so it was not run; this repository's `ci.yml` runs it on `.github/workflows/`, not on `docs/`.
- **GitLab CI and other systems:** not tried. The commands are plain shell, but nothing here was tested outside GitHub Actions.
- **Timings:** none are claimed. The timeouts below are quoted from this repository's workflows or marked as a choice.

## The workflow

Save it as `.github/workflows/tdk-ci.yml`. The same file lives in the repository as [`docs/examples/ci/tdk-ci.yml`](examples/ci/tdk-ci.yml).

```yaml
# Copy to .github/workflows/tdk-ci.yml in your own repository.
# Two jobs: `verify` checks the committed TDK files without starting any
# container; `boot` runs a real `tdk up` and waits for every service's /health.
# Adapted from tdk-cli-core's e2e-examples.yml and e2e-journeys.yml.
name: tdk

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: tdk-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

env:
  # The tdk version CI uses. Replace it with the version your team runs; raise
  # `minTdkVersion` in .tdk/project.json when you raise this.
  TDK_VERSION: "1.3.110"
  # The stack `tdk up` starts in the `boot` job.
  TDK_STACK: shop
  # What the `boot` job waits for, as space-separated <route>:<tilt resource>
  # pairs. <route> is the path segment before /health in the URL that
  # `tdk up <stack> --dry-run` prints; <tilt resource> is the service name.
  HEALTH_SERVICES: "orders:orders-api"

jobs:
  verify:
    name: tdk config verify
    runs-on: ubuntu-latest
    timeout-minutes: 10 # a ceiling chosen for this recipe, not a measurement
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 22

      # `tdk doctor` looks for Tilt, a Docker daemon and the Compose plugin.
      # `tdk project --yes` only writes files and does not need the runtime.
      # The runner image has Docker; Tilt is not preinstalled.
      - name: Install Tilt
        run: curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash

      - name: Install tdk
        run: |
          npm install --global "@tdk-landscape/tdk-cli-core@${TDK_VERSION}"
          tdk --version

      # A fresh clone has neither the git-ignored .env nor .tdk/.tdk-out/, so
      # `tdk config verify` alone reports them as missing.
      - name: Generate the local project files
        run: tdk project --yes

      - name: tdk doctor
        run: tdk doctor --no-ping

      # Exits 1 when a generated file differs from what .tdk/project.json produces.
      - name: tdk config verify
        run: tdk config verify

  boot:
    name: tdk up and wait for /health
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 30 # the value e2e-journeys.yml uses
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install Tilt
        run: curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash

      # From e2e-journeys.yml: the runner's preinstalled Postgres can hold
      # port 5432. Remove it so nothing restarts it later in the job.
      - name: Free port 5432 (runner's preinstalled Postgres)
        run: |
          sudo systemctl stop postgresql.socket 'postgresql@*.socket' 2>/dev/null || true
          sudo systemctl stop postgresql.service 'postgresql@*.service' 2>/dev/null || true
          sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y 'postgresql*' >/dev/null 2>&1 || true
          sudo fuser -k 5432/tcp 2>/dev/null || true

      - name: Install tdk
        run: |
          npm install --global "@tdk-landscape/tdk-cli-core@${TDK_VERSION}"
          tdk --version

      - name: Generate the local project files
        run: |
          tdk project --yes
          tdk doctor --no-ping

      - name: tdk up and wait for /health
        shell: bash
        run: |
          set -uo pipefail
          mkdir -p "$RUNNER_TEMP/tdk-logs"
          log="$RUNNER_TEMP/tdk-logs/up.log"
          tdk up "$TDK_STACK" > "$log" 2>&1 &

          # `tdk up` prints one health URL per service. Wait for each to appear.
          urls=""
          for pair in $HEALTH_SERVICES; do
            svc="${pair%%:*}"
            url=""
            for _ in $(seq 1 60); do
              url="$(grep -oE "https?://[^ ]*/${svc}[^ ]*/health" "$log" | head -1 || true)"
              [ -n "$url" ] && break
              sleep 2
            done
            [ -n "$url" ] || { cat "$log"; echo "::error::tdk up never printed the $svc URL"; exit 1; }
            urls="$urls $url"
          done
          echo "Waiting for:$urls"

          failed_checks=0
          pending=""
          for n in $(seq 1 120); do # 120 polls of 10s: the 20 minutes e2e-journeys.yml allows
            pending=""
            for url in $urls; do
              code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
              case "$code" in
                2??) ;;
                *) pending="$pending $url=$code" ;;
              esac
            done
            if [ -z "$pending" ]; then
              echo "All healthy after $((n * 10))s:$urls"
              exit 0
            fi
            echo "poll $n ($((n * 10))s): waiting on$pending"
            # Once a minute, ask Tilt whether a resource has failed. Tilt does not
            # retry a failed image build, so that service will never turn healthy:
            # give up after two checks in a row instead of waiting out the timeout.
            if [ $((n % 6)) -eq 0 ]; then
              bad="$(tilt get uiresources -o json 2>/dev/null | jq -r '[.items[] | select(.status.updateStatus == "error") | .metadata.name] | join(",")' || true)"
              if [ -n "$bad" ]; then
                failed_checks=$((failed_checks + 1))
                echo "::warning::Tilt reports failed resource(s): $bad (check $failed_checks of 2)"
                if [ "$failed_checks" -ge 2 ]; then
                  echo "::error::Giving up early: $bad failed to build and Tilt will not retry it"
                  exit 1
                fi
              else
                failed_checks=0
              fi
            fi
            sleep 10
          done
          tail -200 "$log"
          echo "::error::not healthy within 20 minutes:$pending"
          exit 1

      # When the poll fails, "404 for 20 minutes" says nothing about why.
      - name: Collect diagnostics
        if: always()
        shell: bash
        run: |
          out="$RUNNER_TEMP/tdk-logs"
          mkdir -p "$out"
          docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' > "$out/docker-ps.txt" 2>&1 || true
          tilt get uiresources > "$out/tilt-resources.txt" 2>&1 || true
          tdk doctor --no-ping > "$out/doctor.txt" 2>&1 || true
          for c in $(docker ps -a --format '{{.Names}}'); do
            docker logs --tail 200 "$c" > "$out/container-$c.log" 2>&1 || true
          done

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: tdk-logs-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ runner.temp }}/tdk-logs/
          retention-days: 7
          if-no-files-found: warn

      # `--prune-networks` came with tdk-cli-core PR #585; an older tdk rejects
      # the flag, so fall back to a plain `tdk down`.
      - name: tdk down
        if: always()
        run: tdk down --prune-networks || tdk down || true
```

Change three values at the top: `TDK_VERSION`, `TDK_STACK` and `HEALTH_SERVICES`. `tdk up <stack> --dry-run` shows the URLs a stack will print (`http://api.localhost:8080/api/orders/health` for the scaffolded `orders-api` in the `shop` stack, so the route is `orders`) without starting anything.

## Installing tdk and Tilt

| Method | Used in the workflow | Notes |
| --- | --- | --- |
| `npm install --global @tdk-landscape/tdk-cli-core@<version>` | Yes | Needs Node.js 22.12+ ([README](../README.md#installation)); `actions/setup-node` with `node-version: 22` is what this repository's workflows use. Pinning the version is [documented](upgrading.md#install-a-specific-version). |
| `curl -fsSL https://tdk-landscape.github.io/install.sh \| sh` | No | Prebuilt binary, no Node.js. Whether it can install an older version is [not documented](upgrading.md#install-a-specific-version), so it cannot be pinned the same way. Its script was not audited ([security](security.md)). |
| Tilt | Yes, `curl ... tilt-dev/tilt/master/scripts/install.sh \| bash` | The command every workflow in this repository uses. It installs whatever the script's current default is; this repository does not pin a Tilt version. |

`tdk upgrade` is not used in CI: it goes to the latest release and has no version argument.

The version in the file (`1.3.110`) is the latest npm release at the time of writing. It was **not** run through this workflow. Pin the version your team develops with.

### Pin the version in the repository too

Add `minTdkVersion` to `.tdk/project.json` ([upgrading](upgrading.md#set-a-minimum-version-for-the-repo)). It is a floor: `tdk doctor` fails on an older CLI and says `Run: tdk upgrade`. `tdk up` checks it as well. The CHANGELOG lists both under **Unreleased** at the time of writing, so check `tdk doctor` on the version you pin before you depend on it.

## What each command does in the first job

Run for real in a scratch repository (a backend `orders-api` in stack `shop`, committed), TDK 1.3.86, Docker and Tilt installed on that machine:

| Command | Where | Exit code |
| --- | --- | --- |
| `tdk project --yes` | New repository | 0 |
| `tdk resource orders-api --type backend --stack shop` (answering `y`) | New repository | 0 |
| `tdk doctor --no-ping` | New repository | 0 |
| `tdk config verify` | New repository | 0 (`All files are in sync!`) |
| `tdk config verify` | Fresh `git clone`, **before** `tdk project --yes` | 1: five `Missing file: .tdk/.tdk-out/...` lines plus a diff |
| `tdk project --yes`, then `tdk config verify` | Fresh `git clone` | 0, 0 |
| `tdk doctor --no-ping` | Fresh clone after `tdk project --yes` | 0 |
| `tdk config verify` after appending a line to the committed `.tiltignore` that TDK generated | Fresh clone | 1 |
| `tdk config verify` after editing `discovery.paths` in `.tdk/project.json` | Fresh clone | 1: `Out of sync: .tdk/.tdk-out/spec.master` |
| `tdk config verify --json` for that edit | Fresh clone | `data.valid` false, `data.errors` holds the same line |

Why the workflow runs `tdk project --yes` first: `.env` and `.tdk/.tdk-out/` are git-ignored ([gradual adoption](gradual-adoption.md#what-to-commit)), so a clone has neither. Verify reports the missing generated files as drift, and `tdk doctor` without `.env` fails with `Missing required env variables: TILT_ENV, DB_PASSWORD`. In the example project, `tdk config regenerate` also made verify pass without writing `.env` (and without touching tracked files), but `doctor` then failed for the missing variables, so the workflow uses `tdk project --yes`.

### What the first job needs from the machine

- `tdk project --yes` **exits 0 without a running Docker daemon, the Compose plugin and Tilt** (observed on the branch build, with Docker and Tilt removed from `PATH`: it wrote `.tdk/project.json` and the generated master files, then printed a `Runtime readiness:` block naming the missing Docker and Tilt instead of a `Cold start blocked` failure). The runtime gate now belongs to `tdk up`, which still exits 1 with `Cold start blocked` and a `FAIL docker / compose / tilt` list, and `tdk doctor` still fails on the same three. A TDK release that predates this change still exits 1 in `tdk project` without the runtime, so pin a version that includes it before relying on the new behaviour. GitHub-hosted `ubuntu-latest` runners come with Docker, and the workflow installs Tilt, so no image is built and no container is started. Whether the preinstalled Docker on the runner satisfies `tdk doctor`'s Compose and healthcheck version checks was **not verified** on a runner.
- `tdk config verify` on its own (after `tdk config regenerate`) needed neither Docker nor Tilt on `PATH`: it exited 0 with both removed. Use that if you want a job without Docker, and skip `tdk doctor`.
- `tdk project --yes` may change a tracked file. In the clone above it added the stack `shop` to `enabledStacks` in `.tdk/project.json`, because the committed file did not list it. Commit the result; add `git diff --exit-code -- .tdk/project.json` after it if you want CI to fail when someone forgets.

### Exit codes

From [machine-readable CLI](reference/machine-readable-cli.md): for `tdk config verify`, drift or missing tracked master outputs exits 1 and includes a unified diff; a valid project exits 0; a missing project exits 1; invalid project JSON or an unexpected failure exits 2. In general 1 is a blocking finding or command failure and 2 is invalid arguments or an internal error. `--json` prints one envelope on stdout (`schemaVersion`, `data`, `errors`) and keeps the same exit codes. `tdk doctor` exits 1 on a blocking check; warnings alone do not fail it. A step with `run:` fails the job on any non-zero exit.

### A repository that already has a `.tiltignore`

`tdk project` leaves an existing root `.tiltignore` alone ([gradual adoption](gradual-adoption.md#your-own-tiltignore)). `tdk config verify` now reports it as `not generated by TDK, left as is` instead of drift, but the CHANGELOG lists that fix under **Unreleased**. On a tdk that predates it, `tdk config verify` fails with `Out of sync: .tiltignore`. If you hit it, move to a version that has the fix. A `.tiltignore` TDK generated and someone edited is still reported (exit 1 above).

## What the second job does

Mirrors [`e2e-journeys.yml`](../.github/workflows/e2e-journeys.yml), reduced to one stack:

1. Install Tilt and free port 5432. The quickstart workflow explains why: the runner's preinstalled Postgres can take the port and it was restarted after being stopped, so the package is removed. This was needed there at the time; on the machine used for this page `tdk doctor` chose Postgres port 15432 by default, so whether your repository needs the step was not checked.
2. Start `tdk up <stack>` in the background, with its output in a log file, and wait for it to print one `/health` URL for every `HEALTH_SERVICES` entry.
3. Poll the URLs every 10 seconds until all answer with a 2xx status. At most 120 polls, which is the 20 minutes `e2e-journeys.yml` allows; the quickstart suite's 30-minute timeout is the value in `tests/e2e/journeys/quickstart/suite.json`.
4. Once a minute, ask Tilt (`tilt get uiresources`) for resources whose update status is `error`. Tilt does not retry a failed image build, so after two checks in a row the job stops with the resource names instead of waiting out the timeout. The quickstart workflow also stops early when Tilt has no resource for a service (a service TDK never discovered); that check is left out here.
5. Collect `docker ps -a`, `tilt get uiresources`, `tdk doctor` and the last 200 lines of every container into `tdk-logs/`, and upload it with `actions/upload-artifact` (kept 7 days, a choice). The step runs on success too, so a green run leaves the same record.
6. `tdk down --prune-networks`. `--prune-networks` came with PR [#585](https://github.com/tdk-landscape/tdk-cli-core/pull/585) and is under **Unreleased** in the CHANGELOG; an older tdk rejects the flag (exit 1 for an unknown option, checked), so the step falls back to `tdk down`. Without the flag the project's Docker networks stay. `tdk down` needs no confirmation, so `--force` is unnecessary. On a throwaway runner the networks do not matter; on a self-hosted runner they do.

Not covered by the repository's own workflows, so not claimed here: caching Docker layers or the images TDK builds locally. None of this repository's workflows does it. On a clean runner the first `tdk up` builds the project's golden layers and each service image from scratch; how long that takes for your stack was not measured.

### Things to know before you trust the second job

- `tdk up` stays in the background after its step ends, as in `e2e-journeys.yml`. If your runner image kills background processes between steps, the diagnostics and `tdk down` steps will see nothing; fold them into one step.
- Use a GitHub-hosted Linux runner. Windows has CLI smoke coverage only, per the comment in `e2e-journeys.yml`.
- The [smoke block](smoke.md) is an alternative to the `/health` poll: `tdk up` runs it itself and fails with the URL and status.

## Action versions and permissions

The workflow uses major version tags (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`), as this repository's workflows do; its `zizmor.yml` switches the `unpinned-uses` rule off on purpose, and a few actions there are pinned to a commit SHA. If your organisation requires SHA pins, replace the tags with SHAs. The workflow asks for `permissions: contents: read` only, and `persist-credentials: false` on checkout, because no step pushes. It reads no secrets.

## Related

- [Adopting TDK](adopt-tdk.md#4-share-it-with-the-team): step 4, `tdk config verify` in CI
- [Upgrading and version pinning](upgrading.md)
- [Machine-readable CLI](reference/machine-readable-cli.md): `--json` shapes and exit codes
- [Smoke check](smoke.md)
