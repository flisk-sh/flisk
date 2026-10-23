# .tilt-engine/

> **Contributing to the current engine:** follow the [engine and discovery recipe](../docs/contributing/02-feature-recipes.md#change-the-engine-or-service-discovery). This README contains older architecture notes; check paths against the current `engine/topologies/` source before relying on them.

**Tilt Platform Framework Code**

This directory contains the Flisk Landscape Tilt infrastructure framework - the code that powers our local development orchestration.

## What's Here

- `spec.master` - Master specification file defining all paths, constants, and configurations
- `topologies/` - Topology modules for platform infrastructure (Docker, networking, security)
- `docs/` - Documentation for the Tilt platform
- `scripts/` - Utility scripts for Tilt operations
- And more framework code...

## Important

✅ **This directory is TRACKED in git** - it contains framework code maintained by developers.

🔄 **Do NOT delete** - these files are essential for Tilt to function.

## For Developers

When you see `.tilt-engine/` in paths, know that this is framework code (not generated output).

Generated/output files go in `.tdk/.tdk-out/` (which is gitignored).

## Learn More

See the main project documentation for details on our Tilt infrastructure.
