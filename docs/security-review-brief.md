# Security review brief

A scope for an independent security review or penetration test of the Flisk CLI. It exists so the project can commission a review by sending one link. No third-party review has been done yet ([assurance-case.md](assurance-case.md)); when one is, its report and the fixes are linked from here and from [TRUST.md](project/TRUST.md).

## What Flisk is, for a reviewer

A CLI (TypeScript, shipped as an npm package and as single-file binaries) plus a Starlark engine run by Tilt. It reads one `service.json` per service, writes Dockerfiles, a Compose file and a Tiltfile, and starts the services on the developer's machine, as containers or as local processes. It also runs an MCP server over stdio, so an AI coding agent can call it. It does not deploy and holds no customer data. Background: [ARCHITECTURE.md](ARCHITECTURE.md), [security.md](security.md), [assurance-case.md](assurance-case.md).

## In scope

Ordered by where we expect the most risk.

| # | Area | Where | Questions for the reviewer |
| --- | --- | --- | --- |
| 1 | Untrusted project input | `service.json` parsing and validation (`cli/src/utils/service-manifest.ts`), `flisk import` of Compose, Procfile and package.json, the generators under `cli/src/generator` and `runtime/engine/topologies` | Can a crafted `service.json` or imported file inject keys into generated YAML, Dockerfiles or the Tiltfile, write outside the project, or run a command the user did not declare? |
| 2 | MCP server | `cli/src/mcp` | Can text from a project (a README, a log line, a `service.json` field) steer an agent into a tool call with wider effect than the user asked for? Are destructive tools (`down`, `project_eject`, `resource_run`) bounded to the project? |
| 3 | Network exposure | Traefik, Tilt and service port bindings, native process runner | Is anything reachable from another machine on the same network by default? |
| 4 | Secrets | `.env` generation (`cli/src/utils/env-validator.ts`), redaction (`cli/src/utils/secret-redaction.ts`), `flisk logs`, `flisk doctor`, MCP log tools | Can a secret reach logs, diagnostics, generated files or an MCP client? |
| 5 | Update and install path | `flisk upgrade` (`cli/src/commands/upgrade.ts`), `install.sh`, release workflows (`.github/workflows/release-binaries.yml`, `sign-release.yml`) | Can a network attacker or a compromised release asset get code run through upgrade or install? Is the Sigstore identity check strict enough? |
| 6 | Prebuilt golden images | `publish-golden-images.yml`, `runtime/engine/topologies/platform/docker/build/golden_image_build.star` | Can a pulled image differ from the one the workflow built? |
| 7 | Licensed extension download | Code paths that use `FLISK_LICENSE_KEY` | How is a downloaded extension authenticated before it runs? |
| 8 | CI and supply chain | `.github/workflows`, Dependabot, pinned actions | Can a pull request from a fork reach secrets or write to releases, packages or the registry? |

## Out of scope

- Third-party software Flisk starts (Docker, Tilt, Traefik, Postgres and other service images); report those upstream.
- The hosted `*.flisk.si` and `flisk.sh` websites; they are separate repositories.
- Commands a user declares in their own `service.json`. Running them is the purpose of the tool, in the same way `npm install` runs package scripts. Running Flisk on a cloned repository means trusting that repository's commands; reports that show a way around that boundary are in scope.

## Accepted risks, stated up front

- `flisk up` on an untrusted repository runs that repository's code, as any development tool does.
- Service base images are pulled by tag; see [security.md#images](security.md#images) for the current policy.
- Two maintainers review all changes; there is no separate security team.

## Practical details

- Build from source: `npm --prefix cli ci && npm --prefix cli run build`. Tests: `make test`.
- A test project: `flisk demo`, or `flisk project agent-stack` for an agent stack with MCP tools, a database and messaging.
- Report findings privately through [GitHub security advisories](https://github.com/flisk-sh/flisk/security/advisories/new). The disclosure timeline in [SECURITY.md](../.github/SECURITY.md) applies; the report is published with the fixes unless the reviewer asks otherwise.

## Reviews done

None yet.
