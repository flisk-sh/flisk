# Assurance case

This page argues why TDK's security requirements are met. It covers the threat model, the trust boundaries, the secure design principles applied, and the common implementation weaknesses that have been countered. Claims point to the code, tests or PRs that back them. Anything not checked is marked **Not audited**.

The security requirements are in [security.md](security.md): TDK is a local development tool, it sends no telemetry, and it makes outbound calls only for `tdk upgrade`, the premium fetch and the service health ping.

## Threat model

TDK runs on a developer's machine. It reads a `service.json` for each service, generates Docker, Compose and Tilt files, and starts containers. The main assets are the project's `.env` secrets (`DB_PASSWORD`, `JWT_SECRET` and similar), the services running on the host's network, and the integrity of the CLI binary and npm package.

| Threat | Where it comes from | Countermeasure | Status |
| --- | --- | --- | --- |
| Injected YAML keys through `service.json` values | A `service.json` copied from an untrusted repository | Each value is checked against an allowlist pattern before it is written into generated YAML (`cli/src/utils/service-manifest.ts`), with tests. Fixed in 1.3.126 (GHSA-phgf-pww4-7jxc, #789). | Fixed, advisory published |
| Dev services reachable from other machines | Ports bound on all interfaces | Dev ports bind to loopback, and the Traefik insecure API is off (#720, GHSA-3hj3-f39v-j2x5, fixed in 1.3.130). | Fixed, advisory published |
| Secrets leaking into logs or diagnostics | `tdk logs` and `tdk doctor` output | Values from the project `.env` are redacted from output (#703). Secrets stay in the gitignored `.env`; generated files hold no secret values (`docs/security.md`). | Partly audited: a secret printed by an application's own output is **Not audited** |
| Weak secrets | Default values for the database and JWT secrets | Generated per project with `crypto.randomBytes` (`cli/src/utils/env-validator.ts`). | Met |
| Tampered release downloads | Man-in-the-middle, or a replaced binary | Downloads are over HTTPS. `checksums.txt` is signed with Sigstore in the release workflow, and `tdk upgrade` checks each binary against it. | Met, see `docs/security.md#releases` |
| Vulnerable dependencies | npm and container dependencies | Dependabot, OSV-Scanner, Trivy and Semgrep run in CI; the lockfile is frozen in CI. | Met for the checks listed; container images pinned by tag, not digest |
| Unsafe generated code | Templates that build code from user input | Generators validate names and values before writing files, and fuzz tests check the `service.json` line-break guard on every PR (`tests/fuzz`). | Partly audited |

## Trust boundaries

1. **The user's `service.json` and project files.** These come from the user or from a repository they cloned. They are validated before any file is generated.
2. **The network.** Outbound calls are listed in [security.md](security.md#what-tdk-sends-over-the-network). Without a licence key and without `tdk upgrade`, the CLI makes no outbound request of its own.
3. **Docker and the container images.** Images are pulled by Docker from registries. Tags are not digests, so a registry could move them (`docs/security.md#images`).
4. **The release channel.** npm, GitHub release assets, and the Sigstore signature checked by `cosign` against the workflow identity.

## Secure design principles applied

- **Least privilege by default.** Dev services bind to loopback, and the Traefik API is not exposed (#720).
- **Fail-safe defaults.** An unknown `service.json` value is rejected before a resource is written.
- **Secrets are not part of the generated output.** Generated files reference secret names, not values.
- **Separation of duties in the build.** CI jobs use least-privilege tokens, and GitHub Actions are pinned to commit SHAs.
- **Keep the design small.** The CLI has no telemetry and no startup update check.

## Common implementation weaknesses countered

| Weakness | Countermeasure |
| --- | --- |
| Injection into generated files | Allowlist validation before writing (`cli/src/utils/service-manifest.ts`), tested and fuzzed |
| Non-atomic writes leaving half-written files | Generated files are replaced atomically (`cli/src/utils/atomic-write.ts`) |
| Insecure randomness for secrets | `crypto.randomBytes` only (`cli/src/utils/env-validator.ts`) |
| Unsafe TypeScript | `strict: true` in `cli/tsconfig.json`, Biome and Semgrep in CI |
| Secrets in logs | Redaction of `.env` values (#703) |

## Limits of this case

- **Not audited:** whether an application prints its own environment variables to the Tilt UI or container logs.
- **Not audited:** the images for optional features and the generated `FROM` lines for Go, Rust, Python and Java (`docs/security.md#images`).
- **Not audited:** a formal third-party security review. The project has not commissioned one.
- The git version tags are not yet signed. Releases are signed through Sigstore, as described in `docs/security.md#releases`.
