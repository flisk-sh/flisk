# TDK CLI — start services on your machine

[![npm version](https://img.shields.io/npm/v/@tdk-landscape/tdk-cli-core.svg?style=flat&color=blue)](https://www.npmjs.com/package/@tdk-landscape/tdk-cli-core)
[![unpacked size](https://img.shields.io/npm/unpacked-size/@tdk-landscape/tdk-cli-core)](https://packagephobia.com/result?p=@tdk-landscape/tdk-cli-core)
[![install size](https://badgen.net/packagephobia/install/@tdk-landscape/tdk-cli-core)](https://packagephobia.com/result?p=@tdk-landscape/tdk-cli-core)
[![CI](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/ci.yml/badge.svg)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/ci.yml)
[![Quickstart E2E](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/quickstart-e2e.yml/badge.svg)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/quickstart-e2e.yml)
[![ERP fixture scale E2E](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/erp-scale-e2e.yml/badge.svg)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/erp-scale-e2e.yml)
[![Example apps E2E](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/examples-e2e.yml/badge.svg?branch=main)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/examples-e2e.yml)
[![CodeQL](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/tdk-landscape/tdk-cli-core/security/code-scanning)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/tdk-landscape/tdk-cli-core/badge)](https://scorecard.dev/viewer/?uri=github.com/tdk-landscape/tdk-cli-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15310/badge)](https://www.bestpractices.dev/projects/15310)
[![Known Vulnerabilities](https://snyk.io/test/github/tdk-landscape/tdk-cli-core/badge.svg)](https://snyk.io/test/github/tdk-landscape/tdk-cli-core)
[![Socket Badge](https://badge.socket.dev/npm/package/@tdk-landscape/tdk-cli-core/latest)](https://socket.dev/npm/package/@tdk-landscape/tdk-cli-core/overview)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [简体中文](docs/README-zh_cn.md) | [繁體中文](docs/README-zh_tw.md) | [日本語](docs/README-ja.md) | [한국어](docs/README-ko.md)

### Stop letting AI hallucinate your local infrastructure.

LLMs are brilliant at writing application logic, but notoriously terrible at maintaining local infrastructure. Every time your AI rewrites a `Dockerfile`, misconfigures a `Tiltfile`, or breaks an `nginx.conf`, it wastes your developer focus and burns thousands of unnecessary API tokens.

**TDK CLI Core** bridges the gap. You write the clean web application logic, and TDK instantly autodetects your stack to generate, link, and orchestrate the local environment for you. 

### ⚡ Zero-Config Local Stacks in 3 Seconds
No vendor lock-in. No tedious plumbing. Run a single command to natively orchestrate **72 different integration tiers** including:
* **Runtimes & Frameworks:** Bun, Node, Python, Go, Rust, React, Vue, Svelte, Elysia, Fastify, NestJS
* **Databases & Tooling:** Prisma, Drizzle, Atlas, Dbmate
* **Messaging & Gateway:** NATS, Traefik


TDK CLI — start services on your machine. It is not a deploy and not a Compose file: define each service in `service.json`, then run `tdk up`. No Kubernetes is needed on the machine.

Stability: 1.x local dev. Write `service.json`; TDK generates the local runtime files. See [what TDK writes](docs/generated-files.md) and how to check for drift. Core CLI is MIT and needs no key. Premium is optional.

Docker runs the containers. Tilt watches services and live-updates containers while you code. TDK CLI writes the configuration Tilt uses. Production deployment stays with Helm, Argo CD, or Kustomize.

[Website](https://tdk-landscape.github.io/tdk-website/) · [Quickstart](https://tdk-landscape.github.io/tdk-website/docs/quickstart/) · [Examples](https://tdk-landscape.github.io/tdk-website/docs/examples/) · [Awesome TDK](https://github.com/tdk-landscape/awesome-tdk-framework) · [Demo](https://tdk-landscape.github.io/tdk-demo-animation/) · [Report a bug](https://github.com/tdk-landscape/tdk-cli-core/issues)

`tdk ui` opens an interactive terminal dashboard for inspecting running services. Move with `↑/↓` or `j/k`, search with `/`, and press `1`–`5` to jump between tabs. See [docs/ui.md](docs/ui.md) for every key binding.

## Who uses TDK

No teams are listed yet. Be the first: [tell us you use TDK](https://github.com/tdk-landscape/tdk-cli-core/issues/new?template=we-use-tdk.yml) or [add a row to ADOPTERS.md](ADOPTERS.md).

If TDK saves you time, a ⭐ on [this repo](https://github.com/tdk-landscape/tdk-cli-core) helps other developers find it.

## Quick start

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
curl http://api.shop.localhost/api/orders/health
```

`tdk up` prints the host ports it chose. It uses port 80 when it is free, so URLs carry no port. Otherwise it picks one from 8080-8180, and the URLs it prints include that port (on Linux and WSL2 a non-root user cannot check port 80, so the range is used there). Use the URL `tdk up` prints, or set `TDK_HTTP_PORT`. A resource named `orders-api` is served at `/api/orders` (a trailing `-api` is dropped); `tdk up` prints the exact URLs.

![TDK scaffolding a backend and a frontend, then listing the stack](docs/assets/demo.svg)

*Scaffolding a backend and frontend, then listing the stack.*

### What TDK writes for a frontend

You maintain `service.json`; TDK generates the local runtime files. A frontend such as `services/store/storefront-web` has files like these after generation:

```text
services/store/storefront-web/
├── service.json                         # your service definition
└── .autogenerated/                     # TDK writes these files
    ├── nginx.autogenerated.conf        # serves the build and routes API requests
    ├── Dockerfile.app.autogenerated     # local app image
    ├── .env.frontend.autogenerated      # local frontend environment
    ├── vite.config.frontend.autogenerated.ts
    ├── tsconfig.autogenerated.json
    └── api-client.ts                    # generated API client
```

You do not need to write the nginx config, Dockerfile, or a `docker-compose.yml` for this local stack. `tdk up` uses Docker and Tilt to start it. The [generated-files guide](docs/generated-files.md) lists the other outputs and explains how regeneration and drift checks work.

![Top 9 places to use TDK CLI: scaffold a service, start a stack, hot reload, port management, auto-discovery, boot order, proxy routing, include infra, and config verify](docs/assets/tdk-cli-top-9-uses.jpg)

If Helm, Compose, or your existing Tilt setup already gives you a working local environment, keep using it. TDK CLI is for engineers managing several services who want a clear local service contract and one command to start the stack.

See [how TDK CLI works alongside Helm](https://tdk-landscape.github.io/tdk-website/docs/with-helm/), the [service schema](engine/schemas/service-schema.json), and the [project configuration schema](engine/schemas/project-schema.json).

## Terminal UI

Use `tdk ui` to inspect stacks and resources. Arrow keys or `j`/`k` move the
selection; `g`/`G` or Home/End jump to the first/last item, and PageUp/PageDown
move one visible page. `/` searches; navigation letters remain search text
while searching. The selected row stays visible when the terminal is resized.

## Installation

Install the CLI from npm (requires Node.js 22.12+) or use the prebuilt binary (no Node.js or Bun required):

```bash
npm install -g @tdk-landscape/tdk-cli-core
# or install the prebuilt binary
curl -fsSL https://tdk-landscape.github.io/install.sh | sh
```

`tdk up shop --dry-run` previews selected local services and URLs before starting containers. The default starter is Bun/TypeScript; TDK's core role is running local containers through Docker + Tilt, not providing a Node.js application framework. See the [one-backend example](examples/one-backend/README.md).

## When not to use TDK

- Your existing Compose or Tilt workflow already gives you a working local environment.
- Helm is your whole development workflow and you do not want local services on Docker.
- You do not want `service.json` manifests and generated local configuration.

## Troubleshooting
Set `TDK_DEBUG=1` before running `tdk up --verbose` to include Starlark debug logs in Tilt output.

## Docs

- [CLI command cheat sheet](cli/README.md#cheat-sheet)
- [Mega cheat sheet: every command and flag](docs/cheat-sheet.md)
- [Documentation index](docs/README.md)
- [Pilot TDK on a real repository](docs/adopt-tdk.md)
- [FAQ for agencies and multi-client teams](docs/faq-teams.md)
- [Working alongside Helm](docs/with-helm.md)
- [Scope: local development, and what does not carry over to production](docs/scope.md)
- [Gradual adoption: adding TDK to an existing repository](docs/gradual-adoption.md)
- [Troubleshooting: tdk and Tilt error messages and their fixes](docs/troubleshooting.md)
- [Layout and ownership: services in several repositories](docs/layout.md)
- [Local data: reset, seed, snapshot](docs/data.md)
- [Upgrading and version pinning](docs/upgrading.md)
- [Security: network calls, secrets and supply chain](docs/security.md)
- [Pilot scorecard](docs/pilot-scorecard.md)
- [Bring-your-own resources](docs/byo.md)
- [Configuration and editor schemas](docs/configuration.md)
- [Generated service files and drift checks](docs/generated-files.md)
- [Runnable one-backend example](examples/one-backend/README.md)
- [Runnable Python backend example](examples/one-backend-python/README.md)
- [Full multi-service example](examples/tdk-example/README.md)
- [Features and license limits](docs/FEATURES.md)
- [Honest comparison and known limits](docs/compare-honest.md)
- [Public claims registry](docs/claims.md)
- [Show HN draft](docs/drafts/show-hn.md)
- [Architecture and repository map](docs/project-overview.md)
- [Scale fixture measurements and caveats](docs/benchmarks/scale-bench.md)
- [Benchmark report: warm and cold start charts, history](https://tdk-landscape.github.io/tdk-cli-core/) (updated on every change to `main` that affects start-up)
- [How to run the start-time benchmark](scripts/benchmark/README.md#tdk-up-warm-start-benchmark)

## History

TDK development began on 21 April 2026. The archived, read-only [tdk-landscape/tdk](https://github.com/tdk-landscape/tdk)
repository records its [first commit](https://github.com/tdk-landscape/tdk/commit/1714637637196ed54cbfa18534230a782c05ab36)
("Initial commit: TDK specs, generators, CLI, and standards") from that day. A separate `tdk-cli` history spanning 21 April to
18 September 2026 was [imported into this repository](https://github.com/tdk-landscape/tdk-cli-core/pull/670) as 306 filtered
commits. Those commits are now ancestors of `main`; the import did not change the source tree.

This `tdk-cli-core` repository was created on 19 September 2026, and the `@tdk-landscape/tdk-cli-core` npm package was first
published on 21 September 2026. Those dates describe the current repository and package, not the start of TDK development.

## Requirements and support

For the local runtime, install Docker (Desktop, OrbStack, or Colima; Engine 25+, Compose 2.20.2+) and [Tilt](https://docs.tilt.dev/install.html). Bun 1.2+ is used by the default generated services. TDK selects host ports from bounded fallback ranges for HTTP, HTTPS, and Postgres; set `TDK_HTTP_PORT`, `TDK_HTTPS_PORT`, or `TDK_POSTGRES_PORT` to override them. Dev ports listen on `127.0.0.1` only, so other machines on your network cannot reach them. Set `TDK_BIND_ADDRESS` (for example `0.0.0.0`, to test from a phone) to change that; `tdk doctor` warns when it is a wildcard address. TDK supports macOS, Linux, and Windows through WSL2 Ubuntu; native Windows supports CLI inspection only. Run `tdk doctor` to check local readiness (supports `--no-ping` to skip service health checks and `--ping-timeout <ms>`). See [WSL2 setup](docs/wsl2.md).

On native Windows, `tdk --version`, `tdk doctor`, and `tdk up --dry-run` are inspect-only commands. `tdk up` exits 2 with “Landscape startup needs Ubuntu on WSL2. Native Windows is inspect-only.”

## License matrix

| Capability | Free | Premium |
| --- | --- | --- |
| `tdk up`, scaffold, Traefik, Postgres, Tilt live update, golden layers | yes | yes |
| Verdaccio, DDD scaffold, Sablier idle stop | no | key |
| Playwright, C4, AGENTS.md | free if generated in-repo | only if the implementation is downloaded with a key |

Core stays free. Premium is a separate key for the extras above; no key required to run `tdk up`.

**Ecosystem map:** examples, articles, related tools, and notes live in [awesome-tdk-framework](https://github.com/tdk-landscape/awesome-tdk-framework). Star this repo (`tdk-cli-core`) if the CLI is what you run; use the awesome list to browse the rest.

## Contributing and license

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [contributor guide](docs/contributing/README.md). To review pull requests, see [Review a pull request](docs/contributing/04-review-a-pr.md). Report security issues using [SECURITY.md](SECURITY.md).

TDK is MIT-licensed; see [LICENSE](LICENSE). The [license boundary](GOVERNANCE.md#license-boundary-and-donation-scope) says which code is MIT and which is downloaded with a key.

Project governance: [GOVERNANCE.md](GOVERNANCE.md), [MAINTAINERS.md](MAINTAINERS.md), [ADOPTERS.md](ADOPTERS.md).
