# CEO Review — `flisk demo` first-run experience

- **Date:** 2026-10-22
- **Target:** `npx @flisk-sh/flisk demo` (one-command flow in `cli/src/cli.ts:35-198`)
- **Mode:** SELECTIVE EXPANSION
- **Status:** DONE_WITH_CONCERNS (one unresolved honesty decision, see §12)
- **Reviewer constraint set (from user):** 2-minute zoomed terminal recording, non-scrolling fixed frame, **no new dependencies**, "solid like Vercel"

---

## 0. Evidence base (measured, not assumed)

| Fact | Value | Source |
| --- | --- | --- |
| Demo transcript length | ~60 lines | user paste + reproduced with published CLI |
| Informative lines | ~5 | same |
| Garbled lines (spinner interleaved with child stdout) | 5 | same |
| `flisk project --yes` alone | 26 lines | reproduced in temp clone with `@1.3.205` |
| Demo repo tracked size | 146 files / 2,753 lines | `tdk-restaurant-example` |
| After `flisk project --yes` | **492 files / 35,789 lines / 240 generated files** | `~/.flisk`-style probe |
| App services | **6** (2 frontend, 3 backend, 1 worker) across **4 stacks** | `service.json` scan |
| Platform services | `proxy` (Traefik), `database-management` (Postgres) | `.tdk/project.json` |
| Frontend URL shape | `http://app.flisk-demo.localhost/<name>` | `service-urls.ts:49,82` |
| Ink availability | bundled in `dist-bundle` for npm; **not** used by this flow | `bin/tdk.js:31-35` |
| `npx` bare spec | **stale forever** — `1.3.204` while `@latest` = `1.3.205` | measured twice |
| Tests asserting demo output | **0** | `cli/src/utils/__tests__/one-command.test.ts` |

### Noise inventory (each line traced to source)

| Output | Source | Verdict |
| --- | --- | --- |
| `The folder X is taken, using X-9 instead.` | `cli.ts:61` | Reads as an error. Fixed in source by `#1820` (`fixedDir`), but not reaching cached users |
| `Flisk Cloning template: demo` + `Source:` + `Destination:` | `project.ts:151-156` | Keep `Destination`; drop the rest |
| ~15 lines of git progress | `project.ts:176` `stdio:"inherit"` | Cut |
| `Next steps: 1. cd 2. flisk doctor 3. flisk up` | `project.ts:190-193` | **Lie** — demo does all three at `cli.ts:118,168` |
| `Runtime readiness: …` × 2 | `project.ts:194` + `project.ts:357` | Duplicate; cut both in demo path |
| `Flisk Project Configuration`, `Project root:`, `✓ .tdk/project.json exists`, `📋 Regenerating…` | `project.ts:310-334` | Cut |
| `✓ Generated: …` × 7 | `template-engine.ts:612-633` | Cut — `quiet` option already exists, never used by `project` |
| `💡 To start Tilt: flisk up` | `template-engine.ts` | **Lie** in demo path |
| `✅ Project configuration regenerated!` + `Generated in …:` list | `project.ts:352-356` | Cut, and duplicates the `✓ Generated` list |
| Raw `npm install -g` output | `cli-command.ts:127` `stdio:"inherit"` | Cut; see §3 |

### Root cause of the garbled output

```
cli.ts:118  initializeProject()  →  stdio: ["inherit", "inherit", "pipe"]
                                          ↑
              child stdout → terminal directly
              spinner      → stderr with "\r\x1b[2K"
              ⇒ "⠸ Setting up the project...Flisk Project Configuration"
```

---

## 1. Architecture Review

### Proposed shape: the Stage (pure render + paint)

```
DemoState (plain data: phases[], counts, elapsed, status)
        │
        ▼
renderDemoFrame(state) → string[]      PURE. exactly FRAME_ROWS lines. no I/O.
        │
        ▼
paint(frame)                            ANSI: cursor-up N, clear-line, write
```

Rules that make this work:

