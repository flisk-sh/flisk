# Pilot TDK on a real repository

For a team lead who wants more than a quickstart before putting TDK on a real repository. TDK CLI turns a `service.json` per service into a local Docker stack, with Tilt watching services and live-updating containers as you code. It is not a deploy tool and not a Compose replacement. Production stays on Helm.

The command output below was captured on one machine (macOS, TDK 1.3.86, Docker 29.8.0, Tilt 0.37.7, Bun 1.3.11) from a scaffolded `backend` service in an empty directory. It was not captured on an existing application. Your output will differ.

## 1. Is it a fit?

Read [When not to use TDK](../README.md#when-not-to-use-tdk) and the [honest comparison](compare-honest.md) first. In short, skip TDK if:

- your Compose or Tilt setup already gives you a working local environment
- Helm is your whole development workflow and you do not want local services on Docker
- you do not want `service.json` manifests and generated local configuration

Native Windows can inspect a project but cannot start it; startup needs Ubuntu on WSL2 ([WSL2 setup](wsl2.md)).

## 2. Pilot in one afternoon

Pick two or three services that start together. Work in a branch, not on `main`.

Install the CLI (see the [README](../README.md#installation)), then from the repository root create the TDK project files:

```bash
tdk project --yes
```

In an empty directory this wrote `.tdk/project.json`, a `.env` with working defaults, the generated files under `.tdk/.tdk-out/`, and also a root `package.json`, a `.tiltignore` and `shared-platform-engineering/docker-templates/`. It added `.env`, `.tdk/.tdk-out/`, `.tdk/.project-id` and `.tdk/smoke/` to `.gitignore`, plus `node_modules/` in that empty directory. In an existing repository, run `git status` after this step and read what changed before you commit. In a repository that already had a `package.json`, `.tiltignore`, `Tiltfile` and `docker-compose.yml`, `tdk project --yes` left all of them byte-for-byte unchanged and only appended to `.gitignore`; see [gradual adoption](gradual-adoption.md).

Add each service. To wrap a service you already have, use a [bring-your-own resource](byo.md); it does not generate application code:

```bash
tdk resource orders-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

To scaffold a new Bun/TypeScript service instead, which is what the output below used:

```bash
tdk resource orders-api --type backend --stack shop --yes
```

The bring-your-own command above is the one from [byo.md](byo.md). Run in a scratch project it created the resource (`service.json`, `AGENTS.md`, `health.conf` and a placeholder nginx `Dockerfile`); that resource was not started. Each service gets a `service.json`. Commit it with the service. A bring-your-own service must listen on the port in `service.json`, bind to `0.0.0.0`, and answer HTTP 200 on `healthCheckPath`; [byo.md](byo.md#what-tdk-needs-from-the-container) lists the full contract.

Then check the machine and preview the stack before starting anything:

```bash
tdk doctor
tdk up shop --dry-run
tdk up shop
```

`tdk doctor` checks your local Docker and Tilt environment; it does not check cluster deployments. It ends with `✓ Doctor passed. Next: tdk up` when nothing blocks you. `tdk up shop --dry-run` starts nothing:

```text
$ tdk up shop --dry-run
Would start 1 service from stack "shop"...
  - orders-api

🔧 Backend API URLs:
  - orders-api: http://api.pilot.localhost/api/orders/health
Host ports: HTTP 80, HTTPS 443, Postgres 15432
Override with TDK_HTTP_PORT, TDK_HTTPS_PORT, or TDK_POSTGRES_PORT.
Dry run - not starting services
Would run: tilt up -f /path/to/pilot/.tdk/.tdk-out/Tiltfile -- --focus=shop orders-api
```

The hostname starts with the project directory name (`pilot` here). `tdk up shop` then builds the image and starts Traefik, Postgres and your services. On that run the service answered at the URL above with `{"status":"ok","service":"orders-api"}`.

Two things seen on that run that you may also meet:

- On TDK 1.3.86 `tdk doctor` warned about an unknown `healthCheck` field on a freshly scaffolded service. The warning is now worded `<path>/service.json.healthCheck: unknown field is preserved` (observed by running `tdk doctor --no-ping` on a `service.json` with an extra `healthCheck` field; `<path>` printed as an absolute path). A backend scaffolded by current `main` already writes `healthCheckPath`, and `tdk doctor --no-ping` printed no such warning.
- `tdk down --force` failed with `unknown flag: --force`. `tdk down --help` now lists `--force`, but it passes the flag on to `tilt down`, and running `tilt down --force` directly (Tilt 0.37.7) still prints `unknown flag: --force`. `tdk down --force` itself was not run. Use `tdk down` without it.
- Before the fix in [#600](https://github.com/tdk-landscape/tdk-cli-core/pull/600), `tdk doctor` failed with `N resources without a package.json` for bring-your-own resources created with `tdk resource --type bring-your-own` (both `--dockerfile` and `--image`). That check no longer applies to them; if you still see it, upgrade `tdk` (`tdk upgrade`). It still fails for a backend, frontend or worker that has no `package.json`.

## 3. Keep your current setup

Do not remove anything during the pilot. TDK does not replace Compose or Helm, and it does not install or take over your charts ([TDK and Helm](with-helm.md)). `tdk project` and `tdk resource` did not change a `docker-compose.yml` already in the repository ([gradual adoption](gradual-adoption.md)). Running TDK and that Compose stack at the same time was **not tested**.

- Keep your `docker-compose.yml`, Tiltfile and Helm charts where they are, and use `git status` to see exactly which files TDK added.
- If a service in your Compose file uses the same host port as a TDK one, change the TDK port with `TDK_HTTP_PORT`, `TDK_HTTPS_PORT` or `TDK_POSTGRES_PORT`.
- `service.json` is not `values.yaml`, and `.tdk/.tdk-out/` is not a chart. Do not copy it into Helm. See [TDK and Helm](with-helm.md) for what maps to what.

If the pilot does not work out, run `tdk down` (add `--prune-networks` to also remove this project's Docker networks that no container uses) and throw the branch away. `tdk down` removes the stack's containers and stops this project's `tilt up`; named volumes, including the Postgres data, are kept ([local data](data.md)).

## 4. Share it with the team

When the pilot services start cleanly:

1. Commit each `service.json` and `.tdk/project.json`. `.env` and `.tdk/.tdk-out/` are gitignored by `tdk project`; see [environment.md](environment.md) for what belongs in git.
2. Add the commands a new teammate needs to your repository README, for example `tdk doctor` and `tdk up shop`.
3. Run `tdk config verify` in CI. It checks that the generated project files match `.tdk/project.json` and exits non-zero on drift. It does not validate `service.json` or Helm values. For a copy-paste workflow see [Running TDK in CI](ci.md); it is adapted from [`example-e2e.yml`](../.github/workflows/example-e2e.yml), which runs `tdk project --yes`, `tdk doctor --no-ping` and `tdk config verify` on the bundled example.

## 5. What to measure

Measure these on your own repository and write down the date, machine and TDK version. The [pilot scorecard](pilot-scorecard.md) lists the full set, including the ones a person counts by hand (onboarding questions, CI reliability, the decision); the two below are the minimum:

- **Time to first healthy URL:** from running `tdk up` to the first HTTP 200 on a service health URL. Say whether the images already existed. A cold build takes longer than a warm start.
- **Setup steps removed:** the steps in your current "get started" page that a new teammate no longer has to do. Count them from the page, not from memory.

`scripts/pilot-scorecard.sh` records the first one, plus memory and CPU, in a repeatable form; see the [pilot scorecard](pilot-scorecard.md).

Only quote numbers you measured, with their conditions. Do not repeat the figures in the [claims registry](claims.md) as your own results, and do not use its wording for anything it does not cover. For example, onboarding time is "not measured on a hiring cohort"; do not write that TDK saves weeks of setup.

## 6. Tell us

- Run TDK on your repositories? Use the [We use TDK](https://github.com/tdk-landscape/tdk-cli-core/issues/new?template=we-use-tdk.yml) form, or add a row to [ADOPTERS.md](../ADOPTERS.md).
- It did not fit or something broke? Search [Troubleshooting](troubleshooting.md) for the message, then [open an issue](https://github.com/tdk-landscape/tdk-cli-core/issues/new/choose) and include the output of `tdk doctor`.
