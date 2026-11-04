# TypeScript compiler benchmark: tsc vs tsgo vs ts-rust

Status: **initial experiment: one local macOS machine plus one CI run on Linux and macOS, 5 warm runs each.** Evidence only; nothing was migrated and no default
compiler, `package.json` script, lockfile, `cli/dist` or shipped file was changed. Reproduce with
`scripts/benchmarks/ts-compilers/` (see [Reproducing](#reproducing)). The CI workflow
`⏱️ CI | TypeScript Compiler Benchmark` produces the same data on Linux and macOS runners; CI numbers are in §5b.

## 1. Executive summary

- **`tsc` in this repo is already the native (Go) compiler.** `cli/package.json` pins `typescript ^7.0.2`, so "tsc vs
  tsgo" is really "TypeScript 7.0.2 vs an older `@typescript/native-preview` build of the same code base". Their output is
  byte-identical (960/960 files). The slow JS compiler (6.0.3) is included only as context: 8-13x slower here.
- **ts-rust (`tsc-rs` 0.8.0) was the fastest on every check/emit scenario locally** and used the least memory, with
  identical diagnostics on all fixtures and byte-identical output to the TypeScript version it ports (7.1.0-beta).
  Absolute gains are small for this repo: type-check of the CLI is about 2.0 s with `tsc`, about 0.8 s with `tsc-rs`,
  about 0.6 s with `--fast`.
- The timing data is **noisy** (max values up to 2-4x the median; the machine was not idle). Treat differences under
  about 30% as inconclusive; larger ones (JS vs native, ts-rust type-check) were consistent in every run.
- Recommendation: **keep `tsc` 7.0.2. Do not adopt tsgo (no benefit) or ts-rust (experimental) for production.**
  Keep the non-blocking benchmark running to see whether ts-rust's lead and compatibility hold on CI hardware.

## 2. Compilers

| id | package | version | notes |
|---|---|---|---|
| tsc | `typescript` (repo pin, `bun.lock`) | 7.0.2 | baseline; native |
| tsgo | `@typescript/native-preview` | 7.0.0-dev.20260707.2 | npm `latest` tag; older than tsc 7.0.2 |
| ts-rust | `tsc-rs` (`pingdotgg/ts-rust`) | 0.8.0 (reports 7.1.0-dev); npm gitHead 4c032be6; repo `main` 91f3d021 when written | prebuilt npm binary; also run with `--fast` |
| oracle | `typescript` | 7.1.0-beta | the revision ts-rust ports; used as its reference |
| context | `typescript` | 6.0.3 | JS implementation |

No Rust or Go toolchain is used anywhere: all compilers are prebuilt npm packages in
`scripts/benchmarks/ts-compilers/` (installed only by the workflow or by hand with `--no-package-lock`).

## 3. Hardware and environment (local run)

Apple M1, 8 cores, 16 GB, macOS (darwin-arm64), Node v24.16.0, Bun 1.3.11, Flisk `4264dc02`. Page cache was not purged (no
sudo); "cold" is the first invocation per scenario and is **not** a true cold-disk number locally. CI sets
`DROP_CACHES=1` on Linux. Peak RAM and CPU come from `/usr/bin/time -l`; CPU utilization = (user+sys)/wall, so >1
means multi-threaded. Raw data: `results.json` (kept as a CI artifact).

## 4. Repository coverage

| area | covered? |
|---|---|
| `cli/` (577 TS/TSX files, strict, `jsx: react-jsx`, `moduleResolution: bundler`, declarations) | yes: type-check, JS emit, d.ts emit, full build, incremental |
| `cli/tsconfig.typecheck.json` incl. `tests/generated`, `tests/runtime-layout` | yes (type-check scenario) |
| Project references | synthetic fixture only (`tsc -b`); the repo has none |
| Decorators (legacy + metadata, standard) | synthetic fixtures only |
| NodeNext/ESM resolution | synthetic fixture only |
| `examples/byo/nestjs` (the only other tsconfig) | **not run** (dependencies not installed) |
| Backend services / shared libraries | the repo has no other tsconfigs; nothing else to test |
| Bun workflows | `bun run typecheck` timed (real script + each compiler via `bun run`); `bun run test` does not use a TS compiler; `bun run build` = `tsc` + a bundle step, covered by the full-build scenario |
| Windows | **untested** (deliberately; see §9) |

## 5. Performance (local, macOS M1, median of 5 warm runs, seconds; min-max in brackets for type-check)

| scenario | tsc 7.0.2 | tsgo | tsc-rs | tsc-rs --fast | tsc 7.1.0-beta | tsc 6.0.3 |
|---|---:|---:|---:|---:|---:|---:|
| startup `--version` | 0.08 | 0.08 | 0.08 | 0.07 | 0.08 | 0.09 |
| startup, one-line file | 0.17 | 0.16 | **0.11** | 0.13 | 0.14 | 0.60 |
| type-check only (CLI + tests dirs) | 2.04 (1.51-3.38) | 1.75 (1.56-3.03) | 0.76 (0.62-0.84) | **0.59** (0.55-1.49) | 1.66 (1.30-4.34) | 11.54 |
| JS emit only (`--noCheck`) | 0.35 | 0.37 | **0.30** | **0.30** | 0.43 | 3.77 |
| d.ts emit only (`--noCheck`) | 1.03 | 1.34 | 0.79 | **0.68** | 1.23 | 6.95 |
| full build (check + JS + d.ts) | 2.06 | 2.27 | 1.17 | **0.95** | 1.59 | 14.69 |
| incremental, cold | 1.16 | 1.01 | **0.85** | 0.92 | **0.85** | 7.05 |
| incremental, no change | 0.29 | 0.32 | 0.20 | **0.17** | 0.30 | 2.01 |
| incremental, one-file edit | 0.37 | 0.44 | 0.30 | **0.23** | 0.50 | 6.28 |
| `bun run typecheck` (Bun 1.3.11) | 2.45 | 2.35 | **0.89** | 0.96 | 1.77 | 22.00 |

The repo's real `bun run typecheck` script (which runs `tsc` 7.0.2) took 2.05 s median, in line with calling `tsc`
directly: Bun adds no meaningful overhead. For the other rows `bun run` launches each compiler through a throwaway
`package.json` with the same flags. `bun run test` is not benchmarked: the Vitest suite does not call a TypeScript compiler.

Runs are interleaved with the compiler order shuffled each round (fixed seed). Even so, max values are often
2-4x the median (the machine was not idle), so only differences clearly outside the min-max range are meaningful:
JS (6.0.3) vs native, and `tsc-rs` type-check vs `tsc`/`tsgo`. `tsc` vs `tsgo` is a tie. Min/max, cold-run and CPU
columns are in `results.json`. Output size is identical for every compiler: 1.89 MB / 240 files (JS), 0.39 MB / 240
(d.ts), 2.28 MB / 480 (full). Incremental builds rewrote 0 files on a no-change rebuild and 3 on a one-file edit for
every compiler, with 0 failed runs.

## 5b. CI results (GitHub-hosted runners, separate from the local table)

Source: workflow run [41933526148](https://github.com/flisk-sh/flisk/actions/runs/41933526148) (artifacts
`ts-compiler-benchmark-Linux-41933526148` and `-macOS-41933526148`, kept 90 days; that run used Node 24.22.1 and Bun 1.4.4,
the workflow now pins Node 22). Each job: 5 warm runs plus 1 cold run per compiler and scenario, compiler order shuffled
per round, 0 failed runs, same compiler versions as §2. **The three environments are different machines. Do not rank
across them; compare compilers only within one column group.**

| environment | CPU / memory |
|---|---|
| Local | Apple M1, 8 cores, 16 GB, not idle |
| CI Linux (`ubuntu-latest`) | AMD EPYC 7763, 4 vCPU, 16 GB, page cache dropped before each cold run |
| CI macOS (`macos-latest`) | Apple M1 (virtual), 3 vCPU, 7 GB, page cache not dropped |

Median wall seconds [peak RSS MB] (tight min-max on Linux: usually within 10%).

| scenario | env | tsc 7.0.2 | tsgo | tsc-rs | tsc-rs --fast | 7.1.0-beta | 6.0.3 |
|---|---|---:|---:|---:|---:|---:|---:|
| type-check | Linux | 1.95 [697] | 1.96 [696] | **0.64** [379] | **0.64** [361] | 1.52 [501] | 9.24 [780] |
| type-check | macOS | 1.48 [714] | 1.73 [705] | 0.69 [376] | **0.62** [357] | 1.15 [507] | 9.40 [777] |
| JS emit (`--noCheck`) | Linux | 0.39 | 0.41 | **0.22** | **0.22** | 0.38 | 2.57 |
| JS emit (`--noCheck`) | macOS | 0.31 | 0.31 | 0.22 | **0.19** | 0.27 | 2.10 |
| d.ts emit (`--noCheck`) | Linux | 0.43 | 0.41 | **0.19** | **0.19** | 0.40 | 2.23 |
| d.ts emit (`--noCheck`) | macOS | 0.32 | 0.35 | **0.21** | **0.21** | 0.32 | 1.92 |
| full build | Linux | 0.84 [304] | 0.82 [312] | **0.39** [205] | **0.39** [203] | 0.77 [267] | 5.11 [522] |
| full build | macOS | 0.65 [330] | 0.83 [329] | **0.38** [201] | 0.45 [199] | 0.63 [272] | 5.49 [507] |
| incremental, cold | Linux | 0.85 | 0.90 | **0.54** | 0.55 | 0.80 | 5.15 |
| incremental, no change | Linux | 0.32 | 0.31 | 0.16 | **0.15** | 0.28 | 1.64 |
| incremental, one-file edit | Linux | 0.37 | 0.35 | **0.17** | **0.17** | 0.32 | 4.47 |
| incremental, one-file edit | macOS | 0.30 | 0.28 | **0.18** | 0.20 | 0.33 | 4.61 |
| `bun run typecheck` (real script = `tsc`) | Linux | 1.89 | 1.90 | **0.62** | 0.63 | 1.46 | 9.13 |
| `bun run typecheck` (real script = `tsc`) | macOS | 1.56 | 2.08 | 0.77 | **0.69** | 1.51 | 11.65 |

What the CI data adds: the pattern holds on clean hardware. `tsc-rs` type-checks the CLI about 3x faster than `tsc`
and `tsgo`, uses about half the memory, and emits in roughly half the time; `tsc` vs `tsgo` is a tie. `--fast` gives
no extra benefit on the 4-vCPU Linux runner (its extra checkers are capped by core count), so its edge in the local
table should not be assumed on CI. The absolute saving on CI is about 1.3 s per type-check on Linux. The diagnostics
and emit comparisons (§7) were also run on both runners and showed no diagnostic differences for `tsgo` against `tsc`
or `tsc-rs` against 7.1.0-beta, and no emit differences for `tsgo` against `tsc` or `tsc-rs` against 7.1.0-beta.
None of this changes the recommendation.

## 6. Memory (peak RSS, MB, median)

| scenario | tsc | tsgo | tsc-rs | tsc-rs --fast | 7.1.0-beta | 6.0.3 |
|---|---:|---:|---:|---:|---:|---:|
| type-check | 719 | 705 | **382** | 396 | 511 | 755 |
| JS emit | 190 | 192 | **155** | **152** | 158 | 427 |
| full build | 332 | 336 | **215** | 221 | 279 | 456 |
| incremental edit | 181 | 178 | 152 | 154 | 148 | 483 |

## 7. Correctness and compatibility

Compared against `tsc` 7.0.2 and, for ts-rust, against `tsc` 7.1.0-beta (the revision it ports).

| check | tsgo | tsc-rs / --fast |
|---|---|---|
| Real CLI diagnostics | identical (but **0 errors**, so this proves little) | identical (0 errors) |
| Error fixtures (26, 7, 1, 2, 3, 1 diagnostics across 6 fixtures) | identical text and order | identical text and order |
| Module-resolution file list (`--listFilesOnly`) | same | same |
| Emitted JS / d.ts, real CLI (960 files incl. maps) | **960/960 identical to tsc 7.0.2** | 480/960 differ vs 7.0.2, **960/960 identical vs 7.1.0-beta** |
| Source maps, decorators, NodeNext, project references (fixtures) | identical to 7.0.2 | identical to 7.1.0-beta |
| Incremental behaviour | no rewrites on no-change; 3 rewrites on edit | same |

The 480 files that differ between 7.0.2 and 7.1.0-beta/ts-rust are all `.map` files and differ in the `sourceRoot` field.
That is an upstream change between TypeScript versions and **not** a ts-rust disagreement. JS 6.0.3 differs more
(`.js`/`.d.ts` too: 164 files) and has 1-2 differing diagnostics on two fixtures, as expected across a major version.

Limits of this evidence: the real repo has no type errors, so missing-diagnostic detection rests on 6 small fixtures
(about 40 diagnostics). The `project-refs` fixture contains a deliberate error, so its `-b` rerun exits non-zero and
the "second run is up to date" check there is weak. Nothing here tests React/JSX types beyond what the CLI covers,
large generic-heavy libraries, or language-server behaviour.

ts-rust unsupported vs disagreeing: no unsupported option was hit by any scenario here (`--noCheck`,
`--emitDeclarationOnly`, `--incremental`, `-b`, `--sourceMap`, `--declarationMap` all ran), and no genuine
disagreement with its reference was found. Per its README, known problems are monorepo `rootDir`/TS6059 edge cases,
timing-dependent `-b` builds that import another project's output without a reference, `--version` printing the
ported version, and slowly growing editor memory. None apply to this repo's single-project setup, but they are
vendor-stated, not independently verified here.

## 8. Unsupported features and incompatibilities

- tsgo / tsc 7: nothing found. Both are still lacking the old JS compiler API (a project-wide TS 7 change, unrelated to
  these results; tooling that imports `typescript` programmatically must be checked separately).
- ts-rust: nothing found in these scenarios. `--fast` is a command-line-only switch and `-b` must come first; the
  harness handles this. The README describes it as an early, LLM-generated release; maturity, not a feature gap, is the risk.

## 9. CI integration cost

- Workflow: `.github/workflows/typescript-compiler-benchmark.yml`; weekly and manual only (no `pull_request` trigger, so it never
  adds to the PR feedback loop); `runs` input is validated (1-20); 30-minute job budget. Separate `continue-on-error` jobs for `ubuntu-latest` and `macos-latest`; not a required check; registered in
  `.github/ci-inventory.json`. Install is about 40 s (7 npm packages with prebuilt binaries), cached by the pin file.
- Windows is **untested**: the npm shims need a shell and there is no `/usr/bin/time`, and a first attempt also hit the
  repo's git-hook `prepare` script during `bun install` on Windows runners. It does not affect the JS-only distribution.
- Flisk's shipped CLI is unchanged: none of this is in the npm package (`npm pack --dry-run` lists no benchmark files).

## 10. Recommendation

Three winners:

| category | winner | why |
|---|---|---|
| Fastest | **tsc-rs `--fast`** (tsc-rs default close behind) | best median on type-check (0.59 s vs 2.04 s), full build and incremental; lowest memory (tsc-rs default); noisy, 5 runs |
| Most compatible | **tsgo** vs tsc 7.0.2 (byte-identical), **tsc-rs** vs its own pin | tsgo shares tsc 7's code base; tsc-rs matched 7.1.0-beta exactly |
| Best for Flisk | **tsc 7.0.2 (stay)** | already native; the whole CLI type-checks in about 2 s, so the best case saves about 1.4 s |

Questions:
- *Is tsgo ready to replace tsc?* There is nothing to replace: `tsc` 7.0.2 is already native and tsgo was equal or slower here.
- *Is ts-rust ready for production?* Not on this evidence. Results are good, but one machine, small fixtures, a
  0-error real repo and an author-described early release are not enough.
- *Can either safely accelerate local development?* ts-rust plausibly could as an **optional, non-default** type-check
  (about 1.3 s saved on a 2 s check); not worth it yet.
- *Best performance/correctness trade-off?* ts-rust on measured data; tsc on risk.
- *What would prevent migration?* For ts-rust: maturity, single maintainer/LLM-authored code, and unverified behaviour on
  larger codebases. For tsgo: no reason to switch.
- *Is a hybrid workflow worthwhile?* Not now. Revisit if CI (Linux) numbers confirm a large, stable lead and a month of
  scheduled runs show zero diagnostic differences.

## Reproducing

```bash
bun install --frozen-lockfile
cd scripts/benchmarks/ts-compilers
npm install --no-package-lock --no-audit --no-fund --ignore-scripts
node bench.mjs --runs 5 --out results/local   # results.json + report.md
```

## Incomplete or failed items

- CI numbers come from a single workflow run (§5b). The weekly schedule will add more; the workflow no longer runs on PRs.
- Windows, `examples/byo/nestjs`, Bun-substituted workflows: not run.
- True cold-cache numbers locally: not measured (needs sudo `purge`).
- Local run had 5 warm runs on a machine that was not idle; use the CI artifacts for cleaner numbers.
- Compared versions differ by generation (tsc 7.0.2, native-preview 7.0.0-dev, tsc-rs ported from 7.1.0-beta, 6.0.3 JS); this is not an apples-to-apples single-version comparison, which is why 7.1.0-beta is included as the ts-rust reference.
