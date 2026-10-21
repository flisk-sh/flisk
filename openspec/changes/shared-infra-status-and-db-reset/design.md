# Design

## Grouping (`flisk status`)

A pure function in `cli/src/utils/shared-infra.ts` takes the discovered stacks and the project name and returns one Postgres instance group:

- Instance: `postgres`, present when at least one discovered resource uses the shared database.
- A resource uses the shared database when its `featuresEnabled` includes `database-management` or its `dependsOn` includes `postgres` or `database-management`.
- Each stack that has such a resource becomes a database entry named `<project>_<stack>`, listing those resources.

The function does no I/O, so it is unit-testable without Docker or Tilt. `flisk status` renders it in the human output and adds it to `--json` as `sharedInfra`.

## Per-stack reset (later PR)

- Target: the database `<project>_<stack>` only. No container drop.
- Dependents: resources in other stacks whose declared `dependsOn` names the target stack's resources. Listed before the reset.
- Confirmation: a prompt by default; `--yes` for scripts.
- Whole-instance reset: `--instance` flag, separate from the per-stack path.
- No migrations or seeds run after the reset.
