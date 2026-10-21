## Why

The Flisk CLI codebase has accumulated technical debt through TODO comments, incomplete implementations, and gaps in test coverage. These issues create friction for developers and risk bugs in production. Now is the right time to systematically scan the repository, identify gaps, and fix them before they compound into larger problems.

## What Changes

- **Scan entire codebase** for TODO/FIXME/BUG/HACK comments using automated detection
- **Identify incomplete implementations** in CLI commands (resource, config with TODOs)
- **Find missing test coverage** for critical paths in CLI and discovery modules  
- **Fix high-priority issues**: Implement TODO items, add missing error handling, improve type safety
- **Add missing documentation** for unclear or undocumented code paths
- **Clean up technical debt**: Remove dead code, consolidate duplicates, fix linting issues

## Capabilities

### New Capabilities
- `codebase-audit`: Automated scanning system for detecting technical debt markers (TODOs, missing tests, incomplete features)
- `todo-resolution`: Implementation of high-priority TODO items in CLI commands
- `test-gap-fill`: Adding missing test coverage for critical code paths
- `dead-code-cleanup`: Identification and removal of unused code and imports

### Modified Capabilities
- None - this is a maintenance/polish change that doesn't modify existing specifications

## Impact

- **CLI**: TypeScript source files in `cli/src/` - implementing TODOs in resource.ts, config.ts
- **Tests**: Python tests in `tests/tilt-engine/` and TypeScript tests in `cli/` - adding missing coverage
- **Discovery**: Python modules in `discovery/` - improving error handling and edge cases
- **Engine**: Starlark files in `engine/` - minor cleanups and documentation improvements
- **No breaking changes**: All fixes are additive or internal improvements