1. **Pure renderer.** `renderDemoFrame` returns `string[]`. No `process.stdout`, no `Date.now()` inside. Time and counts are injected. This is what makes it (a) snapshot-testable without a TTY, (b) deterministic for video, (c) reusable by `--json`.
2. **Fixed row count.** Always `FRAME_ROWS` lines. `paint` moves up `FRAME_ROWS`, clears each line, rewrites. No `\x1b[2J` (flashes on camera), no scrolling.
3. **TTY gate.** `process.stderr.isTTY === true` → paint. Otherwise one plain line per phase (same discipline as `spinner.ts:16`).
4. **No new dependencies.** Raw ANSI. Ink *is* bundled (`bin/tdk.js:31`), but its async reconciler can flicker on camera and it is not used by this flow today. Do not introduce React into the startup path.

### Component boundaries

| File | Change |
| --- | --- |
| `cli/src/utils/demo-stage.ts` | **new** — `renderDemoFrame`, `paint`, `FRAME_ROWS` |
| `cli/src/utils/one-command.ts` | spawn children with `stdio:["ignore","pipe","pipe"]`; emit phase events |
| `cli/src/cli.ts` | replace 5 scattered `console.log` blocks with Stage calls |
| `cli/src/commands/project.ts` | add `--quiet`; pass it to `generateMasterConfigs`; stop printing next-steps in quiet mode |
| `cli/src/utils/cli-command.ts` | remove `stdio:"inherit"` from global install, or drop the call |
| `cli/src/generator/template-engine.ts` | no change — `quiet` already exists at `:612` |

### The structural inversion that kills the lie

`cloneProjectTemplate` currently **prints** its own next-steps block (`project.ts:190`). It must **return** data and let the caller decide. Until that inversion happens, any caller that continues the work (like the demo) will keep printing instructions it then executes.

### Dependency graph (current → target)

```
current:
  cli.ts ──▶ cloneProjectTemplate ──▶ prints next-steps ✗
         ──▶ ensureGlobalInstall  ──▶ prints npm output ✗
         ──▶ initializeProject    ──▶ child prints 26 lines ✗ + garbles spinner
         ──▶ runStackQuiet        ──▶ okay (already quiet via --json)

target:
  cli.ts ──▶ Stage ◀── phase events
         ├──▶ cloneProjectTemplate  (returns, silent)
         ├──▶ initializeProject     (captured, silent)
         ├──▶ installServiceDependencies (captured, silent)
         └──▶ runStackQuiet         (unchanged)
```

### Failure posture / rollback

Additive and behind the one-command path only. `flisk project` / `flisk up` output unchanged. Rollback = revert `cli.ts` + delete `demo-stage.ts`. No generated files, no schema, no migration.

### Production failure scenario worth naming

`paint()` writes to `process.stderr` while a child process may also write to stderr. If any child inherits stderr, the frame corrupts identically to today's bug. **Rule: no child spawned by the demo may inherit stdout or stderr.** All must be piped and routed through the Stage or a log file.

---

## 2. Error & Rescue Map

| Code path | Exception / failure | Rescued? | Rescue action | User sees |
| --- | --- | --- | --- | --- |
| `project.ts:176` git clone | non-zero exit | `catch {}` at `:180` — **hides git's actual error** | `showErrorAndExit` | generic "git clone failed" — no cause |
| `project.ts:176` git clone | git not installed (`ENOENT`) | same catch | same | same generic message |
| `cli.ts:118` `initializeProject` | child exit ≠ 0 | yes (`one-command.ts:73-81`) | last stderr line | one yellow line ✔ |
| `cli.ts:118` `initializeProject` | spawn `ENOENT` | yes (`:66`) | `{ok:false}` | one line ✔ |
| **`cli.ts:87`** | `binPath` falsy **or** `destination` missing | **no** | `process.exit(0)` at `:197` | **"Cloned ✅" then nothing. Exit 0.** ← silent failure |
| **`cli.ts:82-85`** `ensureGlobalInstall` | install fails (`EACCES`, offline, corporate registry) | **no** | only prints when `"installed"` | **nothing.** Machine left half-configured |
| `cli.ts:70` `rmSync` | `EACCES` / `EBUSY` | **no** | uncaught throw | raw Node stack trace on a *repeat* demo |
| `cli.ts:129` `installServiceDependencies` | `bun` missing | yes (`defaultRun` → code 1) | lists failed dirs | `run "bun install" there` ✔ |
| `cli.ts:168` `runStackQuiet` | stack never ready | yes | `outcome.error` | yellow line + `flisk up` hint ✔ |
| `cli.ts:168` `runStackQuiet` | child `close` before envelope | yes (`:135`) | "stopped before it was ready (code N)" | ✔ |
| `cli.ts:155` `readStackProgress` | returns `undefined` forever | **no** | spinner text never updates | **frame looks frozen; no heartbeat** |
| `cli.ts:183` `openFirstFrontend` | throw | yes (`.catch`) | yellow line | ✔ |
| `cli.ts:107` `findReadyFrontend` | throw | **no** | uncaught | stack trace |

