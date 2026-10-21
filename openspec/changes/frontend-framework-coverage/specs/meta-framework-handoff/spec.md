## ADDED Requirements

### Requirement: Meta-frameworks hand off

The CLI SHALL NOT scaffold Next, Nuxt, SvelteKit, Astro, Angular, Remix, or TanStack Start as Vite SPA providers. A known meta-framework id SHALL fail before any files are written and SHALL print the bring-your-own command.

#### Scenario: Next is rejected with a handoff

- **WHEN** a user runs `flisk resource web --type frontend --framework next`
- **THEN** the command exits non-zero before writing a resource
- **AND** the error names the supported Vite SPA ids
- **AND** the error includes `flisk resource web --type bring-your-own`

#### Scenario: Unknown id still fails closed

- **WHEN** a user passes `--framework not-a-framework`
- **THEN** the command exits non-zero before writing a resource
- **AND** the error lists registered ids and does not invent a handoff
