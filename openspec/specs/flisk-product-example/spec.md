## ADDED Requirements

### Requirement: Default example demonstrates a representative product stack
The default `flisk project example` output SHALL include one Hono API, Postgres, one worker on NATS or an already-supported queue, one Vite frontend, and Traefik routes for the UI and API. A UI or curl write path SHALL create a row that the worker can observe.

#### Scenario: Example write path reaches the worker
- **WHEN** a user writes through the UI or curl endpoint routed by Traefik
- **THEN** the API stores a row in Postgres and the worker can observe that row

#### Scenario: Example routes expose UI and API
- **WHEN** the example stack is running
- **THEN** Traefik routes requests to both the frontend and API

### Requirement: Ubuntu example E2E is a required bounded CI gate
An Ubuntu `example-e2e` CI job SHALL run doctor, start the example stack, verify health and the routed write path, and stop the stack. The job SHALL have an eight-minute maximum execution budget and SHALL be required and green on main.

#### Scenario: Ubuntu example E2E passes
- **WHEN** `example-e2e` runs against a valid build on Ubuntu
- **THEN** doctor passes, health and routed write-path checks succeed, and the stack is stopped within eight minutes

#### Scenario: Example write path fails
- **WHEN** the API write or worker observation fails through Traefik
- **THEN** `example-e2e` fails and does not pass the main-branch gate

### Requirement: The 100-service ERP system is labeled as a fixture
README and benchmark documentation that refer to the 100-service `tdk-erp-system` SHALL identify it as a fixture bench, not an ERP product.

#### Scenario: Documentation describes the benchmark
- **WHEN** documentation mentions the 100-service bench or `tdk-erp-system`
- **THEN** it labels the system as a fixture bench
