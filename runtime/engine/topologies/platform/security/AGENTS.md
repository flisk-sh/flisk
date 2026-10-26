# AGENTS.md - Security & Secrets

## Purpose

Secrets management, Infisical integration, and security configuration.

## Key Files

### Secrets Management
- **`infisical.star`** - Infisical secrets provider integration
- **`secrets.star`** - Generic secrets handling
- **`encryption.star`** - Encryption utilities

### Configuration
- **`tokens.star`** - Token generation and validation
- **`keys.star`** - Key management

## Common Tasks

### Load secrets from Infisical
```starlark
load("./infisical.star", "Infisical")
secrets = Infisical.load_secrets(resource_name, environment)
```

### Get database credentials
```starlark
load("./infisical.star", "Infisical")
db_url = Infisical.get_database_url(resource_name)
```

## Integration

- Called by `resources/` when setting up service environment
- Used in Docker Compose for injecting secrets
- Part of service startup chain

## Local Development

Without Infisical, falls back to:
- Environment variables
- Default values in `spec.master`

## Security Notes

- Never commit real secrets
- Use Infisical for production
- Local development uses safe defaults
- Secrets injected at runtime, not in images
