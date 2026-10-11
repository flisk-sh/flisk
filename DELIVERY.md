# Delivery: TDK positioning and Helm handoff

Core worktree: `spec/clarify-tdk-helm-handoff` (`tdk-cli-helm-handoff-wt`).
Website worktree: `docs/helm-handoff` (`tdk-website-helm-handoff-wt`).

## Shipped in the worktrees

Sectioned README with the full badge row and docs index, one-backend examples, editor schemas, contributor guidance, issue form scope questions, CLI intro copy, website copy, and GitHub About description.

## Not shipped

`tdk export helm`, automated tests specific to this change, a production website publish, or a merge. Runtime CI (`quickstart-e2e`, `erp-scale`) is not evidence for this documentation and positioning change.

## Verified

- Link review: local Markdown references in `README.md`, `docs/with-helm.md`, `docs/project-overview.md`, `docs/compare-honest.md`, `examples/one-backend/README.md`, and `examples/one-backend-helm/README.md` resolve within the core worktree. Corrected the Helm example's source path to `../one-backend/services/one-backend/api`.
- README/docs index links were also checked locally after the README reorganization; all relative targets exist.
- README now follows the section order: one-line positioning, badges, Installation, Quick start, When not to use TDK, Docs, Requirements/support, and Contributing/license. Detailed Helm copy lives in `docs/with-helm.md`.
- External chart pages checked on 2026-09-30: [official app-template docs](https://bjw-s-labs.github.io/helm-charts/docs/app-template/) (HTTP 200), [app-template 5.2.1 release notes](https://github.com/bjw-s-labs/helm-charts/releases/tag/app-template-5.2.1) (HTTP 200), [5.2.1 values schema](https://raw.githubusercontent.com/bjw-s-labs/helm-charts/app-template-5.2.1/charts/other/app-template/values.schema.json) (HTTP 200). Chart OCI reference and schema/release versions match at `5.2.1`. Removed the chart examples link after it returned HTTP 404.
- The public `main` guide URL used by website/issue links, `https://github.com/tdk-landscape/tdk-cli-core/blob/main/docs/with-helm.md`, returned HTTP 404 during this pre-merge check. Its target exists in the core worktree; recheck after merge before treating the cross-repository links as live.
- Current worktree CLI help, run with bundled Node 24.19.0: `node cli/bin/tdk.js --help`, `node cli/bin/tdk.js doctor --help`, and `node cli/bin/tdk.js up --help`. The help describes the local service loop, contains no Helm install command as a TDK command, and the top-level output says “Tilt Development Kit: run your microservices locally.”
- Helm sample: `helm pull oci://ghcr.io/bjw-s-labs/helm/app-template --version 5.2.1 --untar --untardir /tmp/tdk-helm-example`; `helm lint /tmp/tdk-helm-example/app-template --values examples/one-backend-helm/values.yaml` passed; `helm template api /tmp/tdk-helm-example/app-template --values examples/one-backend-helm/values.yaml` rendered ServiceAccount, Service, and Deployment. No Ingress or PVC rendered. This checks the sample values and chart only, not TDK.
- Website source inspection confirms the canonical hero sentence, schema-first configuration page, Helm navigation/sidebar links, and the one-row comparison: “Helm / app-template: Render Kubernetes for the cluster”; “TDK: Generate and run the machine stack”; “Same image optional; different control plane.”
- GitHub About description was set and verified as: “TDK runs many services on your machine with Docker + Tilt. Helm still deploys the cluster.”
- Scope inspection confirms no runtime schema/service-manifest contract edits and no Helm export implementation.
- CI workflow `36774232501` passed on the exact core PR head `c6fdbd4` (workflow_dispatch): lint, typecheck, unit tests, package build/install smoke, and workflow audit. This does not include `tdk up` or quickstart-e2e.

## Skipped or pending

- Local example smoke and full `tdk up`: `tdk project --yes` stalled without output in both the installed CLI and the current worktree CLI, so it was stopped. No local health request or cleanup result is claimed. Docker/Tilt availability was not established.
- Fresh website build/preview: skipped because the website worktree requires Bundler 2.6.9, which is not installed. HTTP inspection of the stale checked-in `_site` returned 200 for home/configuration/compare but 404 for `/docs/with-helm/`; those stale files were not treated as verification of the changed source.
- Doctor machine-readable output and exit behavior: not checked; help alone does not verify these contracts.
- First human Helm-user review: **failed** after more than 10 minutes. Their answers, relayed by the user, were: (1) “it runnning a clister like”; (2) “prod”; (3) “same completely same”; (4) “no its only tdk for local”. These showed confusion about the local runtime, Helm's role, and whether app-template can remain in production. The blunt local/cluster statements and contrast block were added to both docs. <!-- spellchecker:disable-line -->
- Reader's additional initial impression: TDK was “only for nodejs things.”
- Second human review, uncoached after the blunt first-screen rewrite: duration not reported. Answers as relayed by the user: (1) “machine”; (2) “no helm , its templator engine tdk cli for local env”; (3) “not same its mega manifest”; (4) “yes without tdk , its sepoate”. The user judged it mostly a pass: Q1, Q3, and Q4 were understood; Q2 did not clearly state that Helm remains for cluster templating. Added an explicit sentence to both docs at that point. The reader's raw answer and unknown duration remain the evidence; no synthetic self-review is acceptance evidence. The README has since been simplified again to one positioning sentence plus a single Helm-guide link; the second pass predates this version.
- Q2 retest (uncoached): “its not same”. Click moment: the autogen folder — generated local files, not Helm values. User confirms this passes Q2; human review is no longer the merge blocker.
- No claim is made that the live website was verified or published.

## Follow-up

Core PR #195 is ready for review. GitHub currently reports it conflicts with `main` (five commits behind); reconcile and rerun PR CI before merging. The successful workflow_dispatch run above validates the current head but is not attached as a PR check run. Website PR #24 remains Draft; its fresh-preview skip is explicit, and it can merge after core #195 if that limitation is accepted. Do not treat runtime CI evidence as proof of this positioning change.

Website preview skipped: Bundler 2.6.9 missing; source inspected only.
