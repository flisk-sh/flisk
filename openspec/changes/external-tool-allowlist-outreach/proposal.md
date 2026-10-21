# Proposal: External tool-allowlist outreach

## Why

Companies keep allowlists and denylists of internal and external tools. A private company can ban MongoDB, Helm, or a local orchestrator even when the tool is open source. Flisk CLI is easy to reject in that process because it is new, installs a binary plus an engine, and depends on Docker and Tilt.

Public repos already publish the artifacts those reviews use: awesome lists, recommended-CLI docs, developer-tool catalogs, security baselines, and "approved local tooling" issues. Flisk has no process for asking those maintainers to evaluate Flisk CLI, and no packet of facts a reviewer can check without reading the whole repo.

## What changes

- Add a maintained outreach packet: what Flisk CLI is, what it is not, license, install paths, checksums, runtime dependencies, and data-handling claims that are actually true.
- Add rules for which public repos may be asked, how the issue is written, and when an issue must not be opened.
- Track each request as a record (target, rationale, issue URL, status). Do not automate posting.
- Keep "please evaluate" separate from "verified" or "recommended". Flisk MUST NOT claim either status until the target project says so.

## Capabilities

### New Capabilities
- `external-tool-outreach`: Selection, disclosure, issue content, and status tracking for requests that a public project evaluate Flisk CLI for its tool catalog or allowlist.

### Modified Capabilities
- None.

## Impact

- Docs and a small data file in tdk-cli-core (or awesome-tdk-framework if the list should live next to curated links). No CLI runtime change.
- No installer, license, or telemetry change.
- Outreach is human-sent. A script may validate a draft; it MUST NOT open issues.
