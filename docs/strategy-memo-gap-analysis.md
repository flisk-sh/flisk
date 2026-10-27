# Strategy memo gap analysis

Scope: every recommendation in the pasted "highest-impact improvements" memo, checked against `cli/src`, `cli/AGENTS.md`, command wiring, tests, and the MCP tool list. Marketing copy and `docs/` were not treated as evidence of shipped behavior. No source, test, or public doc was changed.

Status key: **Shipped**, **Partial**, **Not shipped**, **Not recommended / low value**.

## Summary

| # | Recommendation | Status | Priority | Size |
|---|---|---|---|---|
| 1a | `flisk doctor --fix` (broad remediation) | Partial | P1 | M |
| 1b | One-command demo with success screen | Partial | P1 | M |
| 2 | Lead with agent workflow (site/copy) | Not shipped | P2 | S |
| 3 | Real-world benchmark beyond `/health` fixture | Not shipped | P1 | L |
| 4a | Generated-file ownership model (regenerated / owned / extension points) | Partial | P0 | M |
| 4b | `flisk config verify` | Shipped | — | — |
| 4c | `flisk config diff` | Not shipped | P0 | M |
| 4d | `flisk config explain <file>` | Not shipped | P0 | S |
| 5 | Escape-hatch documentation | Partial | P2 | S |
| 6 | Selective startup promoted (`flisk up <stack>`) | Shipped (promotion not verified) | P2 | S |
| 6b | `flisk up --affected` | Not shipped | P2 | L |
| 7a | `flisk agent context` | Not shipped | P0 | M |
| 7b | `flisk agent verify` | Not shipped | P1 | M |
| 7c | `flisk agent test` | Not shipped | P2 | L |
| 7d | Agent docs for Claude Code / Codex / Cursor / Goose | Not shipped | P2 | S |
| 8 | Case studies / comparison pages | Not shipped (outside the code) | P2 | S |
| 9 | Positioning one-liner | Not recommended in code; copy decision | P2 | S |
| 10 | "Bring your repo" challenge | Not recommended / low value for code | — | — |
| 11 | Don't become a deploy tool | Already the stated boundary | — | — |

## Item details

### 1a. `flisk doctor --fix`: Partial

- **Current state:** `flisk doctor --fix` exists. It repairs only this project's unused Docker networks and leftover doctor probes. `--dry-run` and `-y/--yes` are supported.
- **Evidence:** `cli/src/commands/doctor.ts:1533-1541` (option definitions, help text "Repair this project's unused Docker networks and leftover doctor probes"); `cli/src/utils/doctor-fix.ts` (the `prune(kind: "builder" | "images")` surface and the repair plan); `cli/src/utils/__tests__/doctor-fix.test.ts`.
- **Gap:** The memo asks for detection and remediation of missing Docker, missing Tilt, Node version, port conflicts, daemon state, and memory. Doctor reports some of these, but `--fix` does not remediate any of them. No `--fix` path covers installation, port reassignment, or memory.
- **User-visible benefit:** Fewer dead ends on first run; copy-paste fixes for the failures people hit most.
- **Size:** M. Start with exact instructions (no auto-install) for missing binaries, then add safe automatic fixes.
- **Priority:** P1.

### 1b. One-command demo: Partial

- **Current state:** `npx @flisk-sh/flisk demo` is wired. It has a phased stage UI (`cli/src/utils/demo-stage.ts`), reuses a running demo, and fetches a template into a directory that gets a unique name on re-run.
- **Evidence:** `cli/src/cli.ts:30` (usage line), `cli/src/cli.ts:57-135` (fixed directory, reuse, stage labels "Fetching the demo" / "Reusing the demo", title "Flisk demo"); `cli/src/utils/demo-stage.ts`; `cli/src/commands/__tests__/demo-fixed-dir.test.ts`; `cli/src/commands/project.ts:273` (`--quiet`, "used by `flisk demo`").
- **Gap:** Not verified in this pass: whether the demo runs prerequisite checks before starting, waits for health, opens a browser, or prints credentials, logs, and stop commands. Those items need a read of the demo flow end to end, which this pass did not complete. Treat the memo's "requires you to run `flisk doctor` first" claim as unverified.
- **User-visible benefit:** A single command that ends with a working, obvious result.
- **Size:** M.
- **Priority:** P1.

### 2. Lead with the agent workflow: Not shipped (copy)

