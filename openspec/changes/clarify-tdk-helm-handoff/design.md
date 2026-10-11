## Context

The core README already identifies TDK as local development and mentions Helm, but badges, scale results, topology detail, and generator output dominate discovery. A Helm user needs a clear boundary and a minimal example before a landscape. The separate website repository is a Jekyll site with `index.html`, `docs/`, `compare/`, and `_data/` navigation; its edits require a companion implementation branch. This proposal lives in the core repository worktree and does not edit the website checkout.

Existing contracts include service-manifest schema validation, doctor environment checks, and generated project portability. Keep their behavior intact. Consult `engine/schemas/service-schema.json` and the actual project schema/validation implementation when writing editor guidance; do not assume YAML comment syntax is valid in JSON.

## Goals / Non-Goals

**Goals:**
- Establish the local inner loop in the first sentence and show where existing Helm workflows resume.
- Let a Helm reviewer understand the purpose in 60 seconds and answer the four boundary questions after at most ten minutes reading two documents.
- Ship actionable, schema-first onboarding using one backend and the same image in a Helm example.
- Synchronize core documentation, metadata, CLI introductions, website copy, and contributor boundaries.

**Non-Goals:**
- No production chart factory, default Kubernetes manifest generation, cluster requirement for `tdk up`, or replacement of Helm, Kustomize, Flux, or Argo.
- No runtime schema changes or copying app-template YAML into `service.json`.
- No export command in this release; no production-readiness claim for examples.
- No redesign of the website, modification of doctor semantics, or automatic issue closure.

## Decisions

### 1. One canonical message with subordinate copy
Use exactly “TDK runs many services on your machine with Docker + Tilt. Helm still deploys the cluster.” as the first product sentence on README, published npm metadata, website hero, and GitHub About. Retain the requested About description “Local microservice inner loop. Not a Helm chart.” as subordinate wording where space permits. Website supporting copy: “No cluster on the machine. Helm stays for prod.” CLI help and human-readable doctor output identify the local inner loop before detail. Preserve machine-readable doctor output and existing exit codes. This resolves the brief's differing About suggestions by keeping the canonical sentence primary.

Alternative: independently phrased descriptions are shorter but recreate the current ambiguity. Do not advertise generated file counts as user value.

### 2. A sectioned README with an unmistakable first sentence
Keep the canonical one-sentence positioning at the top: “TDK runs many services on your machine with Docker + Tilt. Helm still deploys the cluster.” Do not repeat the detailed Helm boundary or add a second architecture diagram in the README; `docs/with-helm.md` owns the service-manifest/values distinction and production workflow. Keep product-framework details brief: identify Bun/TypeScript as the default starter without making TDK sound like a Node framework.

Use the README as a useful GitHub landing page in this order: title and one-liner, the existing npm/CI/E2E/security/license badge row, Installation with npm and the prebuilt binary, exactly five runnable Quick start commands, when-not-to-use guidance, Docs links, requirements/support, then contributing and license. Keep architecture, feature detail, benchmark methodology, and extended comparisons in focused Markdown docs, linked from a new docs index.

Alternative: a short stub hides how to install and evaluate the CLI; restoring every architecture and benchmark detail to the root README recreates the old wall of text.

### 3. Helm guide describes ownership, not translation
`docs/with-helm.md` is titled “TDK + Helm (they are not alternatives)”. Use two paths:

```text
Machine: service.json -> tdk up -> Docker + Tilt + Traefik *.localhost
Cluster: same image -> Helm / Flux / Argo -> Deployment + Service + Ingress
```

TDK owns scaffolding, local Dockerfile layering, Tilt, local proxy/Postgres, and stack subsets. Helm/cluster configuration owns replicas, probes, ingress class, PVCs, node selectors, IRSA, and HPA. Include all requested conceptual rows: appName, appType, port, healthCheckPath, dependsOn, local Traefik host, and local Postgres. Label them as conceptual: local ordering does not translate automatically to hooks, appType does not establish a production workload type, and runtime behavior depends on the chosen chart and version.

