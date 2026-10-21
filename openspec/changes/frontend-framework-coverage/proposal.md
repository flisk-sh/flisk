## Why

Flisk already has a frontend provider boundary (React default; Vue, Svelte, Preact, Lit, Solid, Qwik, TanStack Router, Vanilla registered). The gap is not “missing Angular.” It is that coverage is implicit: interactive create never offers a picker, `flisk resource --help` is the only inventory, meta-frameworks fail as unknown ids instead of a bring-your-own path, and `scripts/verify-frontend-frameworks.sh` checks HTTP 200, not render or hot reload.

Claiming every JS framework would break the shared Docker, nginx, Traefik, and generated Vite contract. Next, Nuxt, SvelteKit, Astro, and Angular own their own config and often a server. Those belong beside the SPA adapters, not inside them.

## What Changes

- Publish a supported-framework inventory from the registry: id, label, kind (`vite-spa` | `bring-your-own`), and the exact `flisk resource` invocation.
- Add an interactive framework picker for `--type frontend`. Default stays `react`. Non-interactive create without `--framework` stays React.
- Reject unknown ids with the inventory, plus a one-line bring-your-own hint when the id is a known meta-framework (`next`, `nuxt`, `sveltekit`, `astro`, `angular`, `remix`, `tanstack-start`).
- Add one documented bring-your-own recipe per meta-framework: create with that framework’s CLI, then `flisk resource <name> --type bring-your-own`. Do not generate their Vite or server config.
- Extend `scripts/verify-frontend-frameworks.sh` so a listed `vite-spa` id is not “supported” until it passes the existing Traefik check. Record render and hot reload as still out of scope.
- Do not add Next, Nuxt, SvelteKit, Astro, or Angular as SPA providers in this change.

## Capabilities

### New Capabilities

- `frontend-framework-inventory`: The CLI can list registered frontend frameworks and distinguish Vite SPA adapters from bring-your-own meta-frameworks.
- `frontend-framework-picker`: Interactive frontend creation can select a registered adapter without changing the React default.
- `meta-framework-handoff`: Known meta-framework ids fail with a bring-your-own command instead of a bare unknown-id error.

### Modified Capabilities

- `frontend-framework-adapters`: Unknown-id errors include the supported id list. Omitted `--framework` and legacy `service.json` still mean React. The Flisk runtime still does not depend on any UI framework.

## Impact

- Affected code: `cli/src/frontend-frameworks/registry.ts`, `cli/src/commands/resource.ts`, interactive prompts, `scripts/verify-frontend-frameworks.sh`.
- Affected docs: `cli/README.md`, `docs/frontend-framework-providers.md`.
- No change to Docker, nginx, Traefik, ports, or generated API/environment modules.
- No new runtime dependency. A new SPA adapter remains one provider PR, copied from React, registered in the inventory.
