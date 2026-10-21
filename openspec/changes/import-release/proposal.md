# Change: Make the published importer safe to use

## Why

The importer is published, but its refusal and Procfile behavior must match what the CLI and runbook promise. Operators also need an explicit minimum core version for imported services that use `buildContext`.

## What Changes

- Define Helm/Kustomize-only refusal and dry-run behavior while preserving imports from supported files in mixed directories.
- Skip unbuildable non-Node Procfile processes, allow partial imports, and fail only when no process can be imported.
- Document the first compatible Flisk core release in the importer README and operator runbook.
- Keep the named `up.test.ts` imports before all mocks.

## Impact

- Affected: `tdk-import` source and README, `docs/operator-runbook.md`, and `cli/src/commands/__tests__/up.test.ts`.
- Out of scope: new language support, adopters, Windows `flisk up`, and premium features.
