# landscape-consolidation Specification

## Purpose

The Flisk landscape has two sources of maintenance waste: a vendored duplicate of the `flisk` package in `beauty-crm/cli/` that has diverged from the canonical `tdk-cli/cli/`, and 13+ AI assistant config entries in `beauty-crm/` with overlapping project context spread across 8 directories and 5 root files. Consolidating both reduces maintenance burden and establishes canonical sources of truth.

## Requirements

### Requirement: Single CLI source of truth

All source code and tooling for the `flisk` package SHALL originate from `tdk-cli/cli/`. The `beauty-crm/cli/` directory SHALL NOT contain its own copy of CLI source.

#### Scenario: Remove duplicate CLI directory
- **WHEN** inspecting the `beauty-crm/` project root
- **THEN** there SHALL be no `cli/` directory containing standalone `flisk` source

#### Scenario: Directory removed completely (no symlink)
- **WHEN** inspecting the `beauty-crm/` project root
- **THEN** `beauty-crm/cli/` SHALL NOT exist as a directory or symlink

#### Scenario: No broken references after removal
- **WHEN** searching `beauty-crm/` for direct `beauty-crm/cli/` path references
- **THEN** no such references SHALL exist in scripts, configs, or documentation

### Requirement: Canonical AI project context

All AI assistants operating in `beauty-crm/` SHALL use `CLAUDE.md` as the single canonical source for project context (tech stack, architecture, conventions).

#### Scenario: Remove redundant root-level config files
- **WHEN** listing root-level config files in `beauty-crm/`
- **THEN** `.cursorrules`, `.windsurfrules`, and `.augment-guidelines` SHALL NOT exist

#### Scenario: Assistant directory structure preserved
- **WHEN** an AI assistant reads its configuration
- **THEN** its native directory SHALL still exist (`.cursor/`, `.continue/`, `.roo/`, `.serena/`, `.agents/`, `.augment/`, `.kiro/`)
- **AND** SHALL NOT have been moved or reformatted

#### Scenario: Cross-reference from assistant configs
- **WHEN** an AI assistant initializes
- **THEN** its config files SHALL contain a comment or README referencing `CLAUDE.md` for project context

### Requirement: No regression in CLI functionality

Removing `beauty-crm/cli/` SHALL NOT break any existing functionality that depends on the `flisk` package.

#### Scenario: No workspace resolution errors after removal
- **WHEN** running `bun install` in `beauty-crm/`
- **THEN** it SHALL NOT error due to the removed `cli/` directory

#### Scenario: No workspace resolution errors
- **WHEN** running `bun install` in `beauty-crm/`
- **THEN** it SHALL NOT error due to the removed `cli/` directory
