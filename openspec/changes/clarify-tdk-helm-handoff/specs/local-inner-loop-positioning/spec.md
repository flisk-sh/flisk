## ADDED Requirements

### Requirement: Canonical product sentence across discovery surfaces
The README's first product sentence, published npm description, website hero, and GitHub About SHALL use “TDK runs many services on your machine with Docker + Tilt. Helm still deploys the cluster.” Website supporting copy SHALL state “No cluster on the machine. Helm stays for prod.” npm-facing onboarding SHALL retain skip guidance for users whose Helm setup already works. Discovery copy SHALL describe one manifest leading to a running local stack and SHALL NOT advertise generated file counts as the product value.

#### Scenario: Helm user encounters TDK
- **WHEN** a reader opens any primary discovery surface
- **THEN** the primary sentence identifies machine Docker + Tilt execution and preserves Helm's cluster role

### Requirement: README prioritizes fit and a short working path
README SHALL place when-not-to-use guidance before when-to-use guidance and features, with at most six combined fit bullets. It SHALL explicitly advise skipping TDK when Helm, Compose, or existing Tilt already supplies a working environment. Its opening sequence SHALL contain five verified onboarding commands followed by “How this sits next to Helm” and service schema links, before badges and detailed installation material. Benchmarks, monorepo maps, premium lists, and telemetry SHALL live in linked docs. Platform support and prerequisites SHALL remain readily reachable.

#### Scenario: Reader scans the entry sequence
- **WHEN** a reader scans the README opening
- **THEN** they encounter the canonical sentence, fit guidance, five commands, and Helm/schema links before badges or feature detail

### Requirement: CLI introductions declare local scope
Human-readable `tdk --help` and `tdk doctor` introductory text SHALL identify the local development inner loop and distinguish it from cluster deployment. Changes SHALL preserve command behavior, doctor checks, machine-readable output, and exit codes.

#### Scenario: User checks environment readiness
- **WHEN** a user runs doctor in human-readable mode
- **THEN** its introduction explains local environment readiness while existing diagnostics and failure statuses remain intact

### Requirement: Contributor and issue guidance preserve the boundary
Root agent/contributor guidance SHALL state that TDK does not emit Kubernetes manifests by default and that Deployment generators require an explicit export scope. Generator contributions SHALL declare local-only or export-only intent. Relevant issue forms SHALL ask whether the request concerns local development or cluster deployment and SHALL point cluster users to Helm; they SHALL NOT automatically close issues.

#### Scenario: Contributor proposes cluster generation
- **WHEN** a contributor reads generator guidance or files a cluster-deployment request
- **THEN** the guidance requires explicit export scope and provides a Helm pointer instead of treating cluster deployment as default TDK behavior
