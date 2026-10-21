## ADDED Requirements

### Requirement: Registry is the inventory

The CLI SHALL treat `cli/src/frontend-frameworks/registry.ts` as the only supported Vite SPA set. `flisk resource --frameworks` SHALL print each id, label, and kind. A framework id MUST NOT appear as supported unless that provider is registered and `scripts/verify-frontend-frameworks.sh` has passed it.

#### Scenario: List registered adapters

- **WHEN** a user runs `flisk resource --frameworks`
- **THEN** the output includes `react`, `vue`, `svelte`, `preact`, `lit`, `solid`, `qwik`, `tanstack-router`, and `vanilla` as `vite-spa`
- **AND** does not list `next`, `nuxt`, `sveltekit`, `astro`, or `angular` as `vite-spa`

#### Scenario: Unverified provider is not documented as supported

- **WHEN** a provider is registered but absent from the last verify script pass
- **THEN** docs and `--frameworks` mark it unverified rather than supported
