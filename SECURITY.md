# Security Policy

## Supported versions

Security fixes go into the latest release published on [npm](https://www.npmjs.com/package/@flisk-sh/flisk). Please upgrade before reporting.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through [GitHub security advisories](https://github.com/flisk-sh/flisk/security/advisories/new). Include:

- the Flisk version (`flisk --version`) and your OS
- steps to reproduce
- what an attacker could do with it

## Dependency advisories are tracked in public

A published advisory about a **third-party dependency** (a vulnerable `vite`, `certifi` or similar in a lockfile) is not a vulnerability in Flisk, so those are tracked in the open. A workflow reads the Dependabot alerts and the osv-scanner code-scanning alerts and opens one issue per open alert, with the advisory detail and a set of labels, so a contributor can pick the fix up. The issue closes itself when the alert is fixed.

Those issues are about upstream packages, not about Flisk. A vulnerability **in Flisk itself** still belongs in a private report, not in a public issue.

## What happens next

We follow coordinated disclosure:

1. **Acknowledgement** within 3 business days of your report.
2. **Assessment**: we confirm whether it is a vulnerability and tell you our severity estimate within 10 days.
3. **Fix**: we aim to publish a fixed release within 30 days of confirming it. Critical issues are handled first. If a fix needs longer, we tell you why and agree a new date with you.
4. **Disclosure**: once a fixed version is on npm, we publish a GitHub security advisory (with a CVE where one applies) and credit you unless you prefer otherwise. Please keep the details private until then. If no fixed release is available 90 days after your report, we will publish the advisory anyway at day 90, with mitigations where we have them, unless you and we agree on a later date.

If you do not hear back within 5 business days, please send the report again through the same advisory form.

## Scope

In scope: the `flisk` CLI, the Tilt engine and generated local runtime files in this repository, and the published npm package `flisk`. Flisk is a local development tool; issues in third-party services it starts (Docker, Tilt, databases) should go to those projects.

## What Flisk sends and how secrets are handled

See [docs/security.md](docs/security.md).