- **Current state:** Agent features are thin in code (see 7a-7c), so the agent story has little to lead with yet.
- **Evidence:** No agent context or verify commands exist; the agent surface is `flisk agent sessions` and two MCP tools (see 7a).
- **Gap:** Copy change depends on 7a shipping. Writing it earlier overpromises.
- **Size:** S. **Priority:** P2.

### 3. Real-world benchmark: Not shipped

- **Current state:** Benchmark scripts exist (`scripts/benchmark/cli-startup.mjs`, noted in `.claude/memory/MEMORY.md`), and `docs/benchmarks/` exists. These measure CLI startup and fixture scale, not real stacks with real databases, queues, and auth.
- **Gap:** No real-application benchmark was found in code or tests.
- **Size:** L (needs representative fixture apps). **Priority:** P1.

### 4a. Generated-file ownership model: Partial

- **Current state:** Ownership is encoded in code, but not presented to users as three categories.
  - The allowlist of Flisk-written paths is in `cli/src/utils/generated-paths.ts` (`FLISK_GENERATED_PATH_ALLOWLIST`, `isFliskGeneratedPath`, `assertFliskGeneratedPath`). It refuses writes outside the allowlist and refuses writes through symlinks.
  - Generated files carry a `SYSTEM-GENERATED - DO NOT EDIT` header (`cli/src/generator/template-engine.ts:307`).
  - Edits to generated outputs are detected by `driftReport` in `cli/src/commands/up.ts:139-190`, which blocks `flisk up` unless `--ignore-drift` is passed.
  - `flisk eject` exists (`cli/src/commands/eject.ts`, documented in `docs/leaving-flisk.md`).
- **Gap:** There is no user-facing "owned" or "extension point" category, no per-file ownership listing, and no way to see the model before generation. Drift is reported after the fact, inside `flisk up`.
- **User-visible benefit:** Users know what they may edit before they break a file.
- **Size:** M. **Priority:** P0.

### 4b. `flisk config verify`: Shipped

- **Current state:** Checks that generated files match `.flisk/project.json`. Subcommand is registered in `cli/src/commands/config.ts:239-241`.
- **Evidence:** `cli/src/commands/config.ts` (verify, shared-platform Postgres check via `checkPrismaConsistency` at line 257); tests `cli/src/commands/__tests__/config.test.ts`, `config-json.test.ts`, `config-boundaries.test.ts`, `flag-contract.test.ts:110,263`.
- **Gap:** None for the memo's stated need. Keep the boundary with `flisk doctor`, as `AGENTS.md` requires.
- **Priority:** —.

### 4c. `flisk config diff`: Not shipped

- **Current state:** `config` subcommands are `regenerate`, `migrate`, `verify`, `edit`, `enable`, `disable` (`cli/src/commands/config.ts:38-474`). No `diff`.
- **Evidence:** the same file; grep for `config diff` across `cli/src` and `docs/` finds nothing.
- **Gap:** The drift comparison in `driftReport` (`cli/src/commands/up.ts:141`) already compares generated output against inputs. A `diff` command could reuse that logic and print the differences instead of only blocking.
- **Size:** M. **Priority:** P0.

### 4d. `flisk config explain <file>`: Not shipped

- **Current state:** No `explain` subcommand. The allowlist in 4a already knows, for any path, whether Flisk writes it.
- **Evidence:** `cli/src/commands/config.ts`; `cli/src/utils/generated-paths.ts`.
- **Gap:** Command missing. The data needed for the answer (regenerated or not, which input produces it) is partly present.
- **Size:** S. **Priority:** P0.

### 5. Escape-hatch documentation: Partial

- **Current state:** `docs/leaving-flisk.md`, `docs/byo.md`, `docs/byo-nestjs-spec.md`, and `docs/adopt-flisk.md` exist. `docs/TOPOLOGY.md` covers ownership in passing.
- **Gap:** Not checked in this pass whether each memo question (existing Compose, custom Dockerfile, existing Tiltfile, monorepo) has its own answer. Treat as partial until read.
- **Size:** S. **Priority:** P2.

### 6. Selective startup as the default story: Shipped (promotion not verified)

- **Current state:** `flisk up [stack-name]` takes an optional stack; `--dry-run`, `--ignore-drift`, `--force` exist (`cli/src/commands/up.ts:289-308`). Tests in `cli/src/commands/__tests__/up.test.ts`.
- **Gap:** Feature exists. Whether it is promoted early in docs is a copy question and was not checked.
- **Priority:** P2.

### 6b. `flisk up --affected`: Not shipped