Named errors to introduce: `GitCloneError`, `ProjectSetupError`, `DependencyInstallError`, `StackStartError`, `GlobalInstallError`, `DemoCleanupError`.

**Three changes are non-negotiable:** surface `ensureGlobalInstall` failure, make the `cli.ts:87` path fail loudly instead of exiting 0, and wrap `rmSync`.

---

## 3. Security & Threat Model

### S1 — Silent global install during a "just show me" command (high)

`cli-command.ts:115-132` runs `npm install -g @flisk-sh/flisk` with `stdio:"inherit"`, triggered by `cli.ts:82` on every demo run where `flisk` is not on PATH — i.e. **every genuine first-timer**. Consequences:

- Mutates the user's global machine with no consent.
- Fails on corporate machines (EACCES, private registry, no network) and **swallows the failure**.
- Prints raw npm output on camera.

**Recommendation:** remove from the demo path. Print `flisk` usage as a hint instead. If retained, gate behind `--install-global` and never inherit stdio.

### S2 — ANSI injection into the fixed frame (new risk introduced by this design)

Raw painting interpolates strings that come from git, npm, and repo metadata (`project.ts:151` prints `templateName`; errors carry child stderr). A value containing `\x1b[2J` or `\x1b[H` can wipe or corrupt the frame — and on a recording it looks like the tool broke.

**Rule:** every interpolated value passes through a `sanitizeCell()` that strips `\x1b` and control chars, and truncates to the computed column width. Test with a repo name containing `\x1b[31m`.

### S3 — `rmSync` on a home-directory path

`cli.ts:70` does `rmSync(destination, { recursive: true, force: true })` where `destination` is `~/.flisk/flisk-demo` (constant, not user input) → path is safe. Residual risks: (a) if `~/.flisk/flisk-demo` is a symlink, behavior depends on Node's symlink handling; (b) an uncaught throw on failure. Add `lstat` check + try/catch.

### S4 — Data-loss edge case

The refresh deletes the demo folder **silently**. A user who edits a file in `~/.flisk/flisk-demo` and re-runs `flisk demo` loses the edit with no warning. Say so before deleting, or reuse instead of delete (see §10).

### Not applicable / no change

No secrets handled. No auth. No new network egress. No new dependency (explicitly required). Supply chain surface unchanged.

---

## 4. Data Flow & Interaction Edge Cases

### Four paths

| Path | Trigger | Required behavior |
| --- | --- | --- |
| **Happy** | 6 services, warm images | Frame completes, ends on URL frame, exit 0 |
| **Nil** | zero phases emitted (immediate failure) | Frame still renders a valid 16-row frame with a failed row. Never an empty screen |
| **Empty** | 0 services discovered | Must not render `0 of 0` or `1/0`; show "no services found" as a failure, not a success |
| **Upstream error** | clone/setup/stack fail | Freeze the failed phase red, one-line cause, one-line fix, log path. No stack trace |

### Interaction edge cases

