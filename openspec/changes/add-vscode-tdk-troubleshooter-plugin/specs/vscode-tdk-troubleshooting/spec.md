## ADDED Requirements

### Requirement: Troubleshooter classifies common Flisk failures
The extension SHALL classify common local development failures using deterministic diagnostic rules based on CLI results, environment checks, and captured command evidence.

#### Scenario: Missing prerequisite
- **WHEN** Docker, Tilt, Bun, or the Flisk CLI is missing or unavailable
- **THEN** the troubleshooter identifies the missing prerequisite and presents the evidence that caused the classification

#### Scenario: Port conflict
- **WHEN** a Flisk command or doctor result indicates that a required port is occupied
- **THEN** the troubleshooter identifies the affected port and resource when that information is available

#### Scenario: Invalid project configuration
- **WHEN** Flisk project defaults, tech stack config, Tiltfile, or service manifests are missing or invalid
- **THEN** the troubleshooter identifies the invalid configuration area and links to the relevant file or command output when available

#### Scenario: Tilt startup failure
- **WHEN** a Flisk lifecycle command reports a Tilt startup failure
- **THEN** the troubleshooter identifies the failure as Tilt-related and preserves the relevant command output as evidence

### Requirement: Troubleshooter presents likely cause and next action
The extension SHALL show likely cause, confidence, evidence, and recommended next action for each classified issue.

#### Scenario: Classified issue displayed
- **WHEN** the troubleshooter opens a classified issue
- **THEN** the issue detail includes severity, likely cause, confidence, evidence, and at least one next action

#### Scenario: Unknown issue displayed
- **WHEN** the troubleshooter cannot classify a failure
- **THEN** the issue detail shows the raw command evidence and recommends a safe next diagnostic step

### Requirement: Repair actions require explicit confirmation
The extension SHALL require explicit user confirmation before running any repair action that changes files, starts or stops services, prunes resources, or modifies local environment state.

#### Scenario: User selects state-changing repair
- **WHEN** the user selects a repair action that changes local state
- **THEN** the extension displays the exact command or operation and waits for confirmation before execution

#### Scenario: User declines repair
- **WHEN** the user declines a repair confirmation
- **THEN** the extension does not run the repair and keeps the troubleshooting issue available

### Requirement: Troubleshooter preserves diagnostic context
The extension SHALL retain recent diagnostic context for failed commands so users can review evidence without rerunning the command immediately.

#### Scenario: Failed orchestration command
- **WHEN** an orchestration command fails
- **THEN** the troubleshooter records the command metadata, raw output, parsed issue fingerprints, and timestamp

### Requirement: CLI contract gaps are documented
The extension SHALL document any missing or unstable Flisk CLI output contract encountered during implementation instead of requiring CLI changes for the MVP.

#### Scenario: CLI output cannot be parsed robustly
- **WHEN** an adapter cannot reliably parse a Flisk CLI command output
- **THEN** the extension keeps raw output available and records the missing structured-output need in CLI contract gap documentation
