## ADDED Requirements

### Requirement: Local-start positioning
Every public first impression SHALL say that TDK CLI starts services on a developer's machine. It SHALL identify one `service.json` per service and `tdk up` as the local start flow. It SHALL NOT present the product as a production deploy, a hand-maintained Compose file, or machine Kubernetes.

#### Scenario: Homepage first screen
- **WHEN** an engineer opens the homepage
- **THEN** the H1 is `Start your services on your machine.`
- **AND** the subhead is `Not a deploy. Not a Compose file. One service.json, then tdk up. No Kubernetes on the machine.`
- **AND** proof says `14 services healthy in 4.6s on a 16 GB M1 once images exist.`

### Requirement: One buyer
Public pages SHALL address an engineer or tech lead who already runs several services and is tired of local Compose, Dockerfiles, and a week of setup. They SHALL NOT lead with a CTO calculator or target people who do not operate services.

### Requirement: Product naming
Public titles, About fields, npm metadata, and social copy SHALL use `TDK CLI`; titles SHALL NOT use bare `TDK` or `Tilt Development Kit`. Organization identity SHALL retain `tdk-landscape` next to the product name. Repository names and `@tdk-landscape/tdk-cli-core` SHALL remain unchanged.

#### Scenario: npm package title
- **WHEN** a reader opens `@tdk-landscape/tdk-cli-core`
- **THEN** the title/description reads `TDK CLI — start services on your machine.`
- **AND** the package name remains unchanged

### Requirement: First-screen exclusions
The H1, title, About, and first paragraph SHALL omit Tilt, Starlark, PSR, golden L1–L4, Infisical, Traefik, orchestration, deployment language, `docker-compose`, and “built on Tilt.” The required subhead's words `Not a deploy` are permitted. Tilt MAY appear once in How it works or Requirements using: `Docker runs the containers. Tilt runs the dev loop. TDK CLI writes that config.`

### Requirement: Evidence and fixture caveats
The 14-service proof SHALL state that images already exist. Any 100-service public claim SHALL say in the same sentence that these are generated `/health` services in a fixture, not an ERP product.

### Requirement: Free-first offer
The free MIT CLI SHALL be presented as the product. Premium SHALL be described only as $19 per developer per month for extras and SHALL NOT appear in the hero. Pricing SHALL say most teams should stay on free.

### Requirement: Calculator placement
The homepage SHALL NOT contain the ROI calculator. The calculator SHALL remain available on `/waiting`.

### Requirement: Approved scope replies
For a deploy misread, reply: `This is not a production deploy. tdk up starts services, a database, and a proxy on your machine. No cluster. Helm still deploys production.`

For a Compose misread, reply: `Not a Compose file you maintain. One service.json per service, then tdk up. If Compose already works for you, skip TDK CLI.` Do not explain Tilt in either reply.

### Requirement: Preserve shipped work
The homepage H1/subhead and `/waiting` calculator placement, core public-copy changes in #203, and README SVG restoration in #205 SHALL remain intact. `codex/tdk-cli-public-copy` SHALL NOT be reused because it has no common ancestor with `main`.