| Interaction | Today | Required |
| --- | --- | --- |
| **Narrow terminal** | Box wraps → frame grows → cursor-up math breaks → garbage | Clamp every line to `stdout.columns`; degrade the box, never wrap. **This is the #1 hidden bug in fixed-frame rendering** |
| **Resize mid-run (SIGWINCH)** | n/a | Re-render at new width; never accumulate |
| Ctrl+C mid-build | child `unref`'d, frame partially painted, cursor left mid-line | Print `\n`, leave a clean cursor, name what was interrupted |
| Double-run | Wipes folder (`cli.ts:70`) then re-clones | Check for a running demo **first**, before any rm/clone (see §10) |
| Slow network on clone | Appears frozen | Heartbeat line with elapsed time |
| Non-TTY / piped | Plain spinner lines already | One line per phase, no ANSI |
| Terminal without 256-color | chalk degrades | OK, but do not rely on color alone for state — use `✔ ◐ ✖` glyphs |
| Run inside an existing Flisk project | Clones to `~/.flisk/flisk-demo` regardless | Fine; but never `cd` the user |

---

## 5. Code Quality Review

| Finding | Location | Severity |
| --- | --- | --- |
| 226-line entry file carries the whole demo narrative inline | `cli.ts:35-198` | high — extract |
| Same "Runtime readiness" string printed from two places | `project.ts:194` and `:357` | med — the DRY violation *is* the duplicate output |
| `catch {}` swallows git's real error | `project.ts:180` | med |
| `showDetail(x, 0)` with embedded `\n` in the string | `project.ts:154-156` | low — brittle formatting |
| `findFrontendUrl` exported but unused by the flow | `one-command.ts:12` | low — knip candidate |
| Success message printed before the work is verified | `project.ts:190` ("✅ Cloned") then setup can fail | low |
| Boolean naming drift (`didPass`, `isSkipped`, `ok`) | mixed | low, matches `cli/AGENTS.md` |
| No `--quiet` on `project` while `template-engine` already supports it | `project.ts:333,490` | med — a one-line lever left unused |

Naming note per `cli/AGENTS.md`: prefer `renderDemoFrame` / `paintFrame` / `DemoPhase` / `isTty`. Follow the `Result<T>` pattern already used in `one-command.ts`.

---

## 6. Test Review

| Surface | Existing coverage | Gap |
| --- | --- | --- |
| `findFrontendUrl`, `parseStackEnvelope`, `runStackQuiet`, `initializeProject`, `nextAvailableProjectDir`, `findServiceDirs` | ✅ `one-command.test.ts` | — |
| Demo console output | ❌ **none** | Full golden-file suite needed |
| `flisk project --quiet` | ❌ | Add |
| Non-TTY fallback | ❌ | Add |
| `--json` lines | ❌ | Add |

Required new tests (golden-file, no TTY needed because the renderer is pure):

1. `renderDemoFrame` returns exactly `FRAME_ROWS` lines for every phase.
2. Snapshot per phase: fetching / generating / installing / starting / done / failed.
3. Failed phase shows cause + fix + log path, and no stack trace.
4. Narrow width (40, 60, 80, 120 cols): no line exceeds the width; no line contains `\n`.
5. Zero services: no `0 of 0`.
6. ANSI injection: a value containing `\x1b[31m` renders inert.
7. Non-TTY: exactly one line per phase, no `\r` or `\x1b`.
8. `initializeProject` spawns with `stdio[0..2]` all non-inherit.
9. `ensureGlobalInstall` failure surfaces to the caller.
10. Missing `binPath`/`destination` does **not** exit 0.

---

## 7. Observability & Monitoring

The demo is a CLI, so the runbook is the frame itself. Two additions earn their place:

1. **`--verbose`** → tee every child's stdout/stderr to `~/.flisk/logs/demo-<iso>.log`; print the path only on failure. Turns "it didn't work" into a file you can read.
2. **Always print the resolved version** in the final frame (see §9). Turns "which build am I looking at" into a fact.

If funnel telemetry is ever added: `demo_started`, `demo_phase_reached{phase}`, `demo_completed{elapsed}`, `demo_failed{reason}`. Not in this scope; note in the openspec as deferred.

Per-codepath "how would I know it's broken": the frame freezes (no elapsed tick) → heartbeat missing → bug. Add a test that the elapsed value changes between two frames.

---

## 8. Database & State Management

No schema, no index, no migration. State touched:

