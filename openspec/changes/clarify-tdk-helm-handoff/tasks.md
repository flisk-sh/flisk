## 1. Confirm documentation contracts

- [x] 1.1 Verify current project/resource/up/cleanup syntax and choose five runnable README onboarding commands; identify the existing backend template, local URL, and health endpoint.
- [x] 1.2 Inspect authoritative service and project schemas/validators and verify supported `$schema` hints or editor associations without changing existing validation behavior.
- [x] 1.3 Verify official bjw-s app-template documentation, select an exact chart version, and record matching schema/docs and OCI chart reference for the example.

## 2. Establish core positioning

- [x] 2.1 Rewrite README opening with the exact canonical sentence, when-not-to-use before when-to-use (six bullets combined maximum), five commands, Helm/schema links, then badges/install/status.
- [x] 2.2 Move benchmark, monorepo map, premium detail, and telemetry content into linked docs while preserving honest limits and platform support information.
- [x] 2.3 Set published npm description to the canonical sentence, preserve npm-facing skip guidance, and remove conflicting cluster-replacement metadata if present.
- [x] 2.4 Update CLI help and human-readable doctor introductions to explain the local inner loop, preserving JSON output, checks, and exit codes.

## 3. Document the Helm handoff

- [x] 3.1 Write `docs/with-helm.md` with the required title, machine/cluster diagram, complete ownership lists, and seven-row conceptual mapping with dependency/routing/workload caveats.
- [x] 3.2 Add a backend scaffold/manifest and same-image handwritten values worked example using the pinned app-template chart; explain user-owned build/push, image access, and deployment policy decisions.
- [x] 3.3 Document frontend local routing versus cluster ingress and explicit worker job/cronjob decisions; state that existing Helm, Kustomize, Flux, and Argo workflows remain intact.
- [x] 3.4 Add the guide's handwritten-values decision section and production support limits, with no claim that the deferred export command exists.
- [x] 3.5 Open `docs/compare-honest.md` with Helm/app-template ownership before Garden/Skaffold and link the companion guide.

## 4. Add minimal examples and schema guidance

- [x] 4.1 Create `examples/one-backend/` with one authored service manifest, minimal app/project files, documented generation/setup/up commands, expected curl/health response, prerequisites, and cleanup.
- [x] 4.2 Create `examples/one-backend-helm/values.yaml` and README using the same explicit backend image repository/tag and port, pinned chart version, matching docs/schema links, and lint/render instructions.
- [x] 4.3 Add core editor/schema guidance for both `service.json` and `.tdk/project.json` using validated JSON/editor configuration; distinguish config verification from environment doctor checks.
- [x] 4.4 Link minimal examples and schemas from onboarding while retaining `tdk project example` and existing landscape examples.

## 5. Coordinate website and repository guidance

- [x] 5.1 Create an isolated companion implementation branch/worktree in `tdk-landscape/tdk-website` (branch `docs/helm-handoff` at `../tdk-website-helm-handoff-wt`), confirm no repository-specific AGENTS/CONTRIBUTING instructions are present, and record its branch with this change; PR delivery is not part of this local apply.
- [x] 5.2 Update website hero to the canonical sentence plus “No cluster on the machine. Helm stays for prod.”; remove generated file counts as value claims.
- [x] 5.3 Lead website configuration docs with annotated valid service JSON, authoritative schema/editor links for both manifests, and verification commands before generator details.
- [x] 5.4 Add Helm/With Kubernetes next to Quickstart in navigation and a Helm/app-template comparison column identifying local generation/run versus Kubernetes rendering; link synchronized Helm guidance.
- [x] 5.5 Add root AGENTS/contributor guidance against default Kubernetes manifest generation and require local-only/export-only intent for generator changes.
- [x] 5.6 Add local-dev/cluster-deploy scope questions and Helm pointers to relevant issue forms; keep closure a maintainer decision.
- [x] 5.7 Update GitHub About to the canonical sentence and verify the live value; completed through the repository admin account.

## 6. Validate and record acceptance

- [x] 6.1 Check changed documentation links, all primary discovery copy, the README opening order, and absence of available-export or production-readiness claims; record checked links and local target review in `DELIVERY.md`.
- [ ] 6.2 Run existing relevant CLI help/doctor/schema checks and confirm doctor machine-readable output and exit behavior remain unchanged. CLI help passed; doctor JSON/schema behavior not checked, so retain this item as incomplete.
- [ ] 6.3 Run the single-backend example on a supported host, record successful local curl/health output, and verify cleanup without requiring a cluster. SKIP here: `tdk project --yes` stalled in the installed CLI and Docker/Tilt could not be confirmed.
- [x] 6.4 Validate companion values against the pinned chart with schema/lint/template checks; inspect the rendered image and HTTP port without applying to a cluster.
- [ ] 6.5 Build/preview the companion website using its existing workflow and verify hero, configuration order, Helm nav, comparison, and links. Source and checked-in `_site` inspected; fresh build unavailable because locked Bundler 2.6.9 is not installed.
- [ ] 6.6 Record a Helm user's 60-second purpose scan and ten-minute maximum two-document review, including correct answers to the four boundary questions; revise unclear copy if the exercise fails.
- [x] 6.7 Record core and website delivery references plus About status, and confirm no runtime schema or service-manifest contract changes or export command were introduced before closing the change; the editor-only project schema is documented.