Show a real backend scaffold command and its manifest, then one handwritten app-template values file using the same explicit image repository and tag. Verify the current official bjw-s documentation at implementation time, pin a specific chart version, link its matching docs/schema, and provide render/lint commands. Keep environment values non-secret. Do not invent production ingress, PVC, replicas, resource sizing, security settings, or identity; explain these as deployment decisions. Document frontends' local nginx/Traefik boundary and workers' need for an explicit job/cronjob decision without manufacturing HTTP services.

Alternative: exact field translation would falsely imply deployment equivalence.

### 4. Minimal examples and schema guidance use real contracts
Keep `tdk project example`. Add `examples/one-backend/` with one authored `service.json` plus the minimum source/project files needed to run it, setup instructions, `tdk up`, expected URL, curl/health check, and cleanup. Generated local files are obtained by documented CLI commands; do not imply a manifest alone supplies application source. Add `examples/one-backend-helm/` with the same image's `values.yaml` and README; its Helm example is documentation, not a supported production chart. State that a machine-only image must be published to a registry accessible to the cluster by the user's existing CI/build flow.

On the website configuration page show annotated JSON first (annotations outside JSON or in a separate explanation), then generator details. For both `service.json` and `.tdk/project.json`, verify supported `$schema` fields or document editor `json.schemas` associations with authoritative schema paths. Test editor examples through the actual validator so `$schema` guidance does not change required-field behavior. Present `tdk config verify` accurately as checking generated project files against `.tdk/project.json`; present `tdk doctor` as environment readiness and service checks. Do not call either command a production Helm values linter or imply `config verify` validates `service.json`.

Alternative: a whole landscape hides the smallest working contract; YAML-style schema comments would produce invalid JSON.

### 5. Export remains a separate P2 decision
Required implementation stops at handwritten Helm values. Do not add a command stub or claim `tdk export helm` works. Document the possible future interface `tdk export helm <resource> [--chart app-template] [--out ./deploy/values.yaml]` as deferred design only here. A follow-up proposal must settle repository/tag provenance, project defaults, explicit worker type/schedule semantics, output safety, and chart-version compatibility. It must map only declared image/env/port fields, never synthesize deployment policies, and require backend/frontend/worker golden fixtures plus a help warning that output is a starting point rather than a supported production chart. An unknown worker schedule must remain a note, not an invented cronjob.

Alternative: implementing P2 with docs delays the primary comprehension fix and introduces unresolved production semantics.

### 6. Coordinate external surfaces explicitly
Core tasks modify only the core worktree. Website tasks require an isolated branch/worktree in `tdk-website`; locate its contributor instructions before edits. Add a Helm/With Kubernetes navigation item next to Quickstart, a Helm/app-template comparison column, and synchronized config/hero copy. Update GitHub About during authorized implementation with repository access; if access is missing, record the exact pending text and owner, rather than marking that task complete. Root `AGENTS.md`/contributor guidance prohibits default Kubernetes generators and asks generator changes to state local-only or export-only intent. Issue forms ask local-dev versus cluster-deploy scope and provide Helm pointers; maintainers decide closure.

## Risks / Trade-offs

- [Website and About can lag core docs] -> Keep explicit companion tasks and verify all surfaces before declaring the rollout complete.
- [App-template schema evolves] -> Pin chart version and validate sample values against its matching schema and rendering tools at implementation time.
- [A compact entry page can hide requirements] -> Keep installation, a runnable quick start, platform limitations, and a documentation index on the README.
- [Same image sounds like automatic publication] -> Explain user-owned image build/push and cluster registry access.
- [Reviewer comprehension is subjective] -> Use a timed reader exercise with a Helm user; record answers and revise unclear copy.
- [Editor schema hints can affect validation] -> Prefer editor associations when in-file hints are unsupported; retain existing validation contracts.

## Migration Plan

Deliver core copy and guide first, then examples and schema guidance, then companion website and GitHub settings. Run documentation link checks, existing relevant CLI checks, an actual local backend smoke, and pinned Helm lint/template validation without applying to a cluster. Record a timed comprehension review. Roll back by reverting documentation/copy commits and restoring About text; no persisted data or runtime migration is required.

## Open Questions

No scope decision blocks the required documentation work. During implementation verify the pinned app-template version, supported project schema association, runnable five-command path, and repository-settings access. Any future export requires a separate proposal and does not block this change.
