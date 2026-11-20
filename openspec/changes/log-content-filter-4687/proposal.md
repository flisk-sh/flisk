# Proposal

## Why

Reading a full service-log tail wastes attention and agent context when only a few error lines matter. Issue #4687 requests content matching with nearby lines through the CLI and MCP.

## What Changes

- Add `logs --grep <text> --context <n>` and corresponding MCP properties.
- Apply smart-case matching and merge overlapping context windows within each service.
- Preserve existing redaction, service/source/time filters and bounded tail behavior.
- Flag matching JSON lines with `match: true` and context lines with `match: false`.

## Capabilities

### New Capabilities

- `log-content-filtering`: Select log lines by content with bounded per-service context across CLI and MCP.

### Modified Capabilities

None.

## Impact

Changes the logs command, shared log utilities, MCP arguments/schema, generated CLI output, tests and CLI guidance. No runtime generator, service manifest or dependency changes.
