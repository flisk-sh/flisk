# 2. Follow the recipe for your change

These recipes are starting points. If you cannot find a file, search for the command, config key, or generated filename in the repository and ask in the issue.

## Change a CLI command

1. Find the command under `cli/src/commands/`.
2. Look for its tests under `cli/src/commands/__tests__/` or beside its source file.
3. Make the smallest change that fixes the issue or adds the option.
4. Update `cli/README.md` if the command or its options are user-visible.
5. From the repo root, run `bun run typecheck`, `bun run lint`, and `bun run test`.
6. **E2E:** if the command talks to a running stack (or it is an MCP tool that does), add a case to the matching suite. See [Write an e2e test](05-write-e2e.md).

For frontend frameworks, follow the dedicated [frontend provider guide](../frontend-framework-providers.md). It explains the React/Vue provider boundary, engine templates, compatibility checks, and PR checklist.

## Add a database or infrastructure tool

First decide what you are adding:

- A **database used by a service** may affect the service manifest, database URL generation, migration setup, and readiness checks.
- A **shared local tool** (for example Redis or NATS) may affect optional feature configuration, generated Compose files, Tilt resource registration, dependencies, and health checks.

Use the existing code as a map:

1. Start with `engine/topologies/tilt/resources/infra-loader.star` to see how shared infrastructure is loaded and registered.
2. Look at `engine/topologies/tilt/resources/databases.star` for the database lifecycle example and `engine/topologies/platform/docker/compose/` for Compose generation.
3. Find the related feature or manifest setting and follow it to where it is validated and enabled. Search for the setting name with `rg`.
4. Trace the full lifecycle: configuration, generated files, startup order, health/readiness, environment or secrets, shutdown/cleanup, and what happens when the tool is disabled.
5. Add checks for the behavior you changed. CLI and Starlark generator tests live under `cli/src/commands/__tests__/`; the Python engine tests are under `tests/tilt-engine/`.
6. Update the user-facing feature or CLI docs, such as `docs/FEATURES.md` or `cli/README.md`.
7. **E2E:** a new tool or database changes what a stack boots. Add a case that boots it and checks its health and its wiring. See [Write an e2e test](05-write-e2e.md).

Do not assume a new tool needs every file above. Follow the current implementation that is closest to your feature and keep shared service behavior working.

## Try a Starlark change without Docker

You can run any engine function and look at its output with only Tilt installed. From the repository root, create `try.Tiltfile` (it is git-ignored):

```python
load("engine/topologies/platform/docker/compose/compose.star", "generate_backend_compose_entry")

manifest = {"appType": "backend", "stack": "shop", "port": 4000, "appName": "orders-api"}
resource = {"name": "orders-api", "_resource_path": "services/shop/orders-api"}
manifest["_resource_path"] = resource["_resource_path"]

entry = generate_backend_compose_entry("services/shop", "orders-api", resource, manifest)
fail("OUTPUT\n" + entry)  # fail() is how a Tiltfile prints a string without Docker
```

```bash
tilt alpha tiltfile-result -f try.Tiltfile
```

The generated Compose entry is printed after `Error in fail: OUTPUT`. Paths in `load()` are relative to the Tiltfile, so keep it in the repo root. Change the manifest, run it again, and compare. The same idea is how the Starlark tests in `cli/src/commands/__tests__/` (for example `stack-routers.test.ts`) check generator output; copy one when you add a test.

## Change the engine or service discovery

1. For Tilt resource orchestration, begin in `engine/topologies/tilt/resources/`.
2. For Docker, networking, or persisted state, begin in `engine/topologies/platform/`.
3. For manifest scanning and dependency graphs, begin in `discovery/`.
4. Search for the affected output file or manifest field to find its generator and tests. The CLI tests include Starlark generator checks.
5. Check whether existing manifests and generated projects still work. Update schema, examples, or CLI docs when their behavior changes.
6. If the change spans contracts or several modules, write an [OpenSpec proposal](01-first-change.md#when-to-write-a-change-proposal) first.
7. **E2E:** engine and discovery changes reach every stack. Run the affected suites with `make test-e2e`, and add a case for the behavior you changed. See [Write an e2e test](05-write-e2e.md).

`engine/AGENTS.md` and other `AGENTS.md` files are agent-specific working notes. They can help explain local code, but check their paths and advice against current source and tests before using them as product documentation.

## Change documentation

1. Find the closest existing page and update it instead of starting another copy.
2. Use short headings, numbered steps, and copyable commands.
3. Check relative links from the file you edited.
4. Run only relevant checks. For a docs-only change, check the links and commands you changed; you do not need to run the CLI test suite.
5. **E2E:** none needed for docs. If you changed a command example, run that command.
