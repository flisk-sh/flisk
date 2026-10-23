## Why

Flisk CLI already provides project, stack, resource, health, and Tilt orchestration commands, but developers still have to leave the editor to understand what is running, why something failed, and what to do next. A VS Code-only plugin can turn the CLI into an operational cockpit with guided troubleshooting, clearer failure notifications, and one-click orchestration for the common local development loop.

## What Changes

- Create a new VS Code extension repository/package at `/private/var/www/2025/ollamar1/tdk-vscode-extension` for a Flisk IDE plugin instead of embedding extension code in the CLI package.
- Add VS Code commands and panels for Flisk project detection, stack/resource orchestration, status inspection, logs, and doctor checks.
- Add a real troubleshooter that classifies common Flisk/Tilt/Docker/Bun/port/config failures, explains likely causes, and offers safe, explicit repair actions.
- Add notification management so normal background polling remains quiet, while actionable failures surface with deduplicated severity, context, and next steps.
- Add an implementation review workflow that validates the shipped extension against every requirement and records critique findings before the one-shot MVP is considered done.

## Capabilities

### New Capabilities

- `vscode-tdk-orchestration`: VS Code extension behavior for detecting Flisk projects and orchestrating project, stack, and resource actions through the Flisk CLI.
- `vscode-flisk-troubleshooting`: Diagnostic and remediation behavior for identifying common local development failures and presenting safe recovery actions.
- `vscode-tdk-notifications`: Notification policy behavior for quiet background monitoring, actionable alerts, deduplication, and user-controlled notification preferences.

### Modified Capabilities

- None.

## Impact

- Adds a new VS Code extension repo/package at `/private/var/www/2025/ollamar1/tdk-vscode-extension`.
- Uses the existing Flisk CLI as the source of truth for project status, orchestration, health checks, and remediation commands.
- The one-shot MVP MUST NOT require changing the Flisk CLI. If structured CLI output is missing, the extension must use mocked adapters in tests and conservative raw-output parsing at runtime, then document follow-up CLI improvements.
- Adds extension tests, command-runner tests, diagnostic classifier tests, and manual VS Code extension smoke testing.
- Does not change the CLI command contract for existing users in the MVP.
