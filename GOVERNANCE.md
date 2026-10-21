# Governance

tdk-cli-core is a local Docker/Tilt project generator. It is not an orchestrator. This document records how the project is run today.

## Decisions

Decisions are made in a pull request or an issue and recorded there. Maintainers merge when review is complete. Disagreements are resolved by discussion on the PR or issue; if no consensus is reached, a majority of maintainers decides.

## Becoming a maintainer

1. A contributor has several merged, non-trivial pull requests and has reviewed others' work.
2. An existing maintainer nominates them in an issue.
3. A majority of maintainers approves in that issue, with no unresolved objection.
4. A pull request adds a row to [MAINTAINERS.md](MAINTAINERS.md) with Name, GitHub id, and Company, and merge rights are granted.

## Removing a maintainer

A maintainer is removed when they ask to step down, or after a year without reviews or merges and no response to a nomination for removal. A pull request removes the row and merge rights are revoked. Removal is recorded in the PR.

## Foundation applications

A foundation application requires at least 3 maintainers from at least 2 employers, listed in MAINTAINERS.md before the application is filed. `flisk maintainers check` reports whether the file meets that bar. It is a gate, not a promise to apply, and it is expected to fail while the project has one employer. No application is filed until it exits 0 on real rows and [ADOPTERS.md](ADOPTERS.md) lists teams other than the health fixture.

## License boundary and donation scope

The core CLI is MIT-licensed (see [LICENSE](LICENSE)) and runs without `TDK_LICENSE_KEY`: `flisk up`, scaffold, Traefik, Postgres, and Tilt live update. See the [license matrix](docs/FEATURES.md#license-matrix).

A future foundation donation covers the MIT tree only. It does not include implementations downloaded with `TDK_LICENSE_KEY`. These are outside foundation scope until that code is committed under the MIT license:

- Verdaccio
- DDD scaffold
- Sablier idle stop
- any other path that downloads code with `TDK_LICENSE_KEY`

## Contributions

Commits must carry a DCO sign-off; see [CONTRIBUTING.md](CONTRIBUTING.md) and [DCO](DCO).
