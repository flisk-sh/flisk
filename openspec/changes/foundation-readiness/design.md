# Design

## Context

Sandbox applications are closed without review if the license is not already allowlisted, if MAINTAINERS.md lacks Name / GitHub id / Company columns, or if there are not 3 maintainers from 2 employers. Employer means company, not GitHub org membership. Incubation later wants independent production adopters. Premium features in this repo are stubs until TDK_LICENSE_KEY downloads an implementation.

## Goals / Non-Goals

- Goals: make the gap visible in the repo; define donation scope as the MIT tree; reject the health fixture as adoption evidence.
- Non-Goals: becoming CNCF-eligible in this change; recruiting maintainers; removing premium.

## Decisions

- Keep MIT. It is an allowlisted license. Do not relicense in this change.
- MAINTAINERS.md lists only people who can merge. Company is required. "Independent" is allowed when there is no employer.
- `flisk maintainers check` exits 0 only when the table has 3 people and 2 companies. Until then it exits 1 and prints the missing count. CI does not fail the build on this exit code. A foundation-apply workflow, not present in this change, would.
- ADOPTERS.md rows require org, link to their repo or a public write-up, and the Flisk version. Fixture benchmarks are forbidden in that file.
- Key-downloaded code stays out of foundation scope. GOVERNANCE.md says a donation would exclude those paths until they are in-tree under MIT.

## Risks / Trade-offs

- A failing check can be misread as a promise to apply. The command output must say "not eligible" when the count is short.
- Naming one maintainer is accurate and looks small. That is the point.

## Migration Plan

Docs and the check are additive. No generated local config changes.

## Open Questions

- Whether premium implementations move in-tree later. Not decided here.
