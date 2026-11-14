## Why

"Build me a SaaS" should work in one prompt with zero accounts. Today an agent can scaffold `backend`, `frontend`, `worker`, `database` and `agent` resources, but every other box of a typical SaaS stack (mail, file storage, payments, then auth, search, analytics) needs an external account, a key and hand-written Compose. Brook's X thread (2026-11-12) put the gap at ~38% against Grok's estimate; this change closes the first three boxes with local emulators.

Zachman interview answers (2026-11-12):

| Question | Answer |
|---|---|
| Who | Solo builder with an AI agent (Claude Code, Cursor) |
| What | Local emulators and fakes, not real-service wiring |
| Where | `flisk tool add`, a guided front door over `flisk resource --type <kind> --framework <id>`: the infrastructure presets that already exist (`cli/src/utils/infra-presets.ts`) |
| When (CI) | Full matrix of tool x appType x framework, launched only for the tools whose files changed |
| Why | Success metric: a stack of 8+ resources is healthy from one prompt with zero accounts |
| How | Prompts reuse what `flisk resource` already asks; every prompt has a flag; `--json`/`--yes` never prompt |

## Findings before the work

MinIO already ships (`--type database --framework minio`, `INFRA_PRESETS` with `provides` env injection through `dependsOn`), as do Redis, Qdrant, MLflow, MySQL, MongoDB, ClickHouse, NATS and RabbitMQ. A second catalog (`tool.json`) would duplicate it. So the work is: pre-refactor the type table, add mail and payment as types in it, then put `flisk tool add` on top.

## Sequence

1. **Pre-refactor (PR 1, this change's first PR).** One table of preset types (`PRESET_RESOURCE_TYPES` in `cli/src/types/index.ts`) replaces the hard-coded `database`/`queue` checks in `resource.ts`, completions, the create catalog and the MCP description. MinIO moves from `--type database` to a new `--type storage`; `--type database --framework minio` and `--type minio` now point at `--type storage --framework minio`. Existing service.json files are unchanged (they record `appType: bring-your-own`, `framework: minio`).
2. **Mail and payment (PR 2).** `--type mail` (`mailpit`, default) and `--type payment` (`stripe-mock`, default): one entry each in `PRESET_RESOURCE_TYPES` and `INFRA_PRESETS`, nothing else.
3. **`flisk tool add` (PR 3).** The guided command below, built on the same presets.
4. **Tool CI graph (PR 4).**

## What Changes

- Add `flisk tool add <tool>` and `flisk tool list [--json]` (MCP: `tool_add`, `tool_list`). A tool is an `INFRA_PRESETS` entry; `flisk tool add` creates it through the `flisk resource` path and adds it to the consumer's `dependsOn`, so the consumer gets its `provides` env.
- Prompts, in this order, each with a flag and a default so `--yes` never asks: `--name`, `--stack`, `--for <resource>` (consumer: gets the env block and `dependsOn`), `--persist/--no-persist`, `--port`. `--app-type` and `--framework` describe the consumer and choose the env dialect (see design.md).
- First wave: `mailpit` (`--type mail`), `minio` (`--type storage`, exists), `stripe-mock` (`--type payment`).
- CI: a `tools` e2e group. A tool graph (`tests/e2e/lib/tool-legs.mjs`, built like `pr-legs.mjs`) maps changed files to the tool x appType x framework legs they affect. Shared files select every leg; nightly, merge queue and release run the full matrix.

Out of scope: real-provider wiring (`--live`), Auth/Search/Analytics tools (scored below, next wave), any Kubernetes output.

## ICE scoring (Impact, Confidence, Ease, each 1-10; ICE = I x C x E)

| Category | Emulator | I | C | E | ICE | Wave |
|---|---|---|---|---|---|---|
| Mail (Resend/SendGrid/Postmark/SES) | Mailpit | 9 | 9 | 9 | 729 | 1 |
| Storage (S3/R2/GCS/Supabase) | MinIO | 8 | 9 | 8 | 576 | 1 |
| Payment (Stripe) | stripe-mock | 9 | 7 | 8 | 504 | 1 |
| Search | Meilisearch / Typesense | 6 | 8 | 8 | 384 | 2 |
| Analytics | PostHog / Plausible | 5 | 5 | 4 | 100 | 3 |
| Auth (Clerk/Auth0) | Keycloak / Authentik | 9 | 5 | 3 | 135 | 2 (needs per-framework SDK wiring) |
| Monitoring | Sentry self-hosted | 4 | 4 | 2 | 32 | 3 (heavy) |
| Integrations | n8n | 5 | 7 | 6 | 210 | 2 |

## Capabilities

### New Capabilities
- `tool-add`: the `flisk tool` commands, catalog format and prompts.
- `tool-emulator-ci`: the tool matrix and the changed-files graph.

### Modified Capabilities
None.

## Impact

- PR 1: `cli/src/types/index.ts`, `cli/src/utils/infra-presets.ts`, `cli/src/commands/resource.ts`, completions, create catalog, MCP description, docs/byo.md, service schema descriptions, the BYO infra and enigma36 e2e scripts.
- Later: `cli/src/commands/tool.ts`, `cli/src/tools/dialects/`, `tests/e2e/tools/<tool>/`, `tests/e2e/lib/tool-legs.mjs`, `.github/workflows/e2e-tools.yml`.
- Changed: `tests/e2e/axes.json` (new `tool` axis), `tests/e2e/lib/suite-matrix.mjs`, MCP tool list, `docs/agents/`, completion candidates.
- Golden images are not touched; tool images are pinned in `INFRA_PRESETS`.
