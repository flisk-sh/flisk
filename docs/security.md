# Security: network calls, secrets and supply chain

Answers for a security reviewer. Each line says what was checked in the source at the time of writing; anything not checked is marked **Not audited**. Report a vulnerability through [SECURITY.md](../.github/SECURITY.md).

## What Flisk sends over the network

Flisk has no telemetry or analytics ([project overview](project-overview.md#telemetry)). Searching `cli/src` for HTTP clients finds these outbound calls, and no others:

| Call | When | Goes to | Sends |
| --- | --- | --- | --- |
| `flisk upgrade` version check and download | Only when you run `flisk upgrade` | `api.github.com` releases, GitHub release assets, and on Windows `registry.npmjs.org` | An ordinary unauthenticated request. `checksums.txt` is first verified against the release's Sigstore bundle, then the binary and the bundled engine are checked against it, all before the installed copy is replaced (read in `upgrade.ts`; see Releases below). |
| Premium extension fetch | Only when `FLISK_LICENSE_KEY` is set and a premium feature is used | `FLISK_PREMIUM_ENDPOINT`, default a Cloudflare Worker (`tdk-extension-dist.oranguman.workers.dev`) | The license key as a bearer token, the resource name and a random per-project id stored in `.flisk/`. A bundle is cached under `~/.flisk/cache/`. |
| `flisk doctor` service ping, and the `smoke` checks that `flisk up` runs for services that declare them | When services are running; `flisk doctor --no-ping` skips the ping | `<project>.localhost` (or `FLISK_SERVICE_BASE_URL`) | A GET to each service's health endpoint. |

Without a licence key, and without running `flisk upgrade`, the CLI makes no outbound request of its own. There is no update check on startup.

`flisk up` itself pulls container images and, inside image builds, package-manager dependencies (for example `bun install`). Those requests come from Docker and from your own `package.json`, not from the CLI. See [corporate proxy and private registry](faq-teams.md#corporate-proxy-vpn-private-registry-custom-ca) for what is not tested yet.

## Secrets

- Secret values live in the gitignored project `.env` or, with `FLISK_SECRET_PROVIDER=keychain`, in the operating system keychain; `service.json` holds only their names. See [Environment, params and secrets](environment.md).
- Generated files contain no secret values, and `DB_PASSWORD` and `JWT_SECRET` are generated per project, never shared between projects. With `keychain`, values are exported into the `tilt`/`docker compose` child process environment; Compose keeps `${NAME}` interpolation in the generated files, so no value is written to disk by the generator.
- `flisk secret set NAME` reads the value only from stdin or a hidden terminal prompt (never a CLI argument). `flisk secret list` prints names only. `flisk doctor`, `--json` envelopes and log output never print a keychain value.
- The smoke records under `.flisk/smoke/` hold response bodies with the project's own `.env` values masked, in the stored body, in the last-success copy, in the printed snippet and in the recorded URL. The masking covers the values in `.env` and nothing else, so it is not a secret scanner.
- `FLISK_SECRET_PROVIDER=infisical` leaves secrets to Infisical and injects nothing from `.env`.
- With `FLISK_SECRET_PROVIDER=keychain`, resolved values are added to the masking list, so a value echoed by a container is redacted wherever Flisk prints application output.
- **Application output is masked wherever Flisk shows it.** That covers `flisk logs` (Tilt text and JSON, native process logs), the live and stored output of native processes (`.flisk/native/logs/`), `flisk up` failure reasons, timeout excerpts and `--wait` log tails, `flisk doctor` (text and `--json`, crash-loop excerpts and container log snippets), the smoke records, and every result of the MCP tools (`flisk mcp`). Two kinds of text are masked:
  - Values: everything in `.env` and the `--env-file` selection, the values of each service's `envFile`, the process environment values of the names in a service's `secrets` (`required`, `optional`, `generate`), and `env` or `params` entries whose name says it is a secret (it contains SECRET, TOKEN, PASSWORD, PASSPHRASE, CREDENTIAL, PRIVATE, API_KEY, ACCESS_KEY or AUTH, or ends in `_KEY`), both as written and with `${VAR}` expanded the way the service receives it. A multiline value is also masked line by line. A value shorter than 8 characters is never masked, so a trivial value does not blank out ordinary words.
  - Shapes, even when the value is in no file: `Bearer <token>`, PEM private key blocks (also one printed line by line, and a block cut off before its `END` line, masked from `BEGIN` to the end of the text), `scheme://user:password@` credentials, AWS `AKIA`/`ASIA` access key ids, GitHub `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` and `github_pat_` tokens, Slack `xox` tokens, Stripe `sk_`/`rk_` keys, `sk-` provider keys and JSON web tokens. The list is `SECRET_PATTERNS` in `cli/src/utils/secret-redaction.ts`.
  - If an env file exists but cannot be read, the output is withheld rather than shown unmasked (`flisk doctor` text and `--json` included).
  - Log tails are masked before they are cut to length, so a cut never leaves part of a secret behind.
- **Not audited, and not masked:** the Tilt web UI (default `http://localhost:10350`) and a direct `tilt logs`, `docker logs` or `docker compose logs`, because Tilt and Docker print the application's output themselves; Flisk starts Tilt and links its URL but does not proxy or filter it. Output of `flisk run` and interactive commands you type yourself is shown as the command prints it (the MCP tool `resource_run` is masked). Agent checkpoints from `flisk agent sessions` are masked only through the MCP tools. A secret shorter than 8 characters, a secret in a shape not listed above that is in no env file, and a private key printed without its `BEGIN` line in the window you read can still appear.

## Images

Every third-party image that Flisk generates or ships, with the tag in the source. Audited on 2026-11-14 against [endoflife.date](https://endoflife.date); the `base-images` gate (`scripts/scores/base-images.mjs`, run by `make scores` and `make test-shell`) fails when a line below goes past its end of life, when a reference has no tag or uses `:latest` without a digest, and when an image the engine or the CLI generates is missing from this table.

| Image | Tag | Used by | Tag policy |
| --- | --- | --- | --- |
| `traefik` | `v3.7.14` | Ingress (`traefik_standalone.star`) | Version tag; official |
| `postgres` | `16-alpine` | Database (`infra-loader.star`, `next-postgres` template) | Major line; official |
| `oven/bun` | `1.3.11-alpine` | Golden Bun runtime layer | Exact version plus digest; official |
| `oven/bun` | `1.4.4-alpine` | `wake-gateway` image | Exact version plus digest, refreshed by Dependabot (the one Dockerfile it covers); official |
| `oven/bun` | `1.4.4-slim` | Release image (`scripts/release/flisk-image.Dockerfile`) | Exact version plus digest; official |
| `oven/bun` | `1.3` | Scaffolded `Dockerfile` that `flisk up` does not build | Minor line, no digest (the user owns the file); official |
| `node` | `22-alpine` | Golden Node backend layer | Major line plus digest; official |
| `node` | `22-slim` | Generated Node and Next.js `Dockerfile` | Major line plus digest; official |
| `nginx` | `1.30-alpine` | Golden static frontend layer, non-golden runtime layer, bring-your-own placeholder `Dockerfile` | Stable line plus digest; official |
| `alpine` | `3.22` | Golden base layer and generated runtime layers | Minor line; official |
| `golang` | `1.27-bookworm` | Generated Go `Dockerfile` | Minor line plus digest; official |
| `rust` | `1-slim-bookworm` | Generated Rust `Dockerfile` | Major line plus digest; official |
| `python` | `3.12-slim` | Generated Python `Dockerfile` | Minor line plus digest; official |
| `debian` | `bookworm-slim` | Runtime stage of the generated Go and Rust `Dockerfile` | Release name plus digest; official |
| `sablierapp/sablier` | `1.18.0` | Idle stop (premium) | Exact version; the upstream project's own image |
| `docker` | `29.9.2-cli` | Release image (Docker CLI) | Exact version plus digest; official |
| `redis` | `7.4-alpine` | `flisk resource` infra presets | Minor line; official |
| `mysql` | `8.4` | `flisk resource` infra presets | LTS line; official |
| `mongo` | `8.0` | `flisk resource` infra presets | Major line; official |
| `rabbitmq` | `4.4-management-alpine` | `flisk resource` infra presets | Minor line; official |
| `nats` | `2.11.8-alpine` | `flisk resource` infra presets | Exact version; official |
| `clickhouse/clickhouse-server` | `25.8-alpine` | `flisk resource` infra presets | Minor line; the vendor's own image |
| `qdrant/qdrant` | `v1.12.5` | `flisk resource` infra presets | Exact version; the vendor's own image |
| `ghcr.io/mlflow/mlflow` | `v3.17.2` | `flisk resource` infra presets | Exact version; the project's own registry |
| `pgsty/minio` | `RELEASE.2026-08-04T00-00-00Z` | `flisk resource` infra presets | Exact release; a community fork, because MinIO no longer publishes official images |
| `axllent/mailpit` | `v1.33.1` | `flisk resource` infra presets | Exact version; the project's own image |
| `stripe/stripe-mock` | `v0.206.0` | `flisk resource` infra presets | Exact version; Stripe's own image |

Policy. A tag that names a supported release line (or an exact version) is required; `:latest` is only allowed next to a digest, where the tag is cosmetic. The generated language `Dockerfile` lines, the golden layers, `wake-gateway` and the release image pin `name:tag@sha256:...`, which keeps the multi-arch manifest list, so the same line works on amd64 and arm64. The other references (Alpine in the runtime layers, Postgres, Traefik, Sablier, the scaffold and the `flisk resource` infra presets) are tags only. Dependabot reads one Dockerfile in this repository (`wake-gateway`); the generated lines live in Starlark and TypeScript, so the [refresh-image-digests workflow](../.github/workflows/refresh-image-digests.yml) re-resolves every pinned tag to its current digest each week (`scripts/refresh-image-digests.mjs`, via `docker buildx imagetools inspect`) and opens a pull request when one moved, so the pins keep taking the base images' patches. It never moves a tag: when the `base-images` gate reports a line at its end of life, a person changes the tag. The end-of-life table in the gate is dated; update it in the same change that moves a tag. Changing a line of the golden layers changes the golden Dockerfile hash, so the golden images are republished on the next merge. The engine ships no monitoring, ELK, Debezium or Java images, and `node:20-alpine` is no longer used.

The golden layer images (`...-l1:latest` and similar) are built from these bases. By default `flisk up` pulls them prebuilt from `ghcr.io/flisk-sh/golden-<layer>:<hash12>`, which this repository's `publish-golden-images.yml` workflow builds from the same generated Dockerfile; the tag is the Dockerfile's hash. The workflow signs each image by digest with cosign (keyless, GitHub's OIDC identity) in both registries and attaches a build provenance attestation (`gh attestation verify oci://ghcr.io/flisk-sh/golden-<layer>@<digest> --repo flisk-sh/flisk`). On pull, `flisk up` runs `cosign verify` for the workflow identity `https://github.com/flisk-sh/flisk/.github/workflows/publish-golden-images.yml@.*` (issuer `https://token.actions.githubusercontent.com`) **only when `cosign` is on your PATH**; an image that fails is discarded and the layers are built locally instead. Without cosign nothing is checked and the pull works as before, unless you set `FLISK_GOLDEN_VERIFY=require`, which treats a missing cosign like a failed check and builds locally. This proves the image was pushed by that workflow; it does not prove the Dockerfile is free of problems, and it is not checked at all by default. Images published before signing was added are signed afterwards by the publish workflow (it signs an already published hash that has no signature, without rebuilding it), so the first run after that does not rebuild locally. The check reads the digest of the pulled image, so it is not defeated by a moved tag, and the base images in the Dockerfile are pinned by tag and digest where the table says so. Set `FLISK_GOLDEN_REGISTRY=off` to build them locally instead.

## Agents and prompt injection

Text an agent reads from tools is untrusted. The `tool-loop` starter blocks destructive tools after a turn has read tool output (`agent/guard.mjs`), and `flisk project` scaffolds default Claude Code permission rules. See [Prompt injection: the lethal trifecta](agents/ai-agents.md#prompt-injection-the-lethal-trifecta).

## Dependency advisories

A vulnerable third-party package in a lockfile is tracked in the open. The [security-alert-issues workflow](../.github/workflows/security-alert-issues.yml) reads the Dependabot alerts and the osv-scanner code-scanning alerts, and opens one issue per open alert with the advisory detail: the GHSA and CVE links, the severity and CVSS vector, the CWE, the affected version range, the patched version, the manifest that resolves it, and a link to the advisory text. The issue is labelled with the severity, the package, the ecosystem, the advisory source and the CWE, so a contributor can find the ones they want. It closes itself when the alert is fixed.

The script behind it is [scripts/security-alert-issues.mjs](../scripts/security-alert-issues.mjs), and it is the only implementation: the workflow checks the default branch out and runs that file, so the same code runs locally.

```bash
# What would the sync do, without writing anything?
node scripts/security-alert-issues.mjs --dry-run

# Run it for real (needs gh authenticated with security-events: read and issues: write)
node scripts/security-alert-issues.mjs
```

Only issues carrying the `security-alert` label are touched, so a hand-written issue is never rewritten or closed. A contributor's `claimed` label is left alone when the labels of a managed issue are refreshed.

The workflow runs on the `repository_vulnerability_alert` event and on a nightly schedule. The event reacts to a new alert; the schedule is the reliable path and also closes the issues whose alert was fixed without an event.

## Releases

- The npm package is published from GitHub Actions with `npm publish --provenance` ([release workflow](../.github/workflows/release-binaries.yml)).
- Release binaries and the engine archive have SHA-256 entries in `checksums.txt`, verified by `flisk upgrade` (read in the source). The `install.sh` in this repository only hands off to the official installer at `flisk-sh.github.io/flisk-sh.github.io/install.sh`, which is not in this repository; its header comment says it verifies the release checksums, and that script was **not audited** here. The checksums alone come from the same release as the binaries, so on their own they detect a bad download but not a compromised release; `flisk upgrade` therefore also checks the signature described next. The `install.sh` here is a hand-off only and does no verification itself; this change does not touch the external installer.
- After each release, the workflow signs `checksums.txt` (keyless, with [cosign](https://docs.sigstore.dev/) and the workflow's GitHub identity) and attaches `checksums.txt.sigstore.json` next to the binaries in the [flisk-sh/releases](https://github.com/flisk-sh/releases/releases) release, and both files to a release with the same tag in this repository (where OpenSSF Scorecard looks). This step runs last and is best effort: it can fail without affecting the npm package or the binaries, so a release may exist without it; the `sign-release.yml` workflow signs such a version afterwards (see [releasing.md](releasing.md#repair-a-half-finished-release)). The workflow also attests build provenance for `checksums.txt` (`checksums.txt.intoto.jsonl`, verify with `gh attestation verify`); only releases built after that step was added have it. Check a download with cosign **3.0 or newer** (the signature is a Sigstore bundle in format v0.3, which cosign 2.x cannot read and reports as "bundle does not contain cert for verification"). This was checked on v1.3.130 with cosign 3.0.6, and a changed `checksums.txt` or a different workflow identity both fail:

  ```bash
  cosign verify-blob --bundle checksums.txt.sigstore.json \
    --certificate-identity-regexp 'https://github.com/flisk-sh/flisk/.github/workflows/(release-binaries|sign-release)\.yml@.*' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com checksums.txt
  shasum -a 256 -c checksums.txt   # then check the file you downloaded against the verified list
  ```

- `flisk upgrade` verifies that signature itself, using the [sigstore](https://www.npmjs.com/package/sigstore) library (bundled into the binary; no cosign needed). After downloading the binary, the engine and `checksums.txt`, it fetches `checksums.txt.sigstore.json` from the same release and checks, before reading any checksum: the signature over the exact bytes of `checksums.txt`, the Sigstore transparency-log entry and Fulcio certificate chain (trust root fetched through TUF), the certificate's OIDC issuer (`https://token.actions.githubusercontent.com`), and that its identity matches `https://github.com/flisk-sh/flisk/.github/workflows/(release-binaries|sign-release).yml@*` (the same identity as the cosign command above). Only then are the binary and engine hashes compared with `checksums.txt`. Outcomes: a bundle that is present but does not verify (changed `checksums.txt`, other identity, bad certificate) is an error and nothing is installed; a release with no bundle is an error when the target is v1.3.130 or newer (every release since then is meant to be signed, so a missing bundle is treated as a downgrade attempt or a broken release), and only older releases print a warning and continue on the checksums alone, where `FLISK_UPGRADE_REQUIRE_SIGNATURE=1` turns the warning into an error. If the Sigstore trust root (TUF, `tuf-repo-cdn.sigstore.dev`) cannot be fetched, for example offline, the upgrade fails with an error naming the cause and installs nothing; verification is never skipped, with or without the environment variable. Known gap: some releases at or after v1.3.130 were published without a bundle (see the PR that added this check), so upgrading to exactly those versions is refused until `sign-release.yml` is run for them. Not covered: the binary and engine are trusted only through the signed checksums (they are not signed individually), and the check needs network access to GitHub and the Sigstore TUF mirror. Unit-tested in `cli/src/commands/__tests__/upgrade.test.ts` (valid, tampered, wrong identity, missing bundle before and after the cutoff, missing bundle with the env var, unreachable trust root), and the library was run against the real v1.4.64 bundle.
- The binaries themselves are not individually signed, and there is no SBOM.
- Core is MIT, so you can build from source.
