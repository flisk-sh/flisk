# Spec Delta

## Purpose

State which code is MIT and in foundation scope, and which code is downloaded only with a license key.

## ADDED Requirements

### Requirement: MIT core stays key-free

`flisk up`, scaffold, Traefik, Postgres, and Tilt live update SHALL run without TDK_LICENSE_KEY. README.md SHALL keep the sentence that the core CLI is MIT and needs no key.

#### Scenario: Up without a key

- **WHEN** TDK_LICENSE_KEY is unset and the user runs flisk up on a project with no premium feature enabled
- **THEN** startup does not prompt for a key and does not download an implementation

### Requirement: Key-downloaded code is outside donation scope

GOVERNANCE.md SHALL list Verdaccio, DDD scaffold, Sablier idle stop, and any other path that downloads code with TDK_LICENSE_KEY as outside foundation scope until that code is committed under the MIT license.

#### Scenario: Premium feature enabled without a key

- **WHEN** project config enables verdaccio and TDK_LICENSE_KEY is unset
- **THEN** the CLI reports the feature as unavailable and does not fetch code

### Requirement: Donation scope statement

GOVERNANCE.md SHALL say a future foundation donation covers the MIT tree only and does not include key-downloaded implementations.

#### Scenario: Reader checks scope

- **WHEN** a reader opens GOVERNANCE.md
- **THEN** the donation paragraph names the MIT tree and the excluded premium downloads
