# Proposal

## Why

CNCF sandbox is the only realistic foundation door, and the current repo fails the checks that close an application before a TOC vote: no MAINTAINERS file with employer affiliations, no documented maintainer lifecycle, and premium behavior that downloads code only with TDK_LICENSE_KEY. flisk is a local Docker/Tilt generator, not an orchestrator. This change records that scope and adds the in-repo evidence. It does not add employers, and it does not file a CNCF application.

## What Changes

- Add MAINTAINERS.md with name, GitHub id, and employer. One employer is recorded as-is. The file must not invent a second organization.
- Add GOVERNANCE.md for how a maintainer is added, how decisions are made, and that two employers are required before any foundation application.
- Add ADOPTERS.md. The 100-service /health fixture is not an adopter. An adopter is a team running flisk up on their own repo.
- Split the license boundary in-repo: MIT core versus key-downloaded implementations. Foundation scope is the MIT tree only.
- Add a DCO check on pull requests.
- Add `flisk maintainers check`, which fails if MAINTAINERS.md is missing the required columns or lists fewer than two employers. The command is a gate, not a claim of eligibility.

## Capabilities

### New Capabilities

- `project-governance`: Maintainer file, governance, and adopter evidence checked in the repo.
- `license-boundary`: MIT core versus key-downloaded code, and what a foundation donation would include.
- `maintainers-check`: CLI check that the maintainer file meets the published column and diversity rule.

### Modified Capabilities

## Impact

- New docs at repo root: MAINTAINERS.md, GOVERNANCE.md, ADOPTERS.md, DCO.
- docs/FEATURES.md and README.md link the license boundary. No feature moves between free and premium.
- cli: `flisk maintainers check`.
- .github: DCO workflow.
- Out of scope: CNCF issue, relicensing MIT to Apache-2.0, opening premium source, adding fake maintainers.