| State | Risk |
| --- | --- |
| `.tdk/project.json` | Regenerated idempotently; `quiet` does not change content |
| `.env` | Created with defaults; unchanged |
| `.gitignore` | Appends only |
| `~/.flisk/flisk-demo` | **Deleted on every run** (S4) — only real data-loss surface |
| `~/.flisk/logs/` | New; needs rotation or a "keep last 10" cap |

No N+1 risk. `findServiceDirs` walks the tree twice per directory (`readdirSync` called twice at `one-command.ts:186-192`) — trivial at this size, worth a cleanup.

---

## 9. API Design & Contract

| Contract | Change | Compatible? |
| --- | --- | --- |
| `flisk demo` exit codes | 0 = app open; non-zero = named failure | Yes, tightens the silent-0 |
| `flisk project --quiet` | new flag | Additive |
| `flisk demo --json` | one JSON object per phase, reuse `{schemaVersion,data,errors}` from `parseStackEnvelope` | Additive |
| Public one-liner | `npx @flisk-sh/flisk` → `npx -y @flisk-sh/flisk@latest` | **Breaking for docs, required.** See §12 |

`--json` must be the non-TTY contract, because recordings and CI both need deterministic output.

---

## 10. Performance & Scalability

**The video blocker:** `cli.ts:66-78` deletes `~/.flisk/flisk-demo` before every run, then `cli.ts:128-138` re-runs `bun install` in each service dir. So **a second `flisk demo` can never be warm at the project level.** For a repeatable 2-minute recording this is fatal: every take pays the reinstall.

Three fixes, pick one:

- **(a) Reuse before refresh.** Move the `findReadyFrontend` check (`cli.ts:106`) *above* the `rmSync`. If the demo is already running → open it, ~2s. Good for takes 2..N, but shows no work.
- **(b) `--keep` flag.** Skip the `rmSync` and reuse `node_modules` + `.tdk`. Real work still happens (image build is cached), so the stage still has something to show.
- **(c) Keep current behavior, record take 1 only.** Fragile.

Recommend **(b)** as the default behavior and **(a)** as an automatic fast path.

**Also:** `installServiceDependencies` (`one-command.ts:213`) runs `bun install` **serially** per service dir. With 6 services that is the longest silent stretch on camera. Parallelizing changes failure semantics — instead, surface progress per dir in the frame so the wait is legible.

**Scale check:** at 100 services (ERP) the frame must aggregate (`100 of 100`), never enumerate. Design the renderer to take counts, not lists.

---

## 11. Design & UX — the Stage (this is the deliverable)

### Aesthetic brief: Vercel-solid

- Monochrome + one accent. Thin rules. No box-drawing chrome. No emoji. No spinner cheese.
- Right-aligned timing column so the eye can read progress without parsing words.
- One `✔` per finished phase; `◐` for the active one; `✖` for failure. Glyphs carry state, not color.
- Always show elapsed time — it is the proof that something is happening.
- Fixed 16 rows. One screen. Never scrolls.

### Frame — in progress (16 rows)

```
  Flisk demo
  restaurant ops · 6 services · 4 stacks

  ✔  Fetching the demo                              0.9s
  ✔  Generating project config                     12.4s
  ◐  Installing dependencies                       21.1s
  ○  Starting services
  ○  Opening the app

  ─────────────────────────────────────────────────────────
  240 config files generated · 492 files wired

  1 of 6 services ready · 3 building                    34s
```

### Frame — done (the payoff)

```
  ✔  Your stack is running                          1m 47s

     app.flisk-demo.localhost/reservation-app
     app.flisk-demo.localhost/floor-app

  ─────────────────────────────────────────────────────────
  6 services · Postgres · Traefik · live reload
  Edit any file — the browser updates.

  flisk 1.3.206 · logs: flisk logs
```

Rules baked into the above:

- The URL is the hero. Tilt UI is demoted to nothing (it is plumbing, not the product).
- `240 config files` and `492 files wired` are the honest version of the "magic" number (§12).
- Version is always visible — this is also the cure for the stale-cache confusion.
- The last frame is what stays on screen after exit, so it must be the most beautiful one.

### 2-minute beat sheet

