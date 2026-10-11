## Why

Helm users can spend days reading TDK and still mistake its generated local files for a cluster deployment platform. Make the local inner loop and the unchanged Helm production path understandable within 60 seconds, with the README and Helm companion guide sufficient for a reviewer to confirm the boundary within ten minutes.

## What Changes

- Lock the primary copy: “TDK runs many services on your machine with Docker + Tilt. Helm still deploys the cluster.” Use it in the README, npm description, website hero, and GitHub About.
- Put when-not-to-use guidance before features, shorten README onboarding, and move benchmarks, repository maps, premium detail, and telemetry into linked docs.
- Add `docs/with-helm.md`, an ownership diagram and conceptual mapping, a same-image app-template example, and explicit Helm / Flux / Argo handoff guidance.
- Add small one-backend and companion Helm examples; retain landscape examples.
- Lead configuration documentation with annotated manifests, authoritative schema links and editor associations, then generators; document doctor and config verification as distinct checks.
- Align website navigation, comparison content, CLI help, doctor introduction, contributor guidance, and issue templates with the local development boundary.
- Defer the optional P2 `tdk export helm` command to a separate follow-up. This change ships a handwritten values example only and documents export guardrails without exposing an unimplemented command.

## Capabilities

### New Capabilities

- `local-inner-loop-positioning`: Consistent first-screen product contract, short onboarding, CLI scope messaging, and contributor/issue guidance.
- `helm-companion-documentation`: Explicit ownership and image handoff to existing Helm charts, a pinned app-template documentation example, and reviewer comprehension criteria.
- `schema-first-onboarding`: Annotated configuration and editor schema guidance paired with a minimal, runnable single-service example.

### Modified Capabilities

None. Existing runtime, manifest validation, doctor checks, exit codes, and generated-file contracts remain intact; new requirements concern documentation and introductory copy.

## Impact

Core repository: `README.md`, root and CLI npm metadata where published, `docs/`, `examples/`, CLI help/doctor introductions, root contributor instructions and `.github/` templates. Companion repository `tdk-landscape/tdk-website`: hero, configuration documentation, comparisons, and navigation, delivered through its own implementation branch. GitHub About requires a repository settings update at implementation time. No new runtime dependencies, production Kubernetes generators, cluster requirement, service-manifest validation changes, or default Helm integration. Add an editor-assistance schema for `.tdk/project.json` without changing the CLI runtime contract.
