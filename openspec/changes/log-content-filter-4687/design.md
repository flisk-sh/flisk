# Design

## Context

Native processes read stored log lines; Docker services expose structured lines through Tilt. The logs command already applies redaction and a bounded tail.

## Goals / Non-Goals

Provide one content matcher for both paths and MCP. Preserve all existing output when grep is absent. Do not change log collection, follow streams, generators or resource lifecycles.

## Decisions

- Compile one smart-case regular expression from escaped pattern text, so a caller-supplied pattern is matched literally and cannot inject a costly expression. Patterns with no uppercase letters use case-insensitive matching. No global flag or retained lastIndex state.
- Validate a non-negative safe-integer context before reading logs. Context requires grep; every pattern is valid literal text, so patterns have no USAGE error. Invalid options use the existing USAGE/exit-2 path.
- Filter the already redacted snapshot after service/source/since/tail selection. `tail` bounds the input window, so context never reads older history outside that window.
- Build and merge context intervals per service, then preserve the original cross-service order. Context cannot include another service's unrelated lines. Overlapping windows emit each line once.
- When a structured Tilt message contains several text lines, split it only for grep selection; preserve its metadata. No-grep output stays unchanged.
- MCP delegates to the same CLI behavior with schema-checked grep/context arguments.

## Risks / Trade-offs

A raw caller-supplied regular expression could backtrack catastrophically (CWE-400), so the pattern is escaped and matched as literal text; matching stays linear within the already bounded tail window. This change adds no regex-engine dependency or unrestricted history scan. Same-day Windows/Linux/macOS results remain separate from local runtime evidence.

## Verification

Show baseline unknown-option and missing MCP argument handling. Add pure smart-case/context tests, CLI native/Tilt cases and invalid-input controls. Exercise real local-process and Docker/Tilt fixtures, MCP calls and generated-file hashes. Run CLI typecheck, lint, tests, build and dist consistency.
