## Why

The TDK landscape has accumulated two inefficiencies from its extraction from the original `beauty-crm` monorepo:

1. **Duplicated CLI client**: `beauty-crm/cli/` is a vendored copy of `tdk-cli/cli/` (both publish as `@flisk-sh/flisk`). This means every CLI fix must be applied twice, and the two copies have already diverged — `beauty-crm/cli/` has 9 source files while `tdk-cli/cli/` has 12 with additional features. This will only worsen over time.

2. **AI config sprawl**: `beauty-crm/` contains configuration for 8 AI coding assistants (`.claude/`, `.cursor/`, `.continue/`, `.roo/`, `.serena/`, `.agents/`, `.augment/`, `.kiro/`) plus 5 root-level config files (`CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.roomodes`, `.augment-guidelines`). Most contain duplicate project context. Developers waste time maintaining 13+ config files that say the same thing.

Fixing both reduces maintenance burden, clarifies the canonical source of truth, and prevents future drift.

## What Changes

### Workstream A: CLI Duplicate Removal
- Remove `beauty-crm/cli/` entirely via `git rm`
- No symlink — symlinks break `git add` pathspec resolution
- Update any `beauty-crm/` scripts/build pipelines that reference the old path

### Workstream B: AI Config Consolidation
- Choose one canonical AI assistant config per project (recommend: `.claude/` + `CLAUDE.md`)
- Remove duplicated root config files (`.cursorrules`, `.windsurfrules`, `.roomodes`, `.augment-guidelines`)
- Consolidate `beauty-crm/.kiro/`, `beauty-crm/.agents/`, `beauty-crm/.augment/` into `beauty-crm/.claude/` or a shared `.ai-tools/` directory
- Add `.cursor/mcp.json` as a workspace-level config (not project-specific)
- Document which AI config is canonical for each project

## Capabilities

### New Capabilities
- `cli-source-consolidation`: Single source of truth for `@flisk-sh/flisk`
- `ai-config-consolidation`: Unified AI assistant configuration

### Modified Capabilities
- Existing specs in `tdk-cli/openspec/specs/` may need minor updates if they reference `beauty-crm/cli/`

## Impact

- **Files removed**: beauty-crm/cli/ (~50 files), AI root configs (5 files), AI assistant dirs (5+ dirs)
- **Files added**: 1 symlink, 1-2 consolidated config files
- **Dependencies**: CI/CD pipelines that reference beauty-crm/cli/ need updating
- **Breaking Changes**: Any tooling that directly references `beauty-crm/cli/bin/flisk.js` will need to use `tdk-cli/cli/bin/flisk.js`
- **Risk Level**: Low-Medium. CLI removal is mechanical and testable. AI config changes are cosmetic but need care not to break developer workflows.
