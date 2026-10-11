# Roadmap

This page says what TDK intends to do and not do over the next 12 months. It is a plan, not a promise of dates. Work moves between items as issues are opened and closed; the [issue tracker](https://github.com/tdk-landscape/tdk-cli-core/issues) and [CHANGELOG.md](../CHANGELOG.md) are the record of what has shipped.

## Intended (next 12 months)

- **Stable 1.x local development.** Keep `tdk up`, scaffolding, generated files and `tdk config verify` backward compatible within 1.x. Breaking changes wait for a new major version and are announced in the CHANGELOG first.
- **Free core stays free.** The core CLI stays MIT-licensed and needs no key to run `tdk up`. Optional extras stay behind a separate premium key, as described in [FEATURES.md](FEATURES.md) and [GOVERNANCE.md](../GOVERNANCE.md#license-boundary-and-donation-scope).
- **Windows and WSL2 support.** Keep the Windows and WSL2 smoke tests green and fix platform-specific gaps as they are reported (`windows` label).
- **Supply-chain hardening.** Keep signed release checksums, pinned GitHub Actions, pinned Docker base images, and the CodeQL, Semgrep, Trivy and OSV-Scanner checks running on every pull request.
- **Documentation kept current.** Fix documentation defects as they are found, and keep the cheat sheet, configuration reference and generated-file docs in line with the current release.
- **More maintainers.** Add at least one more maintainer, following [GOVERNANCE.md](../GOVERNANCE.md), so that the project does not depend on two people.

## Not planned

- **Not a production deploy tool.** TDK starts services on a developer machine. It does not deploy to production.
- **Not a Compose file generator for production.** Generated Compose and Tilt files are for local use.
- **Not a Kubernetes tool.** TDK does not target Kubernetes and has no plans to add it.

## How to influence the roadmap

Open a feature request or an RFC issue (`rfc` label) describing the problem and who it affects. Maintainers decide what goes into a release, as described in [GOVERNANCE.md](../GOVERNANCE.md).
