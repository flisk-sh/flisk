# Trust and due diligence

Answers for someone deciding whether to depend on Flisk, recommend it, or partner with the people behind it. Every answer either links to evidence you can check yourself or says **Not stated** where this repository has no evidence. Nothing here is a claim we cannot back.

Figures were read on 2026-11-14. The commands next to them reproduce them.

## What you would be trusting

Flisk is a command-line tool for **local development**. It starts an app's services on a developer's own computer. It does not deploy, does not run in production and does not hold customer data ([scope](../scope.md)). The realistic risk of adopting it is to developer machines and to the supply chain of the tool itself, not to production workloads. That is where the security work below is aimed.

| Question | Answer | Evidence |
| --- | --- | --- |
| Does it run production or critical workloads? | No. Local development only; production stays with your own deployment tools. | [scope.md](../scope.md), [README](../../README.md) |
| Does it collect data? | No telemetry or analytics. The CLI calls the network only for actions you ask for (upgrade, licensed extensions, image pulls). | [project-overview.md#telemetry](../project-overview.md#telemetry), [security.md](../security.md) |
| What does it need on the machine? | Docker and Tilt for container stacks; neither for plain local processes. | [run-without-docker.md](../run-without-docker.md) |

## Who runs it

| Question | Answer | Evidence |
| --- | --- | --- |
| Maintainers (merge rights) | Two people from two employers: Kateryna Burym (`kburym`, 221e) and Oleksandr Dykyi (`odykyi`, independent). | [MAINTAINERS.md](MAINTAINERS.md) |
| How decisions are made, how maintainers join and leave | In public PRs and issues; majority of maintainers when there is no consensus. | [GOVERNANCE.md](GOVERNANCE.md) |
| Bus factor | Two maintainers. The governance file requires a third maintainer from another employer before any foundation application. | `flisk maintainers check` |
| Who else contributes | Most commits in the last 90 days come from the two maintainers; outside contributors land PRs through the same review. | `git shortlog -sn --since=90.days` |
| Legal entity and jurisdiction | **Not stated.** The license names the copyright holder as "Flisk Landscape"; this repository does not say whether that is a registered company or where. | [LICENSE](../../LICENSE) |
| Intellectual property | Core code is MIT. Contributors keep their copyright and license it under MIT through the DCO sign-off on every commit; there is no CLA. Code downloaded with `FLISK_LICENSE_KEY` is not in this repository and not MIT. | [LICENSE](../../LICENSE), [DCO](DCO), [GOVERNANCE.md#license-boundary-and-donation-scope](GOVERNANCE.md#license-boundary-and-donation-scope) |
| Conflicts of interest | **Not stated** beyond the maintainers' listed employers. | [MAINTAINERS.md](MAINTAINERS.md) |

## How it is paid for

| Question | Answer | Evidence |
| --- | --- | --- |
| Business model | Open core: the CLI is free and MIT; optional premium extras need a license key. `flisk up` never needs a key. | [FEATURES.md#license-matrix](../FEATURES.md#license-matrix) |
| Funding | GitHub Sponsors is enabled. Other funding (investment, revenue, grants) is **Not stated**. | [FUNDING.yml](../../.github/FUNDING.yml) |
| If the project stops | The core is MIT and runs without any Flisk server. `flisk export compose` writes a standalone `docker-compose.yml` from the `service.json` files; [leaving-flisk.md](../leaving-flisk.md) lists what is left in a repository without Flisk and what is not. | [leaving-flisk.md](../leaving-flisk.md), [ACCESS-CONTINUITY.md](../ACCESS-CONTINUITY.md) |

## Security

| Question | Answer | Evidence |
| --- | --- | --- |
| Vulnerability reporting | Private reports through GitHub security advisories, with acknowledgement in 3 business days, a fix target of 30 days and disclosure at 90 days at the latest. | [SECURITY.md](../../.github/SECURITY.md) |
| Track record | Two advisories published so far (GHSA-phgf-pww4-7jxc, medium; GHSA-3hj3-f39v-j2x5, low), both fixed and disclosed. | [Security advisories](https://github.com/flisk-sh/flisk/security/advisories) |
| Threat model | Written, with each countermeasure linked to code or tests and each unchecked item marked **Not audited**. | [assurance-case.md](../assurance-case.md), [security.md](../security.md) |
| Independent security review | **None yet.** No third-party audit or penetration test has been commissioned. A ready scope for one is in [security-review-brief.md](../security-review-brief.md). | [assurance-case.md](../assurance-case.md) |
| Automated scanning | CodeQL, Trivy, OSV-Scanner, Semgrep, zizmor (workflows) and Dependabot on every change and nightly. | [.github/workflows](../../.github/workflows) |
| OpenSSF Scorecard | 8.3 / 10 on 2026-11-10. | [Scorecard](https://scorecard.dev/viewer/?uri=github.com/flisk-sh/flisk) |
| OpenSSF Best Practices | Self-assessment answers are kept in the repository. | [bestpractices.json](../../.github/bestpractices.json) |
| Release integrity | Every release has SHA-256 checksums signed with Sigstore (keyless, tied to the release workflow), SLSA build provenance, and npm provenance. | [releasing.md](../releasing.md), `cosign verify-blob` command in each release's notes |

## Is anyone using it?

| Question | Answer | Evidence |
| --- | --- | --- |
| Age | First commit 2026-04-21; public repository since 2026-09-19. Young project. | `git log --reverse` |
| Releases | 271 releases on [flisk-sh/releases](https://github.com/flisk-sh/releases/releases); about one a day. | `gh release list -R flisk-sh/releases` |
| npm downloads | 35,048 in the 30 days to 2026-11-13. Downloads include CI runs and are not a count of users. | [npm API](https://api.npmjs.org/downloads/point/last-month/@flisk-sh/flisk) |
| Named adopters | Only teams that can show public evidence are listed; the list is short. Benchmark fixtures are excluded by rule. | [ADOPTERS.md](ADOPTERS.md) |
| Customer references | **Not stated.** No paying-customer references are published. | |

## What we would ask you to verify

The same list a careful reviewer would want: founder and maintainer identities (GitHub profiles above), the legal entity behind "Flisk Landscape", who owns the premium code, and references from adopters. Questions about anything on this page go to [GitHub Discussions](https://github.com/flisk-sh/flisk/discussions) or, if private, to a security advisory.

## Keeping this page honest

Update a row when its evidence changes. Replace a **Not stated** only with a link to evidence, never with a description.
