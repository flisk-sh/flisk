## Consistency rules (strict)

1. **One catalog: `INFRA_PRESETS`.** `flisk tool add mailpit` runs the same code path as `flisk resource mailpit --type mail --framework mailpit`. Every kind of infrastructure is a key of `PRESET_RESOURCE_TYPES` (pre-refactor, PR 1); a new kind is one entry there plus its presets, never a new branch in `resource.ts`. No new service.json fields, no hand-written Compose (AGENTS.md ground rule). Test: the produced `service.json` equals the one `flisk resource` produces.
2. **Existing flag names only.** `--stack`, `--port`, `--image`, `--health-path`, `--json`, `--yes` keep their meaning from `flisk resource`. New flags are only `--for`, `--app-type`, `--framework`, `--persist`/`--no-persist`. Check `flisk resource --help` before adding any other (no aliases).
3. **`--json` and `--yes` never prompt**; every prompt has a default; same envelope shape and `FliskError` codes style as `resource` (`TOOL_UNKNOWN`, `TOOL_CONSUMER_NOT_FOUND`, `TOOL_PORT_IN_USE`).
4. **Ports** come from the BYO range through the same allocator as `flisk resource` (`flisk-ports`), never hard-coded.
5. **Persistence** uses a named volume named by the same rule as other generated volumes; never relabel (see compose-volume-label memory).

## Prompt order

1. tool (list from catalog) - or positional argument
2. `--for <resource>`: which resource consumes it; the answer sets `--app-type` and `--framework` from that resource's service.json, so they are asked only when the consumer does not exist yet or `--for` is absent
3. app type (backend, frontend, worker, agent, mcp) and framework (from `flisk resource --frameworks`): choose the **env dialect** of the injected variables, e.g. a Next.js frontend gets `NEXT_PUBLIC_*`, a Python backend gets `S3_ENDPOINT_URL`, a Node one `SMTP_URL`
4. persist? (default yes for minio, no for mailpit and stripe-mock)
5. port (default: next free)

## Preset shape (existing `InfraPreset`)

```ts
mailpit: {
  type: MAIL_RESOURCE_TYPE,
  description: "Mailpit SMTP server and inbox (Resend, SendGrid, Postmark, SES stand-in)",
  image: "axllent/mailpit:<pinned>",
  port: 1025,
  healthCheck: { port: 1025 },
  dataPath: "/data",
  uiPorts: [8025],
  provides: { SMTP_URL: "smtp://{name}:1025", SMTP_HOST: "{name}", SMTP_PORT: "1025" },
}
```

Per-dialect env names (`NEXT_PUBLIC_*`, Python spellings) are added by `flisk tool add` in PR 3, not in the preset.

## CI graph

`pr-legs.mjs` (extended, not duplicated) reads `git diff --name-only`; a variant lists the files only it checks in `suite.json` `inputs`, the way a turbo task lists inputs, and `--base` lets it read old and new content so a comment or description selects nothing:
- a tool's variant `inputs` (its `INFRA_PRESETS` file, fixtures, `tests/e2e/tools/<id>/**`) select every leg of tool `<id>` and nothing else;
- `cli/src/tools/dialects/<appType>.ts` selects that appType across all tools;
- shared files (`cli/src/commands/tool.ts`, `cli/src/tools/registry.ts`, `tests/e2e/lib/**`, the workflow) select all legs;
- docs and unrelated code select nothing.
The matrix is tool x appType x framework, pruned by `axes.json` compatibility. Each leg: `flisk tool add` -> `flisk up` -> tool health 200 -> consumer healthy with the env injected -> functional case (mail sent and read through Mailpit API; object put and get through S3 on MinIO; PaymentIntent created against stripe-mock) -> `flisk down`.
