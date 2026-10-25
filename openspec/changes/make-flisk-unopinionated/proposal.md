# Change: Make Flisk unopinionated

## Why

Flisk provides a strong default developer experience, but several assumptions reduce adoption for teams with existing standards:

- Bun/TypeScript is the default generated stack.
- Traefik and Postgres are bundled into the default local stack.
- Flisk generates framework-specific files such as Vite config, Nginx config, TypeScript config, and an API client.
- `service.json` is the primary contract, with limited support for teams that already maintain Compose, Tilt, Helm, or other configuration.
- The local runtime is fixed around Docker plus Tilt.

## What Changes

- Separate Flisk into a minimal core and optional presets.
- Make all generated artifacts opt-in rather than implicit.
- Support bring-your-own Dockerfile, Compose file, Tiltfile, and service command.
- Make Traefik, Postgres, health checks, hot reload, and generated clients optional capabilities.
- Preserve `service.json` as the native contract, and add import and adapter support for existing Compose and Tilt configuration.
- Introduce a provider interface for runtimes, databases, gateways, frameworks, and local orchestration engines.
- Keep the current Bun + Docker + Tilt + Traefik + Postgres flow as a first-party preset, not a requirement.

## Impact

- Affected specs: `core-platform`, `service-manifest`, `local-runtime`, `generated-files`, `provider-plugins`.
- Affected code: CLI command layer, manifest parsing and validation, generators, Docker/Tilt integration, Traefik and Postgres integration, documentation and examples.
- Compatibility: existing Flisk projects must keep working. Existing behavior becomes the `flisk-defaults` preset. No breaking change for current `service.json` users.