- **Current state:** No `--affected` option. No git-diff logic in `up.ts`. The only git-adjacent code in the template engine is unrelated to change detection.
- **Evidence:** `cli/src/commands/up.ts` options; grep for `affected` and `git diff` in `cli/src` returns no relevant hits.
- **Gap:** Entire feature. It needs a mapping from changed files to resources, which discovery may already partially provide (`createDiscoveryContext`).
- **Size:** L. **Priority:** P2.

### 7a. `flisk agent context`: Not shipped

- **Current state:** `flisk agent` has one subcommand: `sessions <resource>` (`cli/src/commands/agent.ts:63`). The MCP server exposes `list_agents` and `get_agent_sessions` (`cli/src/mcp/tools.ts:365,378`; since renamed `agent_list` and `agent_sessions`, with the old names still accepted). No context emitter.
- **Evidence:** `cli/src/commands/agent.ts`; `cli/src/commands/__tests__/agent-sessions.test.ts`, `resource-agent.test.ts`; `cli/src/mcp/tools.ts`.
- **Gap:** The data is mostly already computed. `agent.ts` imports `buildServicePorts`, `getHostPortPlan`, and `createDiscoveryContext`. A compact topology file (services, ports, dependencies, health URLs) could be built from those.
- **User-visible benefit:** Coding agents get a constrained, accurate description of the local stack. This is the memo's main wedge.
- **Size:** M. **Priority:** P0.

### 7b. `flisk agent verify`: Not shipped

- **Current state:** No command. `config verify` checks generated files, not agent changes against a service contract.
- **Gap:** Needs a definition of the "service contract" (ports, routes, health, generated-file rules). Most of those checks exist in pieces (`config verify`, `doctor` service checks).
- **Size:** M. **Priority:** P1.

### 7c. `flisk agent test`: Not shipped

- **Current state:** No command. No targeted Playwright/API runner in the CLI.
- **Gap:** Depends on 6b (affected slice) and 7a (contract). Also needs test harness integration.
- **Size:** L. **Priority:** P2.

### 7d. Agent docs for Claude Code / Codex / Cursor / Goose: Not shipped

- **Current state:** `docs/agents/` exists (per `AGENTS.md`, agent contracts live there). Specific per-tool guides were not found in this pass.
- **Gap:** Per-tool guides. Better after 7a.
- **Size:** S. **Priority:** P2.

### 8. Case studies and comparison pages: Not shipped (outside code)

- **Current state:** Not checked in code. Adopter and comparison content lives in `docs/` and marketing folders; not verified.
- **Size:** S. **Priority:** P2.

### 9. Positioning one-liner: Copy decision

- Not a code item. Changing homepage copy is a product decision; this analysis does not recommend a specific line.

### 10. "Bring your repo" challenge: Not recommended as a code item

- Process/marketing, not product code.

### 11. Don't become a deployment tool: Already the stated boundary

- `AGENTS.md` says "Local-only by default" and "Do not add Deployment or cluster manifest generators without an agreed export scope." No Kubernetes generator was found in `cli/src`.

## Coverage notes

- **doctor / demo / config verify:** all three are wired and tested (see 1a, 1b, 4b). Doctor and `config verify` keep the boundary `AGENTS.md` requires.
- **Not verified in this pass:** the full demo flow end to end; `docs/` claims; `runtime/` Starlark behavior; the `flisk agent sessions` runtime path beyond its test file.

## Recommended build order (next 3 changes)

1. **`flisk config explain <file>`** (S, P0). Smallest change. Reuses `isFliskGeneratedPath` and the generated-file header to say whether a file is regenerated, which input produces it, and whether editing it will trigger drift. Directly addresses the "generated-file anxiety" item. Needs tests in `cli/src/commands/__tests__/config.test.ts` style.
2. **`flisk config diff`** (M, P0). Reuses the comparison in `driftReport` (`cli/src/commands/up.ts:141`) and prints the differences instead of only blocking `flisk up`. Completes the ownership story with change 1.
3. **`flisk agent context`** (M, P0). Emits a compact topology (services, ports, dependencies, health URLs) built from existing discovery and port helpers, with a `--json` form. This is the memo's agent wedge, and it gives `agent verify` and `agent test` a contract to build on later.

Deferred until after these three: `flisk agent verify`, `flisk up --affected`, `flisk agent test`, `flisk doctor --fix` remediation beyond networks, and the real-world benchmark.

## Next steps (not done here)

- Confirm the full `flisk demo` path before any demo work (see 1b).
- Read `docs/` escape-hatch and agent docs before writing copy (see 5, 7d).
