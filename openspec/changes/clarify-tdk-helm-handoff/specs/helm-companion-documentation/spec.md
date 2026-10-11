## ADDED Requirements

### Requirement: Helm companion guide establishes ownership
`docs/with-helm.md` SHALL be titled “TDK + Helm (they are not alternatives)” and SHALL diagram the machine path from `service.json` through `tdk up` to Docker + Tilt + Traefik `*.localhost`, alongside the cluster path from the same image through Helm / Flux / Argo to Deployment + Service + Ingress. It SHALL distinguish TDK scaffolding, local Dockerfile layering, Tilt, local proxy/Postgres, and stack subsets from cluster replicas, probes, ingress class, PVCs, node selectors, IRSA, and HPA. It SHALL explicitly preserve existing bjw-s app-template, official, and homegrown charts and Kustomize workflows.

#### Scenario: Helm user locates production ownership
- **WHEN** a user reads the companion guide
- **THEN** they can locate the manifest-to-local-runtime boundary and see that existing charts and cluster delivery remain user-owned

### Requirement: Mapping is conceptual and complete
The guide SHALL map appName to release/controller identity, appType to workload type, port to chart service ports, healthCheckPath to probe paths, dependsOn to deployment ordering considerations, local Traefik hosts to Ingress/Gateway hosts, and local Postgres to an external DB or chart dependency. It SHALL label these relationships conceptual and SHALL explain that local dependency order, frontend routing, and application types do not automatically establish cluster hooks, ingress settings, job schedules, or deployment topology.

#### Scenario: Reader compares dependsOn and local routing
- **WHEN** a reader consults the mapping table
- **THEN** they see deployment ordering and ingress as explicit cluster decisions rather than direct translations of local settings

### Requirement: Same-image app-template example is pinned and honest
The guide and `examples/one-backend-helm/` SHALL include a minimal handwritten app-template `values.yaml` for the backend used in the local example, with a shared explicit image repository/tag and HTTP port. They SHALL target `oci://ghcr.io/bjw-s-labs/helm/app-template`, pin an exact chart version verified against official documentation during implementation, link matching schema/docs, and document lint/render commands. They SHALL explain user-owned image publication and registry access. They SHALL leave ingress, PVCs, replicas, sizing, security, and identity to the user's deployment decisions and SHALL state that the sample is not a supported production chart. Worker guidance SHALL require an explicit job/cronjob decision and SHALL NOT manufacture an HTTP Service or schedule.

#### Scenario: Reader renders the companion values
- **WHEN** a user follows the documented validation command for the pinned chart
- **THEN** the values validate and render with the documented backend image and port without claiming a complete production deployment

### Requirement: Website exposes Helm alongside onboarding
Website navigation SHALL expose Helm or With Kubernetes next to Quickstart. Website comparisons and `docs/compare-honest.md` SHALL explicitly contrast TDK local generation/run behavior with Helm/app-template Kubernetes rendering, with Helm discussed before Garden/Skaffold in the core comparison page. Website SHALL link the canonical companion guide or an equivalent synchronized page.

#### Scenario: Website reader seeks Helm guidance
- **WHEN** a reader visits navigation or comparisons
- **THEN** they can directly reach Helm guidance and identify which tool runs the local stack and which renders cluster resources

### Requirement: Documentation-only handoff does not promise export
This change SHALL ship the handwritten values handoff before any export feature. Published docs SHALL explain continuing to write Helm values by hand and SHALL NOT present `tdk export helm` as available. A future exporter SHALL require its own implementation proposal and validation.

#### Scenario: Reader chooses the handoff path
- **WHEN** a reader reaches the guide's decision section
- **THEN** they find a supported documentation path for handwritten values without a command stub or unavailable-command instruction

### Requirement: Timed reviewer exercise confirms comprehension
Acceptance SHALL include a recorded exercise with a Helm-using reader: the purpose SHALL be clear after a 60-second README scan, and after no more than ten minutes reading only README and the companion guide the reader SHALL correctly answer what `tdk up` starts and where, what TDK does not replace, where `service.json` stops and `values.yaml` starts, and whether bjw-s app-template can remain in production. The final answer SHALL be yes.

#### Scenario: Helm reviewer completes the exercise
- **WHEN** the reviewer reads the two documents within the stated time budget
- **THEN** the review record contains four correct boundary answers and the measured reading times
