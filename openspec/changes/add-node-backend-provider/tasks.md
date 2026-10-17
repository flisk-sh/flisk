## 1. CLI Provider Implementation

- [x] 1.1 Create `cli/src/backend-languages/node.ts` defining `nodeBackendProvider` with `package.json`, `src/index.js`, and `tests/health.test.js`.
- [x] 1.2 Register `node` in `cli/src/backend-languages/registry.ts`.
- [x] 1.3 Update help text for `--language` in `cli/src/commands/resource.ts`.

## 2. Starlark Engine Support

- [x] 2.1 Add `node` to `PROVIDER_OWNED_LANGUAGES` and `LANGUAGE_REQUIRED_FILES` in `engine/topologies/platform/docker/dockerfile/language_dockerfile.star`.
- [x] 2.2 Add `_NODE` Dockerfile template with multi-stage `base`, `test`, and `production` targets in `language_dockerfile.star`.
- [x] 2.3 Update `engine/topologies/tilt/generators/validators.star` for Node required files.
- [x] 2.4 Update `engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star` to handle Node live reload.

## 3. Testing and Verification

- [x] 3.1 Add scaffold test in `cli/src/commands/__tests__/resource-backend-languages.test.ts`.
- [x] 3.2 Verify Bun baseline hashes remain identical.
- [x] 3.3 Verify schema contract and doctor wiring tests pass.
- [x] 3.4 Build CLI and run full test suite.

## 4. Documentation

- [x] 4.1 Update `cli/README.md` to document `--language node`.
- [x] 4.2 Update `docs/backend-language-providers.md` with Node provider details.
- [x] 4.3 Update `docs/cheat-sheet.md` and `docs/service-json.md`.
