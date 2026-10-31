# Tasks

Tracked as epics and sub-tasks in flisk-sh/flisk: #2216 (audit), #2217 (minimal core), #2218 (optional integrations), #2219 (import and wrap), #2220 (providers), #2221 (preset). Sub-task numbers match the list below.

## 1. Audit opinionated behavior

- [x] 1.1 Catalog every implicit default in the CLI (#2222)
- [x] 1.2 Identify generated files that overwrite or assume a framework (#2223)
- [x] 1.3 Identify hard-coded dependencies on Bun, Traefik, Postgres, Docker, and Tilt (#2224)
- [x] 1.4 Document which defaults are required for `flisk up` versus optional (#2225)
- [x] 1.5 Add an `unopinionated` test fixture with no generated framework files (#2226): an API and a website with `command`, started by `flisk up` in `cli/src/commands/__tests__/up-native-e2e.test.ts`

## 2. Define the minimal core

- [ ] 2.1 Define a minimal service contract: name, command or image, ports, env, dependencies (see `specs/core-platform/spec.md`). Done for `command` services (appName, appType, command, port, env, dependsOn, healthCheckPath; no stack; a second runtime source is refused). An `image` service still needs `appType` and `stack`.
- [ ] 2.2 Allow a service to run from an existing Dockerfile without generation
- [x] 2.3 Allow a service to run from a direct local command without Docker (#2229): see `design.md`
- [ ] 2.4 Make `flisk up` work with zero generated files when the user supplies their own runtime config. Done for `command` services (only `.flisk/project.json` and `.flisk/native/` are written); not yet for an own Dockerfile or Compose file.
- [x] 2.5 Ensure `flisk doctor` validates only the capabilities actually enabled (#2231): a project of `command` services is checked for its programs, dependsOn, ports and health, not for Docker, Compose, Tilt, Bun or the gateway/database ports. Finer per-capability checks (gateway, database) come with 3.1 and 3.2.

## 3. Make integrations optional

- [ ] 3.1 Move Traefik behind an optional gateway capability
- [ ] 3.2 Move Postgres behind an optional database capability
- [ ] 3.3 Move hot reload behind an optional watch capability
- [ ] 3.4 Make health checks optional and configurable
- [ ] 3.5 Make generated API clients opt-in
- [ ] 3.6 Make generated Vite, Nginx, and TypeScript files opt-in

## 4. Support existing workflows

- [ ] 4.1 Add `flisk import compose`
- [x] 4.2 Add `flisk import tiltfile` (#2239)
- [ ] 4.3 Allow Flisk to orchestrate an existing Compose project without rewriting it
- [x] 4.4 Allow Flisk to wrap an existing Tiltfile without replacing it (#2239: with `orchestration.source: "tiltfile"`, the generated `.flisk/.flisk-out/Tiltfile` only `include()`s it)
- [ ] 4.5 Add `--no-generate` mode for orchestration only
- [ ] 4.6 Add `--dry-run --explain` output showing what Flisk would create or change

## 5. Add provider architecture

- [ ] 5.1 Define provider interfaces for runtime, database, gateway, cache, queue, and orchestrator
- [ ] 5.2 Move Docker/Tilt into a default local-runtime provider
- [ ] 5.3 Move Traefik into a default gateway provider
- [ ] 5.4 Move Postgres into a default database provider
- [ ] 5.5 Add a provider registry and capability discovery mechanism
- [ ] 5.6 Allow project-level provider overrides in project configuration

## 6. Preserve current experience

- [ ] 6.1 Create a `flisk-defaults` preset containing the current behavior
- [ ] 6.2 Keep Bun/TypeScript scaffolding available through that preset
- [ ] 6.3 Ensure all existing examples continue to pass
- [ ] 6.4 Add migration documentation for users who want the minimal mode
- [ ] 6.5 Add an A/B comparison: default preset versus unopinionated mode
