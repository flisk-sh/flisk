---
name: flisk-scan-convert
description: Scan GitHub (a search, an org, or one repo) for projects that Flisk would help and that are active enough to merge a PR this week, rank them, and convert the best ones to Flisk with measured before/after evidence. Works for any kind of repo (web stacks, microservices, ML/MLOps, agent stacks). Use when asked to "find repos to migrate to Flisk", "scan for MLOps repos", "find a repo where our PR gets merged", or "convert this repo and show it is faster".
license: MIT
compatibility: Requires gh (authenticated), jq, and the flisk CLI. Docker and Tilt for the container paths.
metadata:
  author: flisk-sh
  version: "2.0"
---

# Scan, rank and convert

Find repos where a Flisk PR is useful and will be merged soon, then convert one. Only repos with 500 stars or fewer: never open a PR, or prepare one for opening, against a bigger repo. Conversion itself follows flisk-convert; this skill adds the search, the ranking and the evidence.

## 1. Scan

The script is `.claude/skills/flisk-scan-convert/scripts/scan-repos.sh`; run it from the repository root (written `scripts/scan-repos.sh` below). It needs `gh` (logged in) and `jq`, and it only reads.

Two ways in, and run both:
- `scripts/scan-repos.sh "<repo search>" [limit]`, for example `"docker-compose postgres redis in:readme"` or `"pgvector docker-compose in:readme"`. Avoid bare `OR` across terms: GitHub applies it to the whole query, so you get 15k results.
- `scripts/scan-repos.sh "issues:<terms>" [limit]` starts from repos with **fresh `good first issue`/`help wanted` issues** (last 30 days), which means maintainers who invite outside help. This mode finds far more merge-ready repos than keyword search, where most hits are solo repos.

Tested queries for each type of repo are in the sub-issues of epic flisk-sh/flisk#3164 (#3165 to #3176). Only repos pushed in the last 14 days with 10 to 500 stars come back. flisk-sh repos are skipped.

Each JSON line has:
- activity: `merged60`, `authors60` (distinct human authors), `outsiderMerged60`, `outsiderAuthors60` (distinct non-member authors with a merged PR), `outsiderClosedUnmerged`, and `medHoursOutsider`;
- setup pain: `setupPainIssues`, the open issues from the last 120 days about setup, install, Docker or local dev;
- fit: `compose`, `dockerfiles`, `procfile`, `hasFlisk`;
- policy: `contributing` (the file path) and `policy` (`ai-policy`, `cla`, from CONTRIBUTING or CLA files);
- `discussions`, `license`, `farm`, `farmLabels`, and a `score`.

## 2. Filter and rank

The score adds points for distinct outside contributors (the strongest signal), active authors, setup-pain issues, things to orchestrate, outsiders merged in under 72 h, and Discussions. It takes points off for an AI-contribution policy, a CLA, solo repos and existing Flisk.

`score: -99` with `farm: true` marks a **contribution or bounty farm**: Hacktoberfest/GSSoC/bounty/wave labels, a repo name like "open-source-contribution", or more outside authors than stars. Those repos merge anything, so a merge says nothing. Never target them.

Shortlist scores of **10 or more**, then check by hand. Keep a repo only if all of these hold:
- **500 stars or fewer. This is a hard cap, checked first, and no good merge record overrides it.** A maintainer blocked us after a PR to a large org (2026-11-02). The script drops bigger repos. Re-check with `gh repo view OWNER/REPO --json stargazerCount` for any repo you were pointed at by hand.
- at least 2 distinct outsiders merged in 60 days, by real people (open their profiles), not one prolific contributor;
- 2 or more things started together, and local setup is genuinely painful (more than about 4 commands, or open setup issues);
- their CONTRIBUTING and AI policy allow it, and there is no CLA a bot or lawyer must clear;
- small enough to convert in one PR.

Rank by distinct outsiders, then setup pain, then fewer stars.

## 3. Convert one

Fork it, clone the fork into a fresh directory (never into the Flisk checkout), branch, and follow flisk-convert. Keep the existing compose file and README flow; Flisk only adds `service.json` files and docs.

## 4. Measure before and after

Same machine, same commands, three runs each, report the median and say what was measured:
- cold start: from clean checkout (no images, no volumes) to every URL answering;
- warm restart: down, then up;
- edit to reload: change one source line, time until the running service shows it.
Save the raw output in the PR body. If a number cannot be measured, say so; never estimate.

## 5. Prove it works, like tubehaus#42

Timing alone is not enough. Follow flisk-convert step 5; the reference is the self-review on [biolend83/tubehaus#42](https://github.com/biolend83/tubehaus/pull/42#issuecomment-6556357152) (merged). In short:
- a real `flisk up` on the released Flisk the docs name, with a fresh project name or volumes (an old test's data can fake a result), run from under `$HOME` on Colima;
- 5-10 screenshots: the app doing a real action, `flisk up` output, Tilt all green, the changed service's logs, the config traced `.env` → `service.json` → generated Compose → `docker inspect`, and an outside reachability check (loopback vs the LAN address);
- the raw text of each log under its screenshot, private values masked;
- a self-review comment: what was checked, fixed after review, behaviour changes, Flisk-side issues (linked), and what was not verified;
- Flisk as an option next to their Compose file, the same Docker volume names, and disclosure (Flisk maintainer, AI assistant).
Every gap found on the way is a Flisk bug: fix it in Flisk, then re-run.

## Guardrails

Read the trust rules and the "What maintainers told us" table in epic flisk-sh/flisk#3164 before any contact. In short:
- **Scanning is read-only.** Open no issues, PRs or comments, and push nothing, until the user confirms the specific repo and text.
- **Ask first**, with one short, human issue or Discussion. Offer the least they would have to commit to: a docs listing, then a setup hosted in our repo, then a PR only if they ask.
- **Disclose** that you work on Flisk and that AI helped. Lychee declined partly because heavy AI use and a young, churning project "raise eye-brows". Pin a Flisk release that has been out for at least 7 days.
- **Never add anything that points at our domains or services** (workflows, uploads, badges, telemetry). charset_normalizer called that "an attempt for something terrible", and Parcels blocked us.
- **No default passwords or keys** in our files, their `.env` wins, and add a CI check (the haben#188 lessons).
- At most 2 new repos a week. A no or 7 days of silence is final: thank them once, stop, and record their words in the epic.
- Do not claim speedups without the measured evidence above.
