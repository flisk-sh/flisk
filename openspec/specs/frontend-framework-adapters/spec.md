# frontend-framework-adapters Specification

## Purpose
Defines how `flisk resource --type frontend` resolves a registered framework provider (React by default, Vue opt-in), persists it as `framework` in service.json, and how the Starlark Vite and TypeScript generators vary by framework while Docker, nginx, Traefik and Tilt orchestration stay shared.

## Requirements

### Requirement: Frontend resource generation resolves and persists a registered framework provider

The CLI SHALL accept an optional `--framework <id>` for frontend resource creation. It SHALL resolve the framework through the registered providers, persist the resolved identifier as `framework` in the generated `service.json`, and select React when the option is omitted. The CLI SHALL reject an unknown identifier before writing generated files and SHALL reject `--framework` when the resource type is not frontend. Interactive prompts SHALL continue to use React without adding a framework picker.

#### Scenario: Omitted framework preserves React default
- **WHEN** a user creates a frontend resource without specifying a framework
- **THEN** generated `service.json` contains `"framework": "react"`
- **AND** generates the React starter files and dependencies

#### Scenario: Explicit registered framework is selected
- **WHEN** a user creates a frontend resource with a registered framework identifier
- **THEN** the CLI generates that provider's entry files, dependencies, and framework configuration
- **AND** generated `service.json` contains the selected identifier in its `framework` field

#### Scenario: Framework option selects Vue
- **WHEN** a user runs `flisk resource web --type frontend --framework vue`
- **THEN** the Vue provider is used
- **AND** generated `service.json` contains `"framework": "vue"`

#### Scenario: Unknown framework is rejected before generation
- **WHEN** a user requests an unregistered frontend framework identifier
- **THEN** the CLI returns an actionable error listing how to find supported identifiers
- **AND** does not create a partial resource

#### Scenario: Framework option is rejected for non-frontend resources
- **WHEN** a user supplies `--framework` while creating a backend, worker, or other non-frontend resource
- **THEN** the CLI returns an actionable error that the option applies only to frontend resources
- **AND** does not create or modify the resource

### Requirement: Framework providers preserve the shared Flisk frontend contract

Every frontend provider SHALL use the shared service metadata and existing Flisk frontend runtime contract. Provider selection SHALL NOT require framework-specific Docker, nginx, Traefik, Tilt orchestration, port allocation, or generated API/environment module behavior. The shared Vite and frontend TypeScript generators MAY select framework-specific config settings.

#### Scenario: Provider-generated frontend runs through shared Flisk integration
- **WHEN** a frontend resource is generated with any registered provider
- **THEN** it uses the same frontend port and service metadata conventions
- **AND** it remains compatible with shared proxy, Docker, nginx, Tilt, and generated API/environment integration

#### Scenario: Vue provider produces a Vue Vite starter
- **WHEN** a user creates a frontend resource with framework `vue`
- **THEN** the generated project includes Vue 3, the Vue Vite plugin, and a Vue SFC starter entry/component
- **AND** the Flisk CLI runtime does not acquire Vue as a dependency

#### Scenario: Generated frontend TypeScript configuration follows the framework
- **WHEN** Flisk generates Docker TypeScript configuration for a Vue frontend
- **THEN** it uses bundler module resolution and does not emit React JSX settings
- **AND** a React frontend, including one with legacy metadata, retains its JSX setting

### Requirement: Provider registry and generated output are checked automatically

The CLI SHALL have automated checks for registered provider resolution, persisted React default, each provider's generated output, and fail-closed handling of unknown identifiers. The checks SHALL run in the existing CLI test suite used by CI.

#### Scenario: CLI CI validates frontend providers
- **WHEN** the CLI CI workflow runs
- **THEN** provider tests verify React default output and Vue scaffold output
- **AND** the workflow verifies unknown framework identifiers fail without partial output

### Requirement: Existing frontend service metadata remains compatible

Existing frontend `service.json` files without a `framework` field SHALL remain valid and SHALL continue to receive the shared Flisk frontend behavior.

#### Scenario: Existing frontend metadata omits framework
- **WHEN** Flisk reads an existing frontend `service.json` that has no `framework` field
- **THEN** the service remains valid and compatible with existing shared frontend runtime behavior

#### Scenario: Reading a legacy frontend does not rewrite its metadata
- **WHEN** resource discovery or `flisk up` reads a frontend `service.json` without a `framework` field
- **THEN** it does not rewrite `service.json` solely to insert a default framework field
