# Proposal

## Why

Two stacks in one project share one platform Postgres container, each with its own database named `<project>_<stack>` (see [#584](https://github.com/tdk-landscape/tdk-cli-core/issues/584)). Nothing in the CLI shows that sharing, and there is no way to reset one stack's database without dropping the whole instance. [#682](https://github.com/tdk-landscape/tdk-cli-core/issues/682) asks for both. The design decisions came from [discussion #236](https://github.com/tdk-landscape/tdk-cli-core/discussions/236).

## What Changes

- `tdk status` groups shared infrastructure by instance: one Postgres container, then each stack's database and the services that use it.
- A per-stack database reset command. It drops and recreates only the target stack's database.
- Before a reset, the CLI warns with the services that declare a dependency on that database (declared `dependsOn` only; schema inspection is a later opt-in).
- The reset asks for confirmation by default. `--yes` skips the prompt for scripts and CI.
- The reset does not run migrations or seeds. They stay a separate step.
- A whole-instance reset exists behind an explicit flag, for a clean slate or a Postgres version or extension change.

## Non-goals

- Pre-reset snapshot: tracked separately in [#1048](https://github.com/tdk-landscape/tdk-cli-core/issues/1048).
- Schema-based (foreign key) dependency detection: optional follow-up.
- Sharing across separate projects, and the per-stack opt-out to its own instance: need a design pass first.
- Cache and broker grouping in `tdk status`: no shared cache or broker instance exists in the CLI yet to group.
