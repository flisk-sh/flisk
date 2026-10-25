---
title: Tilt Library Build Caching
status: backlog
created: 2026-03-31
updated: 2026-03-31
---

# Tilt Library Build Caching

## Overview

These scripts implement intelligent caching for library builds to avoid unnecessary rebuilds and republishes during `tilt up`.

## How It Works

### Check Script (`check-lib-publish.sh`)

1. **Registry Check**: Queries Verdaccio to see if the package version is already published
2. **Source Hash Check**: Computes a SHA-256 hash of all source files (src/, package.json, tsconfig.json)
3. **Comparison**: Compares current hash with cached hash from last successful build
4. **Decision**:
   - If package published AND sources unchanged → **Skip rebuild** (exit 1)
   - If package not published OR sources changed → **Rebuild needed** (exit 0)

### Build Script (`build-and-publish-lib.sh`)

1. Calls `check-lib-publish.sh` to determine if rebuild needed
2. If skip indicated, exits early
3. If rebuild needed:
   - Runs full build pipeline (install, tsc, link, publish)
   - Saves source hash to `.tilt-cache/source-hash.txt` on success
   - Links package to consumer services if specified

## Cache Location

Each library maintains its own cache:
```
shared-platform-engineering/platform-logger/
├── .tilt-cache/
│   └── source-hash.txt  # SHA-256 hash of source files
├── src/
├── package.json
└── tsconfig.json
```

## Benefits

- **Faster `tilt up`**: Libraries only rebuild when sources actually change
- **Idempotent**: Running `tilt up` multiple times doesn't cause unnecessary work
- **Version Safety**: Warns if sources changed but version not bumped
- **Verdaccio-aware**: Checks actual registry state, not just local build state

## Manual Cache Clearing

To force a rebuild of a specific library:
```bash
rm -rf shared-platform-engineering/platform-logger/.tilt-cache
```

To clear all library caches:
```bash
find . -type d -name '.tilt-cache' -path '*/shared-*' -exec rm -rf {} +
```

## Troubleshooting

### Library not rebuilding when it should

1. Check if version was bumped in package.json
2. Verify source files are actually changing
3. Clear cache and rebuild: `rm -rf <lib-path>/.tilt-cache && tilt up`

### "Version already published" warning

This means source files changed but package.json version wasn't bumped. Either:
- Bump the version if this is a real change
- Revert source changes if they were experimental
- Manually unpublish from Verdaccio if needed

## Implementation Details

**Cache Key**: SHA-256 hash of concatenated contents of:
- All files in `src/` directory
- `package.json`
- `tsconfig.json`

**Registry Check**: HTTP GET to `<verdaccio-url>/<package-name>/<version>`
- 200 = published
- 404 = not published
