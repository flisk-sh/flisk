# Spec Delta

## Purpose

Provides a GitHub Packages distribution and authenticated installation path for `flisk` alongside its existing public npm distribution.

## ADDED Requirements

### Requirement: Publish released package to GitHub Packages
For each released version, the release process SHALL publish the same package artifact to the GitHub Packages npm registry while preserving publication to the public npm registry.

#### Scenario: Successful dual publication
- **WHEN** a release version is published successfully
- **THEN** that version is available from both the public npm registry and `https://npm.pkg.github.com`
- **AND** the package metadata links the GitHub Packages package to `flisk-sh/flisk`

### Requirement: Authenticate repository-owned publication
The repository release workflow SHALL authenticate GitHub Packages publication using a repository-owned GitHub Actions token with package write permission, without requiring a manually pasted personal token for that repository.

#### Scenario: Workflow publishes with repository token
- **WHEN** the GitHub Packages publish job runs with package write permission
- **THEN** it authenticates using the workflow token and publishes the release artifact
- **AND** the token is not written to repository files or logs

### Requirement: Document authenticated package installation
Maintained package installation documentation SHALL describe the scoped GitHub Packages registry mapping and authentication required to install the CLI from that registry.

#### Scenario: Consumer installs from GitHub Packages
- **WHEN** a consumer configures `@tdk-landscape` to use `https://npm.pkg.github.com` and provides a valid read token
- **THEN** the consumer can install `flisk` from GitHub Packages and run `flisk --version`

### Requirement: Preserve npm as the default distribution
Adding GitHub Packages publication SHALL NOT change existing public npm publication or make GitHub Packages the default installation registry.

#### Scenario: Existing npm installation remains supported
- **WHEN** a consumer uses the existing npm installation instructions without GitHub Packages configuration
- **THEN** the consumer can install the package from public npm as before
