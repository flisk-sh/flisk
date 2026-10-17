## 1. CLI Provider Implementation

- [ ] 1.1 Create `cli/src/backend-languages/node.ts` defining `nodeBackendProvider` with `package.json`, `src/index.js`, and `tests/health.test.js`.
- [ ] 1.2 Register `node` in `cli/src/backend-languages/registry.ts`.
- [ ] 1.3 Update help text for `--language` in `cli/src/commands/resource.ts`.

## 2. Starlark Engine Support

- [ ] 2.1 Add `node` to `PROVIDER_OWNED_LANGUAGES` and `LANGUAGE_REQUIRED_FILES` in `engine/topologies/platform/docker/dockerfile/language_dockerfile.star`.
- [ ] 2.2 Add `_NODE` Dockerfile template with multi-stage `base`, `test`, and `production` targets in `language_dockerfile.star`.
- [ ] 2.3 Update `engine/topologies/tilt/generators/validators.star` for Node required files.
- [ ] 2.4 Update `engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star` to handle Node live reload.

## 3. Testing and Verification

- [ ] 3.1 Add scaffold test in `cli/src/commands/__tests__/resource-backend-languages.test.ts`.
- [ ] 3.2 Verify Bun baseline hashes remain identical.
- [ ] 3.3 Verify schema contract and doctor wiring tests pass.
- [ ] 3.4 Build CLI and run full test suite.

## 4. Documentation

- [ ] 4.1 Update `cli/README.md` to document `--language node`.
- [ ] 4.2 Update `docs/backend-language-providers.md` with Node provider details.
- [ ] 4.3 Update `docs/cheat-sheet.md` and `docs/service-json.md`.
