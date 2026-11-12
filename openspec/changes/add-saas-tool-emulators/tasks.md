## 0. Pre-refactor (PR 1)
- [x] 0.1 `PRESET_RESOURCE_TYPES` table in `cli/src/types/index.ts`; `--type storage`
- [x] 0.2 `isPresetResourceType` / `isInfraResourceType` / `defaultFrameworkOfType` replace every `=== QUEUE_RESOURCE_TYPE` check
- [x] 0.3 MinIO moves from `database` to `storage`; old spellings name the new one
- [x] 0.4 Completions, create catalog, MCP description, docs/byo.md, schema descriptions, e2e scripts
- [x] 0.5 Unit tests updated and added (`--type storage` default, old spelling hint, listing)

## 0b. Mail and payments presets (PR 2)
- [ ] 0b.1 `--type mail --framework mailpit`, `--type payments --framework stripe-mock` (table entry + preset)
- [ ] 0b.2 BYO infra e2e cases: SMTP send read back over Mailpit API; PaymentIntent on stripe-mock

## 1. Catalog and command
- [ ] 1.2 `cli/src/tools/dialects/` env names per appType/framework
- [ ] 1.3 `cli/src/commands/tool.ts` (`add`, `list`) reusing the resource creation path; flags per design.md
- [ ] 1.4 MCP tools `tool_add`, `tool_list`; completion candidates; `docs/agents/` and skill text
- [ ] 1.5 Unit tests: parity with `flisk resource`, no prompt on `--yes`/`--json`, errors, dialects

## 2. CI
- [ ] 2.1 `tests/e2e/tools/<tool>/{suite.json,run.sh}` with the functional cases
- [ ] 2.2 `tests/e2e/lib/tool-legs.mjs` + unit tests for the four graph scenarios
- [ ] 2.3 `tool` axis in `axes.json`; `suite-matrix.mjs` expands tool x appType x framework
- [ ] 2.4 `.github/workflows/e2e-tools.yml` (plan -> legs -> gate), modeled on `e2e-resource-types.yml`
- [ ] 2.5 Add the gate to required checks (`required-checks-drift.yml`)

## 3. Verify
- [ ] 3.1 `npm --prefix cli run build`, `check:dist`, lint, `make scores`
- [ ] 3.2 Evidence: a prompt-built stack of 8+ resources healthy with zero accounts
