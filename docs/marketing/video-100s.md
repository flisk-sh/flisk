# 100-second video script

Script only. Nothing here is recorded yet. Tracked in #1445, part of #1448.

**Stack shown on screen:** `examples/one-backend`. It is one authored `service.json` (`appName: api-backend`, `stack: one-backend`, port 4000) and one Hono service. The URL and stack names below come from that example, not from a hypothetical `shop` stack. The example has no hand-written YAML, so the pain beat (beat 2) cannot be shown on it alone. See "Open items" at the end.

## Commands checked

Checked against `bun src/cli.ts <cmd> --help` in `cli/` at `origin/main` (CLI 1.3.183), `cli/README.md`, and `examples/one-backend/README.md`.

| Command on screen | Exact form and flags | Source |
|---|---|---|
| `tdk project --yes` | `tdk project [template]`, `--yes` | example README, `tdk project --help` |
| `tdk up one-backend` | `tdk up\|deploy [options] [stack-name]`; the stack is a positional argument. Drift gate applies unless `--ignore-drift` | `tdk up --help` |
| `tdk up one-backend --dry-run` | `--dry-run`: shows what would start without starting | `tdk up --help` |
| `curl --fail http://api.one-backend.localhost/api/api-backend/health` | Route from the example README; expected body `{"status":"ok"}` | example README |
| `tdk config verify` | `tdk config verify [--json]`. Exits 1 when the check fails (`--json` returns the same result as an envelope) | `tdk config verify --help`, `cli/src/commands/config.ts` |
| `tdk config regenerate` | `tdk config regenerate [--dry-run]`; regenerates the 4 master config files from `.tdk/project.json` | `tdk config regenerate --help` |
| `tdk up one-backend` (after a hand edit) | Exits with code 2 (`DRIFT_EXIT_CODE`), names the edited files, and suggests `tdk config regenerate` or `--ignore-drift` | `cli/src/commands/up.ts` (`enforceDriftGate`) |
| `tdk ui` | `tdk ui\|interactive [--no-animations] [--high-contrast]`. Interactive terminal UI | `tdk ui --help` |
| `tdk mcp` | Runs a Model Context Protocol server over stdio for coding agents | `tdk --help`, `cli/README.md` |
| `tdk down` | Stops all Tilt resources; `--dry-run` shows what would stop | `tdk down --help` |
| `npm install -g @tdk-landscape/tdk-cli-core` | Install line from the root `README.md` | `README.md:122` |

The `tdk` on the default PATH may be an older release than `origin/main`. Re-check the table with the release you record with.

## Script

### 0:00 to 0:10. Hook

> "Your local stack is six files, and they drift apart."

- On screen: `docker-compose.yml`, `nginx.conf`, `Tiltfile`. Mark one port that disagrees between two of them.
- Command: none.
- Claim check: "six files" is a claim about a hand-written stack, not about `examples/one-backend`. Count the real files in the demo project before recording, or say "a few files".

### 0:10 to 0:25. Pain

> "Change one port in one file, and the stack routes to the wrong place."

- On screen: edit one port by hand, run `tdk up` on the drifted project, show the real failure or the wrong route. Real output only.
- Command: `tdk up <stack>`.
- Open item: this needs a hand-written fixture, which the one-backend example does not provide. Record it from a separate project and say so on screen.

### 0:25 to 0:55. Fix

> "Each service gets one `service.json`. TDK generates the rest."

- On screen: `services/one-backend/api/service.json` (show `stack`, `port`, `healthCheckPath`).
- Commands, in order:
  1. `tdk project --yes`
  2. `tdk up one-backend`
  3. `curl --fail http://api.one-backend.localhost/api/api-backend/health`, expected `{"status":"ok"}`.
- Optional, only if it fits: `tdk up one-backend --dry-run` before the real run.
- Claim check: the README says Docker, Tilt, Bun 1.2+ and Node 22.12+ are needed. Say "needs Docker" on screen, not "no setup".

### 0:55 to 1:15. Proof

> "Hand-edit a generated file, and TDK stops the stack."

- On screen: edit a generated file under `.tdk/.tdk-out/`, then run `tdk config verify`. It reports the file as out of sync and exits 1.
- Then `tdk up one-backend`: exit code 2, names the edited file, and suggests `tdk config regenerate`.
- Then `tdk config regenerate` restores the file.
- Commands: `tdk config verify`, `tdk up one-backend`, `tdk config regenerate`.
- Do not show `--ignore-drift` in the main flow. It only appears as the second option in the drift message.

### 1:15 to 1:35. Bigger picture

> "Your agent can read the same stack."

- On screen: `tdk ui` on the running stack, then the line from the README that `tdk mcp` runs an MCP server over stdio for coding agents.
- Commands: `tdk ui`, `tdk mcp`.
- Claim check: `tdk ui` needs a running stack. Show the stack up first.

### 1:35 to 1:40. Call to action

> "`npm install -g @tdk-landscape/tdk-cli-core`. Link to the quickstart and to `examples/one-backend` in the description."

- On screen: the install line and the two links.
- Command: `npm install -g @tdk-landscape/tdk-cli-core`.

## Timing

The timestamps are a plan, not a measurement. The quickstart timing from #1443 can go on screen only once it is measured in `docs/benchmarks/`. Until then, do not show a time-to-running number.

## Open items

- The pain beat needs a hand-written fixture (`docker-compose.yml`, `nginx.conf`, `Tiltfile`) that is not in `examples/one-backend`. Recording it is out of scope for this PR.
- The "six files" hook needs a real count from the demo project.
- Recording, the description links, and the maintainer and external reviews listed in #1445 are not part of this document.
