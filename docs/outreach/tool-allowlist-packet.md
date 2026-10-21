# Flisk CLI evaluation packet

For maintainers of public projects that publish a tool catalog, recommended-CLI list, or allowlist. This asks you to **evaluate** Flisk CLI. It does not claim that Flisk CLI is verified, approved, or recommended by you or by anyone else.

## Identity

- Project: Flisk CLI, canonical repo [`flisk-sh/flisk`](https://github.com/flisk-sh/flisk)
- npm package: `flisk` (not the unrelated Turkish-dictionary `tdk-cli` on PyPI)
- License: MIT for core (see `LICENSE`). Premium extras use a separate key; `flisk up` needs no key.
- Sender: always a Flisk maintainer, stated as such in every issue or PR.

## What it is

Local development orchestration: `flisk up` reads `service.json` files, writes the configuration Tilt uses, and runs the services as local Docker containers.

## What it is not

- Not a production deploy tool. Production stays with Helm, Argo CD, or Kustomize.
- Not an application framework.

## Install options

| Method | Command | Needs |
| --- | --- | --- |
| npm | `npm install -g @flisk-sh/flisk` | Node.js 22.12+ |
| Prebuilt binary | `curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh \| sh` | no Node or Bun |

The legacy `install.sh` in this repo only hands off to the official installer.

## Verifying the binary

Release assets and `checksums.txt` are published in [`flisk-sh/tdk-cli-releases`](https://github.com/flisk-sh/tdk-cli-releases/releases). The official installer downloads `checksums.txt`, computes SHA-256 of the binary and engine tarball, and aborts on mismatch (`flisk.sh/install.sh`, functions `sha256_of` and the verify step). Caveat: older releases list only binaries in `checksums.txt`, so the engine is skipped there and the installer prints a note.

To check by hand: download the asset and `checksums.txt` from the same release and compare `sha256sum <asset>` against the matching line.

## Runtime dependencies

- Docker (Desktop, OrbStack, or Colima; Engine 25+, Compose 2.20+)
- [Tilt](https://docs.tilt.dev/install.html)
- Bun 1.2+ for the default generated services

`flisk doctor` reports local readiness.

## Platforms

macOS, Linux, and Windows through WSL2 Ubuntu. Native Windows supports inspection only (`flisk --version`, `flisk doctor`, `flisk up --dry-run`).

## Non-claims

No security audit, SOC2 report, or certification exists. No "no network calls" claim is made. Do not add one to a draft unless a documented command demonstrates it and it is linked here.

## targets.yaml schema

`docs/outreach/targets.yaml` holds candidate targets. Each row:

| Field | Required | Meaning |
| --- | --- | --- |
| `url` | yes | Public repository URL |
| `list_path` | yes | Path of the public file that already lists tools. A row without it is invalid. |
| `why` | yes | Why this list fits; quote the relevant line |
| `channel` | yes | `issue` or `pr`, whichever the contributing guide allows |
| `notes` | no | Eligibility criteria from the contributing guide, blockers, and the date they were checked |

A row must not point at a private repo or ask anyone to disclose internal policy.

## Records and statuses

One file per request in `docs/outreach/records/<owner>-<repo>.yaml`. Fields: `target`, `rationale`, `url` (issue or PR), `sent`, `status`, `reason` (for declines).

| Status | Meaning |
| --- | --- |
| `draft` | Written, not sent |
| `open` | A human filed it; `url` is set |
| `accepted` | Target merged a list entry or closed as accepted; link the merged change |
| `declined` | Target declined; store the reason; no follow-up; no new request for 90 days |
| `no-response` | No maintainer reply after 30 days; at most one bump |

## Review checklist (for the PR that adds or changes a record)

- [ ] `list_path` is a public file that already lists tools
- [ ] The contributing guide allows this kind of issue or PR
- [ ] The draft says the author maintains Flisk CLI and names the repo and MIT license
- [ ] No verified, approved, recommended, audited, or certified claim without a linked target statement
- [ ] No other `open` record for the same repo, and no `declined` within 90 days
- [ ] A human, not a script, will file it
