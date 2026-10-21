## ADDED Requirements

### Requirement: Interactive picker, React default

Interactive frontend creation SHALL offer the registered Vite SPA ids. Non-interactive creation without `--framework` SHALL keep generating React. `--framework` remains frontend-only and case-insensitive.

#### Scenario: Prompt selects Vue

- **WHEN** a user creates a frontend resource interactively and chooses `vue`
- **THEN** `service.json` contains `"framework": "vue"`
- **AND** generated files come from the Vue provider

#### Scenario: Omitted flag stays React

- **WHEN** a user runs `flisk resource web --type frontend --stack app` without `--framework`
- **THEN** `service.json` contains `"framework": "react"`
