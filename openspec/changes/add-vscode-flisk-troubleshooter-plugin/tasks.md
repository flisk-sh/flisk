## 1. Scope Review and Repository Setup

- [x] 1.1 Create `/private/var/www/2025/ollamar1/tdk-vscode-extension` as the new VS Code-only extension package location.
- [x] 1.2 Add `docs/spec-critique.md` documenting MVP creep risks, unsafe repair risks, missing CLI contract risks, and how this implementation constrains each one.
- [x] 1.3 Scaffold a TypeScript VS Code extension package with activation, command registration, test harness, lint/typecheck scripts, packaging metadata, and README.
- [x] 1.4 Add extension configuration settings for Flisk CLI path, polling behavior, notification categories, and safe repair confirmation behavior.
- [x] 1.5 Add a verification checklist document that maps each spec requirement to implementation and test evidence.

## 2. Flisk CLI Integration Layer

- [x] 2.1 Implement a command runner that captures command, cwd, stdout, stderr, exit code, duration, cancellation, and timestamp.
- [x] 2.2 Implement Flisk CLI discovery with support for configured binary path, workspace-local binary, and PATH fallback.
- [x] 2.3 Implement workspace detection for Flisk project roots and disabled empty-state behavior for non-Flisk workspaces.
- [x] 2.4 Implement typed adapters for `flisk doctor`, `flisk status`, `flisk stacks`, `flisk resources`, `flisk up`, and `flisk down`.
- [x] 2.5 Add conservative raw-output parsing for adapters where structured JSON is unavailable.
- [x] 2.6 Document missing structured-output needs in `docs/cli-contract-gaps.md` without modifying the Flisk CLI.

## 3. VS Code Orchestration UI

- [x] 3.1 Add a Flisk Explorer tree view for detected project, stacks, resources, and last known status.
- [x] 3.2 Add commands for refresh status, run doctor, start stack/resource, stop stack/resource, and stop all services.
- [x] 3.3 Add cancellation support for long-running refresh/doctor/orchestration commands.
- [x] 3.4 Add a Flisk output channel and append every executed command plus raw stdout/stderr.
- [x] 3.5 Preserve raw command output and surface it from the relevant project, stack, resource, or command result.

## 4. Troubleshooter

- [x] 4.1 Define diagnostic issue types, severity levels, confidence levels, fingerprints, evidence records, and recommended next-action models.
- [x] 4.2 Implement deterministic classifiers for missing Flisk CLI, unsupported CLI version, non-Flisk workspace, Docker unavailable, Tilt unavailable, Bun unavailable, occupied ports, missing/invalid master config, invalid service manifest, failed health endpoint, duplicate daemon, and Tilt startup failure.
- [x] 4.3 Add a Troubleshooter view that shows issue list, severity, likely cause, confidence, evidence, raw output, and next actions.
- [x] 4.4 Implement safe repair actions with explicit confirmation and exact command/operation preview for any state-changing action.
- [x] 4.5 Ensure unknown failures retain raw command evidence and recommend a safe diagnostic next step.
- [x] 4.6 Keep actionable issues available in the Troubleshooter view after native VS Code notifications are dismissed.

## 5. Notification Management

- [x] 5.1 Implement quiet-by-default background polling with no notifications for successful checks or unchanged non-actionable states.
- [x] 5.2 Implement notification deduplication by issue fingerprint, workspace, resource, severity, and state transition.
- [x] 5.3 Implement notifications for new critical issues, escalations, and completed user-triggered repair actions.
- [x] 5.4 Route notification actions to the relevant troubleshooting detail, command output, stack, or resource.
- [x] 5.5 Honor user settings for notification categories and quiet behavior.
- [x] 5.6 Add tests proving dismissed native notifications do not remove issues from Troubleshooter history.

## 6. Tests and Manual Validation

- [x] 6.1 Add unit tests for command runner success, failure, cancellation, and output capture.
- [x] 6.2 Add unit tests for Flisk workspace detection and CLI discovery fallbacks.
- [x] 6.3 Add unit tests for every deterministic diagnostic classifier and unknown-failure fallback.
- [x] 6.4 Add tests for notification deduplication, escalation, and category suppression.
- [x] 6.5 Add VS Code extension integration tests for activation, command registration, disabled non-Flisk workspace state, and at least one orchestration command using a mocked CLI.
- [x] 6.6 Add mocked CLI fixtures for success, failure, missing prerequisites, port conflict, invalid config, Tilt startup failure, and unknown failure.
- [x] 6.7 Run lint, typecheck, unit tests, and VS Code extension tests.
- [x] 6.8 Package or dry-run package the extension to prove the MVP can be installed locally.

## 7. Documentation and Final Review

- [x] 7.1 Document MVP usage, settings, supported commands, troubleshooting behavior, notification policy, and safe repair guarantees.
- [x] 7.2 Document known limitations and follow-up candidates such as richer Tilt links, marketplace publishing, and optional AI-assisted troubleshooting.
- [x] 7.3 Complete the verification checklist mapping every scenario in the three spec files to source code and test evidence.
- [x] 7.4 Perform a final critical review of the specs and implementation for overreach, missed failure modes, notification noise, unsafe repair actions, and any gap that blocks one-shot MVP acceptance.
- [x] 7.5 Record final commands run and results in the verification notes.
