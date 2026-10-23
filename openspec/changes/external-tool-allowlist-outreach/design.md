# Design: External tool-allowlist outreach

## Context

Flisk CLI (`flisk up`, `service.json`, Docker + Tilt) is local-only orchestration. Core is MIT. Binaries and `checksums.txt` ship from `flisk-sh/releases`. Companies often allow or ban tools like MongoDB by policy. Those policies are usually private. The public surface is awesome lists, CLI indexes, internal-tooling docs that happen to be open, and security baselines that accept suggestions.

Opening issues in unrelated product repos, or asking employees to change a private denylist, will be treated as spam and can get the org blocked.

## Goals / Non-Goals

**Goals:**
- A reviewable packet and issue template.
- A target list with an explicit reason each repo qualifies.
- Human send, machine-checkable drafts.

**Non-Goals:**
- Mass-filing issues.
- Scraping employee contacts.
- Claiming "verified by <company>".
- Changing company denylists for databases or other vendors.
- A `flisk` command that posts to GitHub.

## Decisions

### 1. Packet lives in-repo, sends stay manual

Put `docs/outreach/tool-allowlist-packet.md` and `docs/outreach/targets.yaml` in flisk. A maintainer copies the template into a GitHub issue. Rationale: disclosure and tone need a human; automation is how this becomes spam.

### 2. Qualify a target before drafting

A row in `targets.yaml` needs `url`, `list_path` (file that already lists tools), `why`, and `channel` (`issue` or `pr`). Missing `list_path` means the row is invalid.

### 3. Issue template is fixed

Sections: who we are, what Flisk CLI does and does not do, why this repo (quote their list), how to verify (MIT, checksums, Docker/Tilt), the ask ("add, reject, or ignore"), and a link to this packet. No urgency, no "your users need this".

### 4. Acceptance is a link, not a badge

If accepted, add the outbound link under a "Listed by" note in awesome-tdk-framework. Do not add a badge until the target's page is live.

## Risks / Trade-offs

- Maintainer annoyance → hard cap, one issue per repo, no bumps after decline.
- Over-claiming security → packet review rejects unaudited claims.
- Wrong repo (private policy) → `list_path` must be a public file.
- Name collision with the Turkish-dictionary `tdk-cli` on PyPI → packet uses `@flisk-sh/flisk` and the landscape org, not the bare name alone.

## Migration Plan

Docs-only. No runtime migration. First five targets are chosen by hand and reviewed in a PR before any issue is sent.

## Open Questions

- Should the packet live in `flisk` or `awesome-tdk-framework`?
- Do we want a short "supply-chain notes" page (install script, checksums, engine tarball) linked from every issue?
