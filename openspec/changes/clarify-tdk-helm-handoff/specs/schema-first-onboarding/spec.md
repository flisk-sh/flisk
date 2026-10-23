## ADDED Requirements

### Requirement: Configuration documentation starts with manifests
Website configuration documentation SHALL show an annotated, syntactically valid `service.json` before generator details, link its authoritative schema, and explain required fields using the real runtime contract. JSON annotations SHALL be external explanatory text rather than invalid JSON comments. Documentation SHALL distinguish `flisk config verify` (checking generated project files against `.tdk/project.json`) from `flisk doctor` (local environment readiness and service checks), and SHALL NOT claim either validates production Helm values or that `config verify` lints `service.json`.

#### Scenario: User reads configuration documentation
- **WHEN** a user opens the configuration page
- **THEN** they see the manifest, field explanations, and schema before generator internals and can identify the appropriate validation command

### Requirement: Editor schema instructions support both manifests
Documentation SHALL provide verified schema/editor associations for `service.json` and `.tdk/project.json` using supported `$schema` values or equivalent editor configuration. Examples SHALL be accepted by existing validators and SHALL NOT change required schema versions, required fields, or unknown-field preservation behavior. If an in-file hint is unsupported, documentation SHALL use an editor association instead.

#### Scenario: User enables JSON schema completion
- **WHEN** a user follows the documented editor configuration for either manifest
- **THEN** the editor resolves the matching schema and the manifest continues to pass existing CLI validation

### Requirement: One backend is a runnable standalone introduction
`examples/one-backend/` SHALL provide a single authored service manifest and the minimal source/project setup needed to run one backend, with verified setup commands, prerequisites, `flisk up <stack>`, its actual `*.localhost` URL, a successful curl/health request, and cleanup instructions. It SHALL avoid requiring a Kubernetes cluster and SHALL retain existing landscape examples. The companion Helm example SHALL reference the same application's image identity.

#### Scenario: User boots the minimal example
- **WHEN** a user follows the example on a supported host with documented prerequisites
- **THEN** one backend runs on Docker + Tilt, curl receives the documented successful response through its local route, and cleanup removes the example's running local resources
