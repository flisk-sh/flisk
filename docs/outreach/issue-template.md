# Issue template

Title: `Evaluate Flisk CLI for <list name>?`

```markdown
**Disclosure:** I maintain Flisk CLI ([flisk-sh/tdk-cli-core](https://github.com/flisk-sh/tdk-cli-core), MIT).

## What it does
Flisk CLI runs a set of local services as Docker containers through Tilt, driven by `service.json` files (`flisk up`). It is local development orchestration, not a production deploy tool.

## Why this repo
Your <list name> (`<list_path>`) lists <quote the line or category that fits>.

## How to verify
- License: MIT
- Install: `npm install -g flisk` or the prebuilt binary installer
- Checksums: `checksums.txt` is published with each release in flisk-sh/tdk-cli-releases; the installer verifies SHA-256
- Needs Docker and Tilt; macOS, Linux, Windows via WSL2
- No audit or certification exists

Full facts: <link to docs/outreach/tool-allowlist-packet.md>

## The ask
Please consider whether Flisk CLI fits <list name>. Add, reject, or ignore are all fine; I won't follow up after a decline.
```

No urgency, no "your users need this", no endorsement claims.
