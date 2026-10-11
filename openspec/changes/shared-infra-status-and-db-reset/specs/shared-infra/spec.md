# shared-infra

## ADDED Requirements

### Requirement: Status groups the shared Postgres by stack database

`tdk status` SHALL show the shared Postgres instance, one database per stack named `<project>_<stack>`, and the services that use each database.

#### Scenario: Two stacks share one instance

- **WHEN** a project has stacks `shop` and `billing` whose resources use the shared database
- **THEN** status lists one `postgres` instance with databases `<project>_shop` and `<project>_billing`, each with its services

#### Scenario: A stack with no shared usage is omitted

- **WHEN** a stack has no resource with `database-management` in `featuresEnabled` and no `dependsOn` naming `postgres` or `database-management`
- **THEN** that stack does not appear under the Postgres instance

### Requirement: Machine output carries the same grouping

`tdk status --json` SHALL include `sharedInfra` with the same instance and database grouping.

### Requirement: Reset targets one stack database

A per-stack reset SHALL drop and recreate only `<project>_<stack>` and SHALL NOT affect other stacks' databases. It SHALL list declared dependents before dropping and SHALL prompt unless `--yes` is given. It SHALL NOT run migrations or seeds.
