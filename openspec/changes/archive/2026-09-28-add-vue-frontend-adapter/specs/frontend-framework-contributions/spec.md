## ADDED Requirements

### Requirement: Contributors can follow a documented framework adapter process

The repository SHALL document how contributors add a frontend framework provider, including the shared/provider boundary, provider file layout and registration, default behavior, required tests, and documentation updates. For this change, the guide SHALL describe Vite-based SPA providers, instruct contributors to copy the React provider as a starting point, and recommend one framework per pull request. `CONTRIBUTING.md` SHALL link to the detailed guide.

#### Scenario: Contributor finds framework contribution instructions
- **WHEN** a contributor reads `CONTRIBUTING.md`
- **THEN** they can follow a link to the frontend framework contribution guide
- **AND** the guide explains how to add a Vite-based framework provider using the same shared Flisk contract

#### Scenario: Contributor can determine provider scope
- **WHEN** a contributor follows the guide to add a framework
- **THEN** the guide identifies framework-owned files and shared files
- **AND** states that shared Docker, nginx, Traefik, Tilt orchestration, and API/environment generation remain provider-independent while Vite and frontend TypeScript settings can vary within shared generators

#### Scenario: Contributor understands the supported first-provider scope
- **WHEN** a contributor follows the guide to add a provider in this change
- **THEN** the guide says to copy the React provider and register one kebab-case framework id
- **AND** limits the initial adapter contract to Vite-based SPAs and one framework per pull request
- **AND** says not to add framework-specific Docker, nginx, Traefik, Tilt orchestration, or API-client implementations
- **AND** says not to add the framework as a dependency of the `flisk` CLI runtime

### Requirement: Framework contributions have a review checklist

The repository SHALL provide a repeatable checklist for framework provider pull requests. The checklist SHALL cover provider registration, React default compatibility, generated output tests, documentation, and required CLI checks.

#### Scenario: Framework pull request is prepared for review
- **WHEN** a contributor prepares a frontend framework pull request
- **THEN** the pull request template or guide prompts them to identify the framework and provider implementation
- **AND** verify default behavior, tests, documentation, typecheck, lint, and CLI test suite

#### Scenario: Pull request scope is focused
- **WHEN** a contributor prepares a frontend framework pull request
- **THEN** the checklist asks for one framework per pull request
- **AND** rejects a separate framework repository, changing the React default in the same pull request, non-Vite adapters in the initial provider set, or framework-specific engine forks
