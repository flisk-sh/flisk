## ADDED Requirements

### Requirement: Cold invocation reports ranked readiness
The CLI MUST run a readiness preflight when invoked with no arguments and MUST report readiness before displaying the short command hint. It MUST return exit code 1 if any required machine check fails, and exit code 0 when all applicable checks pass.

#### Scenario: Cold machine has failed prerequisites
- **WHEN** a user invokes the CLI without arguments and one or more machine prerequisites fail
- **THEN** the CLI prints only failed checks in this order: Node, Docker daemon, Docker Engine/Compose versions, Tilt, Bun, host ports, project NATS, project Prisma/database
- **AND** each failure includes an actionable fix line where available
- **AND** the output is limited to eight failed items
- **AND** the process exits with code 1

#### Scenario: Cold machine is ready without a project
- **WHEN** the CLI is invoked without arguments outside a Flisk project and all machine checks pass
- **THEN** it states that the machine is ready and suggests creating or entering a project
- **AND** it does not mention Prisma or a NATS broker
- **AND** the process exits with code 0

### Requirement: Node version is checked before CLI loading
The executable MUST reject Node.js versions below 22.12.0 before loading the compiled CLI and MUST provide a clear installation instruction. Doctor preflight MUST also report the Node version requirement.

#### Scenario: Unsupported Node runtime
- **WHEN** the executable starts under a Node version below 22.12.0
- **THEN** it prints the current version and the Node.js 22.12+ requirement
- **AND** it exits with code 1 without loading the compiled CLI

### Requirement: Project readiness remains conditional
The preflight MUST NOT require a project directory for machine checks. It MUST include NATS checks only when a detected project enables the NATS feature and MUST include Prisma/database checks only when project resources require Prisma. It MUST never report Prisma for a non-project invocation.

#### Scenario: Project wiring failure only
- **WHEN** machine checks pass but an applicable project NATS or Prisma/database check fails
- **THEN** the summary says `Machine is ready. Project wiring is not.`
- **AND** it reports only applicable project failures

### Requirement: Doctor preserves detailed diagnostics
The doctor command MUST print the same ranked cold preflight at the beginning of its report and MUST retain its existing detailed doctor output and checks.

#### Scenario: Doctor invoked
- **WHEN** a user invokes `flisk doctor` or `flisk --doctor`
- **THEN** the ranked preflight appears before the existing detailed doctor report
- **AND** project wiring checks are skipped when no Flisk project is present

### Requirement: Startup commands stop before side effects
The `project` and `up` commands MUST run the machine preflight before generating files or invoking Tilt, and MUST exit with code 1 if any of the first six machine checks fail. Help, version, completion, and other documented bypass commands MUST remain available without machine readiness.

#### Scenario: Machine prerequisite blocks project or up
- **WHEN** a user starts `project` or `up` and a machine check fails
- **THEN** the CLI prints the ranked failures and exits with code 1 before command side effects

#### Scenario: Informational command on an unready machine
- **WHEN** a user invokes help, version, or completion while Docker is unavailable
- **THEN** the requested informational output remains available without a readiness abort

### Requirement: Missing runtime tools become actionable failures
The preflight MUST catch missing Docker or Tilt executables and represent them as failed checks rather than allowing an uncaught exception to terminate the CLI.

#### Scenario: Docker or Tilt is missing
- **WHEN** a readiness probe cannot execute Docker or Tilt because it is missing
- **THEN** the associated ranked check is shown as failed with the existing remediation text where available
