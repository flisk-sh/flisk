## Context

Flisk CLI is a multi-language monorepo with TypeScript (CLI), Python (Discovery), and Starlark (Engine/Tilt configs). During initial exploration, several gaps were identified:

**Current State:**
- CLI `resource.ts` has 4 TODO comments for unimplemented features (database/cache checks, routes, worker logic, diff logic)
- CLI `config.ts` has incomplete diff implementation
- Test coverage exists but gaps likely in error handling paths
- No systematic audit system for tracking technical debt

**Constraints:**
- Must not break existing functionality
- Changes should be minimal and focused
- All fixes must include tests where applicable
- Must maintain compatibility with existing Tilt workflows

## Goals / Non-Goals

**Goals:**
- Implement automated scanning to find TODO/FIXME/BUG/HACK markers across all languages
- Fix high-priority TODOs in CLI commands (resource.ts, config.ts)
- Add missing test coverage for critical error paths
- Remove dead code and unused imports
- Document all changes with clear commit messages

**Non-Goals:**
- Major refactoring or architecture changes
- Adding new features beyond fixing existing TODOs
- Rewriting working code without TODOs
- Breaking changes to existing APIs

## Decisions

**Decision 1: Use grep-based scanning for initial audit**
- **Rationale:** Simple, fast, works across all languages (TypeScript, Python, Starlark, Go)
- **Alternative considered:** AST parsing - too complex for initial pass
- **Implementation:** Shell script that searches for patterns: `TODO`, `FIXME`, `XXX`, `BUG`, `HACK`

**Decision 2: Prioritize TODOs by file location and context**
- **Rationale:** Not all TODOs are equal - CLI commands affect users directly
- **Priority order:**
  1. CLI user-facing commands (resource, config)
  2. Core discovery logic
  3. Engine utilities
  4. Test infrastructure

**Decision 3: Implement TODOs with minimal viable solutions**
- **Rationale:** Don't over-engineer; match the scope implied by the TODO comment
- **Example:** `// TODO: Add your routes here` → Add basic route placeholder, not full routing system

**Decision 4: Add tests for all implemented TODOs**
- **Rationale:** Ensures fixes work and don't regress
- **Approach:** Unit tests for CLI, integration tests where appropriate

## Risks / Trade-offs

**Risk:** TODO comments may be intentionally vague and require product decisions
- **Mitigation:** For ambiguous TODOs, implement minimal viable solution and document the limitation

**Risk:** Implementing TODOs may introduce bugs in working code
- **Mitigation:** All changes get tests; use existing test patterns from the codebase

**Risk:** Dead code removal might break something that appears unused but is dynamically loaded
- **Mitigation:** Only remove code after verifying no references exist (static analysis + runtime check)

**Risk:** Test coverage gaps may be larger than initially estimated
- **Mitigation:** Focus on critical paths first; document remaining gaps for future work

## Migration Plan

Not applicable - this is an internal maintenance change with no user-facing migration needed.

Deployment steps:
1. Run audit script to generate initial report
2. Fix TODOs in priority order (CLI first)
3. Add tests for all changes
4. Run full test suite to ensure no regressions
5. Submit as single PR or split by module (CLI, Discovery, Engine)

## Open Questions

1. Should we create a recurring audit job (CI) to catch new TODOs?
2. What's the policy for TODOs that require product decisions vs. technical implementation?
3. Should we establish a "no TODOs in main" policy after this cleanup?
