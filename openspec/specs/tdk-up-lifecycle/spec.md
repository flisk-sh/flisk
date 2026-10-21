## ADDED Requirements

### Requirement: Native Windows startup is refused by default
On native Windows, `flisk up` SHALL refuse to start Docker or Tilt unless `TDK_ALLOW_NATIVE_WINDOWS=1` is set. Without the escape hatch it SHALL exit 1 and include a doctor hint. The escape hatch is unsupported and SHALL NOT change the documented platform contract.

#### Scenario: Native Windows startup without escape hatch
- **WHEN** `flisk up` runs on native Windows without `TDK_ALLOW_NATIVE_WINDOWS=1`
- **THEN** it starts neither Docker nor Tilt, prints an error with a doctor hint, and exits 1

### Requirement: Force mode stops Tilt on the configured port
`flisk up --force` SHALL terminate the Tilt process bound to `TILT_PORT`, defaulting to 10350, before starting the replacement process. The same behavior SHALL apply when `--quiet` is also set.

#### Scenario: Force replaces Tilt on the default port in quiet mode
- **WHEN** `flisk up --force --quiet` runs while Tilt is bound to port 10350
- **THEN** the bound Tilt process exits before the new Tilt process starts

#### Scenario: Force uses a configured Tilt port
- **WHEN** `TILT_PORT` specifies a port with a Tilt process bound to it
- **THEN** force mode stops that process and does not target unrelated Tilt processes

### Requirement: Dry-run has no startup or generation side effects
`flisk up --dry-run` SHALL describe the planned startup without starting Docker or Tilt and without writing generated files.

#### Scenario: Dry-run previews startup
- **WHEN** a user runs `flisk up --dry-run`
- **THEN** the command reports the plan, starts no Docker or Tilt process, and leaves generated files byte-identical