| Time | On screen | Note |
| --- | --- | --- |
| 0:00–0:06 | `npx -y @flisk-sh/flisk@latest demo` typed | One line, no scroll yet |
| 0:06–0:16 | Frame appears; Fetching ✔ | Establish the frame early — it is the visual signature |
| 0:16–0:34 | Generating project config; `240 config files` ticks | The "it writes your infra" beat |
| 0:34–0:58 | Installing dependencies ✔ (per-dir ticks) | Do not show a frozen line |
| 0:58–1:28 | Starting services; count climbs 1→6 | The tension beat; elapsed time visible |
| 1:28–1:40 | Done frame; browser opens on the app | The payoff |
| 1:40–2:00 | Cut back to terminal: edit a file → browser updates | The *real* magic is live reload, not the CLI |

**Production note:** shoot on a warm run. Cold is 5+ minutes and the claims registry forbids implying otherwise. Record take 2 with `--keep`; reserve take 1 for the cold timing if needed.

---

## 12. The blocking finding: "500k code lines" is false

The user's intended hero claim for the video is that the demo "generates 500k code lines". Measured reality:

| What the demo does | Measured |
| --- | --- |
| App code | **cloned**, not generated — 2,753 lines, 146 files |
| Config generated by `flisk project` | **240 files** |
| Total project after one command | 492 files, **35,789 lines** |
| Services wired | 6 |

So "500k" is off by ~14×, and the verb is wrong: the demo **wires** existing code; it **generates config**.

This is not just inaccurate — it violates the repository's own governance. `docs/claims.md` states public numbers must link to a registry with source, conditions, and limits, and explicitly forbids unverifiable framing (it already bans "from zero" and "cold boot" for the 14-service demo).

### Honest claims that are still impressive

- "One command. 6 services, 4 stacks, wired end to end."
- "240 config files generated. You wrote none of them."
- "492 files, 35.8k lines — routed, containerized, live-reloading."
- "No Compose file. No Dockerfile. No setup wiki."

Recommendation: use the **config-file** and **zero-setup** angles. They are defensible, on-brand for "one `service.json`, then `flisk up`", and survive scrutiny from a skeptical engineer — which is the only audience that matters for a demo video.

---

## 13. Summary

- **Mode:** SELECTIVE EXPANSION
- **Strongest challenges**
  1. **"500k lines" is false and violates `docs/claims.md`** — the video's hero claim must change before anything is recorded.
  2. **`npx @flisk-sh/flisk` serves a stale cached build forever** — proved `1.3.204` vs `1.3.205`. No UX fix reaches returning users until the canonical one-liner becomes `@latest`.
  3. **The demo prints instructions it then executes**, twice, plus `💡 To start Tilt: flisk up` — a trust violation, not a noise problem.
  4. **Silent failures:** exit 0 having done nothing (`cli.ts:87`), and global-install failure swallowed (`cli.ts:83`).
  5. **No warm path** — `rmSync` + reinstall every run makes a repeatable 2-minute recording impossible.
- **Recommended path:** ship the Stage (pure render + paint, zero deps, 16 fixed rows), quiet the children, fix the five silent/lie paths, add `--keep`, and switch the public one-liner to `@latest`.
- **Accepted scope:** `demo-stage.ts`, `cli.ts` rework, `project --quiet`, child stdio capture, `ensureGlobalInstall` removal/opt-in, `--keep`, `--verbose` log, golden-file tests, docs one-liner change.
- **Deferred:** funnel telemetry, `--json` full mode, `flisk demo` as a registered command with its own openspec capability (Approach C).
- **NOT in scope:** new dependencies; Ink in the startup path; changes to `flisk up`/`flisk project` default output; any claim above measured reality.

### Decision (resolved 2026-10-22)

- **Hero claim: measured numbers.** "240 config files generated. You wrote none of them." Backed by 492 files / 35.8k lines / 6 services · 4 stacks. Rejected: "500k code lines" (false, violates `docs/claims.md`).
- **Deliverable: a recording of `flisk demo` for posting on Twitter/X.**
- **Stop line:** one clean fixed frame + one warm run. Nothing else ships before the video.
- **Rejected for v1:** sidebar panel (illegible at phone size), `--json`, telemetry, openspec capability, registered command.
