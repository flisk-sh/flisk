# AGENTS.md - Common Utilities

## Purpose

Shared utility functions used across all Tilt topologies.

## Key Files

### Core Utilities
- **`utils.star`** - `Utils` struct with file operations, path manipulation
- **`paths.star`** - Path utilities, path joining, normalization
- **`strings.star`** - String manipulation helpers

### Tilt Helpers
- **`tilt.star`** - Tilt-specific utilities
- **`debug.star`** - Debug logging, tracing

## Common Tasks

### Read JSON file
```starlark
load("./utils.star", "Utils")
content = Utils.read_json_file(path)
```

### Check if path exists
```starlark
load("./utils.star", "Utils")
exists = Utils.path_exists(path)
```

### Join paths
```starlark
load("./utils.star", "Utils")
full_path = Utils.join_paths(base, relative)
```

## Usage

Most topology modules load this:
```starlark
load("../common/utils.star", "Utils")
```

## Important Notes

- These are pure Starlark functions (no Tilt builtins)
- Safe to use in any context
- No side effects

## Available Functions

See `Utils` struct for full list:
- `read_json_file(path)`
- `path_exists(path)`
- `join_paths(base, rel)`
- `sanitize_name(name)`
- `extract_domain(path)`
- `get_relative_path(from, to)`
