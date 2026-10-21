## Context

Flisk CLI manages local microservice development through project, stack, resource, doctor, status, and Tilt-oriented commands. The current developer workflow is terminal-heavy: developers run commands manually, inspect logs across tools, and infer root causes from mixed CLI, Docker, Bun, Tilt, port, and config output.

The MVP introduces a VS Code-only extension in a new repository/package at `/private/var/www/2025/ollamar1/tdk-vscode-extension` that treats the Flisk CLI as the operational backend. The extension should not fork orchestration logic from the CLI. It should call the CLI, parse structured output where available, preserve raw output for debugging, and present a focused editor-native workflow for orchestration and troubleshooting.

Stakeholders are Flisk CLI maintainers, developers using Flisk-managed repositories, and maintainers who need failure reports with enough context to debug quickly.

## Goals / Non-Goals

**Goals:**

- Provide a VS Code extension MVP that can be developed and versioned separately from the CLI.
- Deliver a runnable one-shot implementation with scaffold, source code, tests, documentation, and a verification record.
- Detect Flisk projects and expose project, stack, resource, doctor, status, and lifecycle actions from VS Code.
- Provide a real troubleshooting flow that classifies failures, shows likely causes, links evidence, and offers safe next actions.
- Manage notifications so background monitoring is useful without becoming noisy.
- Document CLI JSON/status output gaps as follow-up work without changing the Flisk CLI during this MVP.
- Include a spec critique and final requirement trace before implementation is considered complete.

**Non-Goals:**

- Support JetBrains, Vim, browser IDEs, or a standalone Electron IDE in the MVP.
- Replace the Tilt UI or reimplement Tilt orchestration.
- Automatically run destructive or state-changing repairs without explicit user confirmation.
- Build a full AI assistant or free-form chat interface in the first release.
- Add remote/team dashboard features, cloud sync, or marketplace publishing automation in the MVP.
- Modify the Flisk CLI command contract in the MVP.

## Decisions

1. Create a new extension repo/package at `/private/var/www/2025/ollamar1/tdk-vscode-extension`.

   Rationale: VS Code extension packaging, activation lifecycle, tests, and release cadence differ from the CLI. A separate package keeps the CLI focused and allows extension-specific dependencies such as `@types/vscode`, `vsce`, and VS Code test harnesses.

   Alternative considered: place the extension under `flisk/ext`. That is quicker initially, but it risks coupling extension release mechanics to CLI internals and makes it harder to ship independently. For one-shot implementation, the location is fixed to avoid blocking on repository placement.

2. Use the Flisk CLI as the source of truth.

   Rationale: The extension should orchestrate and troubleshoot through commands such as `flisk doctor`, `flisk status`, `flisk stacks`, `flisk resources`, `flisk up`, and `flisk down`. This avoids two implementations of project discovery, stack/resource state, and health logic.

   Alternative considered: read config files and Tilt state directly from the extension. That may be needed for display hints, but it must not become the primary orchestration model.

   One-shot constraint: do not modify the CLI during the MVP. If structured output is incomplete, implement resilient adapters that keep raw output available and document the missing CLI contract in `docs/cli-contract-gaps.md`.

3. Introduce a command runner boundary.

   Rationale: A typed command runner can capture command, cwd, stdout, stderr, exit code, duration, cancellation, and parsed JSON payloads. This gives orchestration, troubleshooting, tests, and notifications a shared event model.

   Alternative considered: run commands ad hoc from each UI command. That would make troubleshooting weaker because failures would lack consistent metadata.

4. Build troubleshooting as deterministic rules first.

   Rationale: The MVP needs reliable, reviewable classification for common failures: missing Flisk CLI, unsupported CLI version, non-Flisk workspace, Docker daemon unavailable, Tilt unavailable, Bun unavailable, occupied ports, invalid or missing master config, invalid service manifest, failed health endpoint, duplicate daemon, and Tilt startup failures.

   Alternative considered: use an LLM-based troubleshooter first. That would be flashy but harder to test and risky for repair suggestions. LLM assistance can be considered later once deterministic evidence capture is solid.

5. Use quiet-by-default notification policy.

   Rationale: Background status checks can easily become spam. The extension should deduplicate repeated failures, escalate only when state changes or user action is required, and let users tune categories such as doctor failures, stack failures, and repair completion.

   Alternative considered: notify on every failed poll. That is easier, but it teaches users to ignore the extension.

6. Keep repair actions explicit and safe.

   Rationale: Troubleshooting can recommend actions such as opening logs, rerunning doctor, starting Docker docs, freeing a port guide, regenerating configs, or running a specific Flisk command. Any command that changes project files, starts/stops services, prunes Docker, or modifies config must require explicit confirmation and show the exact command.

   Alternative considered: one-click auto-fix for every known issue. That is too risky for an MVP in developer workspaces.

7. Ship three concrete VS Code surfaces.

   Rationale: A one-shot MVP needs enough UI to prove value without becoming a full IDE. The required surfaces are a Flisk Explorer tree, a Troubleshooter view, and a Flisk output channel. Commands can be exposed through command palette and tree actions.

   Alternative considered: command palette only. That is faster, but too weak to satisfy the orchestration and notification requirements.

## Risks / Trade-offs

- CLI output is not structured enough for robust parsing -> Use conservative parsing and mocked adapters for tests, preserve raw output, and document gaps for a later CLI change.
- Extension becomes a thin command palette wrapper -> Require project tree views, status surfaces, troubleshooter evidence, and notification policy as MVP acceptance criteria.
- Troubleshooter over-promises root cause accuracy -> Display confidence, evidence, and next safe step rather than pretending every issue has a single guaranteed cause.
- Notifications become noisy -> Deduplicate by issue fingerprint, workspace, resource, severity, and state transition.
- New repo setup slows the first implementation -> Generate a minimal VS Code TypeScript extension scaffold with focused tests before expanding UI.
- Repair actions could damage local state -> Require confirmation for all state-changing actions and block destructive commands from automatic execution.

## Migration Plan

1. Scaffold `/private/var/www/2025/ollamar1/tdk-vscode-extension` with TypeScript, VS Code engine constraints, test harness, linting, and basic activation.
2. Implement the command runner and workspace detector against the installed or workspace-local Flisk CLI.
3. Add orchestration commands and tree/status views for projects, stacks, and resources.
4. Add deterministic diagnostic rules and the troubleshooter webview/tree/detail UI.
5. Add notification policy, deduplication, and user settings.
6. Document missing CLI structured-output gaps without changing the CLI.
7. Run spec critique, implementation review, automated tests, and manual VS Code smoke tests.

Rollback is simple for the MVP: disable or uninstall the VS Code extension. Follow-up CLI structured-output improvements, if implemented after this MVP, must be additive and preserve existing command behavior.

## Fixed MVP Answers

- Repository path: `/private/var/www/2025/ollamar1/tdk-vscode-extension`.
- Minimum CLI version: detect and display the installed CLI version when available; do not enforce a minimum version in the MVP unless the CLI command is missing.
- Repair actions: support command suggestions and confirmed command execution for safe, explicit commands only.
- Notification history: use VS Code native notifications plus the Troubleshooter view as the persistent issue history.
