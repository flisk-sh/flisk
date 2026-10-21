## 1. CLI Duplicate — Audit & Verify

- [x] 1.1 Confirm `beauty-crm/cli/` is not listed in `beauty-crm/package.json` workspaces
- [x] 1.2 Confirm no CI/CD or scripts reference `beauty-crm/cli/` as a build path
- [x] 1.3 Verify `beauty-crm/cli/package.json` name is `flisk` (not `@beauty-crm/cli`)
- [x] 1.4 Verify `tdk-cli/cli/` has superset of files vs `beauty-crm/cli/` (72 vs 26 source files)
- [x] 1.5 Check `beauty-crm/bun.lock` does NOT lock `flisk` to a `file:cli` path
- [x] 1.6 Check `.tilt-engine/` and `Tiltfile` for any references to `beauty-crm/cli/`

## 2. CLI Duplicate — Remove

- [x] 2.1 `git rm -r beauty-crm/cli/` (removed from git and disk)
- [x] 2.2 Verify no stale references: `rg` found zero references

## 3. AI Config — Audit Current State

- [x] 3.1 Catalog all AI assistant configs in `beauty-crm/`:
  - Directories: `.claude/`, `.cursor/`, `.continue/`, `.roo/`, `.serena/`, `.agents/`, `.augment/`, `.kiro/`
  - Root files: `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.roomodes`, `.augment-guidelines`
- [x] 3.2 Identify content overlap:
  - `.cursorrules` — 32-line communication style (no project context)
  - `.windsurfrules` — 2855-line superset of CLAUDE.md
  - `.augment-guidelines` — 457-line partially overlapping
- [x] 3.3 Check `.roo/rules/` — unique workflow instructions (dev_workflow, self_improve, taskmaster)
- [x] 3.4 Check `.cursor/mcp.json` — unique MCP server configs (task-master-ai, tilt)

## 4. AI Config — Consolidate

- [x] 4.1 Remove `.cursorrules` (redundant with `CLAUDE.md`)
- [x] 4.2 Remove `.windsurfrules` (redundant with `CLAUDE.md`)
- [x] 4.3 Remove `.augment-guidelines` (redundant with `CLAUDE.md`)
- [x] 4.4 Keep `.roomodes` (defines Roo's custom mode slugs — not redundant with CLAUDE.md)
- [x] 4.5 Keep all AI assistant directories in place (each reads from its own native path):
  - `.cursor/`, `.continue/`, `.roo/`, `.serena/`, `.agents/`, `.augment/`, `.kiro/`
- [x] 4.6 Add comment/README to each assistant config pointing to `CLAUDE.md`:
  - `.cursor/mcp.json` → `_comment` field
  - `.roo/README.md`, `.serena/README.md`, `.agents/README.md`, `.augment/README.md`, `.kiro/README.md`, `.continue/README.md`

## 5. AI Config — Documentation

- [x] 5.1 Add banner to `CLAUDE.md` declaring it canonical source of truth
- [x] 5.2 Keep `.cursor/rules/` in place (native Cursor format)
- [x] 5.3 Verify `identity/`, `platform/`, `tdk-cli/` don't need AI configs (scope boundary)

## 6. Verification

- [x] 6.1 Run `git status` — clean, 44 files changed
- [x] 6.2 N/A (no symlink — removed directly via `git rm`)
- [x] 6.3 No broken references found
- [x] 6.4 CLAUDE.md is valid markdown, loadable by any AI
- [ ] 6.5 Ask team to test their preferred AI assistant still works after consolidation
