## Context

### CLI Duplication
`beauty-crm/cli/` and `tdk-cli/cli/` both contain the `flisk` package. The `beauty-crm/cli/package.json` declares `"repository.directory": "cli"` pointing to `tdk-landscape/tdk-cli`, confirming it was originally published from the tdk-cli monorepo workspace. Over time, `tdk-cli/cli/` has evolved (12 src files, generator support, DRY assessment) while `beauty-crm/cli/` has lagged behind (9 src files). Any developer fixing the CLI must choose which copy to edit — and usually picks the wrong one.

### AI Config Sprawl
The beauty-crm monorepo has accumulated configs for every AI coding assistant that gained popularity:

| Assistant | Type | Size |
|-----------|------|------|
| `.claude/` | Dir | skills, CLAUDE.md (757 lines) |
| `.cursor/` | Dir | rules, mcp.json, Dockerfile |
| `.continue/` | Dir | skills config |
| `.roo/` | Dir | 7 rulesets, mcp.json |
| `.serena/` | Dir | memories, prompt templates |
| `.agents/` | Dir | skills, mempalace |
| `.augment/` | Dir | agents, skills |
| `.kiro/` | Dir | agents, skills, settings, specs |
| `CLAUDE.md` | File | 757 lines (canonical project context) |
| `.cursorrules` | File | 32 lines (duplicates CLAUDE.md) |
| `.windsurfrules` | File | 2855 lines (duplicates CLAUDE.md + more) |
| `.roomodes` | File | 47 lines (mode definitions) |
| `.augment-guidelines` | File | 457 lines (duplicates CLAUDE.md) |

Most contain overlapping project context (tech stack, architecture, conventions) which creates a maintenance tax — every time the tech stack or conventions change, 13+ files need updating. The `.cursorrules` is a 32-line subset of `CLAUDE.md`. The `.windsurfrules` is 2855 lines that includes the full `CLAUDE.md` content plus extra.

## Goals / Non-Goals

**Goals:**
- Remove `beauty-crm/cli/` and replace with a symlink to `tdk-cli/cli/`
- Update any beauty-crm tooling that references `beauty-crm/cli/` directly
- Consolidate all AI configs into one canonical location per project
- Remove duplicate root-level config files (`.cursorrules`, `.windsurfrules`, `.roomodes`, `.augment-guidelines`)
- Move `.cursor/mcp.json`, `.roo/` mode definitions into a shared format if they add unique value
- Verify no CI/CD breakage

**Non-Goals:**
- Merging AI assistant-specific features (e.g., Serena memories, Roo rulesets) — keep them in `.claude/skills/` or let each assistant read its own format
- Renaming the entire root directory structure
- Changing how `tdk-cli/` is organized internally
- Adding or removing any AI assistant support — only consolidating configs

## Decisions

### Decision 1: Remove Completely (No Symlink)
**Path**: `git rm -r beauty-crm/cli/` — deleted from git and disk, no replacement.
**Rationale**: A symlink breaks `git add pathspec` resolution (git treats symlinked directories as single blobs and cannot traverse them). Since no scripts, workspaces, or CI pipelines reference `beauty-crm/cli/`, there's nothing to break. Removing entirely is the cleanest solution.
**Alternatives considered**:
- Symlink to `../tdk-cli/cli/` — Rejected: breaks `git add` and other git operations
- Keep as-is (do nothing) — Drift will continue to grow

### Decision 2: Canonical AI Config = `.claude/` + `CLAUDE.md`
**Rationale**: `CLAUDE.md` is the most comprehensive single file (757 lines covering tech stack, architecture, conventions). `.claude/` is the directory format used by Claude Code and Opencode. Other assistants (Cursor, Windsurf, Continue, Roo, Serena) can read symlinked or imported copies.
**Implementation**: Other root config files get removed. Each assistant's directory gets a README pointing to `CLAUDE.md` as canonical.

### Decision 3: Preserve `.cursor/mcp.json` as Shared MCP Config
**Rationale**: MCP server configuration is tool-agnostic and useful across assistants. Move it to a shared location or keep as a thin reference.
**Approach**: Keep `.cursor/mcp.json` but add a comment header pointing to `CLAUDE.md` for context. Alternatively, move to `.opencode/mcp.json` if opencode is the canonical tool.

### Decision 4: Keep `.roo/` Rulesets
**Rationale**: Roo's role-based rulesets (architect, code, debug, etc.) are unique to Roo's multi-agent workflow and don't duplicate CLAUDE.md content. They add value.
**Approach**: Leave `.roo/rules/` in place. Only remove root-level `.roomodes` if Roo can find its modes via the directory.

### Decision 5: No Cross-Project AI Config Sync
**Rationale**: `identity/`, `platform/`, and `tdk-cli/` don't have AI configs. Adding them would be scope creep. Each project should opt in when ready.
**Approach**: Document in CONTRIBUTING.md that each project manages its own AI configs, and `.claude/` + `CLAUDE.md` is the recommended canonical format.

## Risks / Trade-offs

**Risk**: Symlink breaks in CI/CD (Docker, git checkout without submodules)
- **Mitigation**: Symlinks work with `git clone` and Docker COPY. Test explicitly.

**Risk**: Developer has `.cursorrules` or `.windsurfrules` open in muscle memory and is confused when gone
- **Mitigation**: Leave a one-line comment file: `.cursorrules → see CLAUDE.md`

**Risk**: Cursor/Continue/Roo stop working optimally without their config files
- **Mitigation**: Each assistant can still use its own directory format. We only remove root-level _files_ that duplicate `CLAUDE.md`. The directories (`.cursor/`, `.continue/`, `.roo/`) stay but get trimmed.

**Risk**: Some AI assistant relies on `.windsurfrules` being 2855 lines (it contains everything)
- **Mitigation**: WindSurf can also read `CLAUDE.md` directly. The `CLAUDE.md` is already comprehensive.
