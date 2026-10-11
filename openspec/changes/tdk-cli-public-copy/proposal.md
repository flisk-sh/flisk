# Proposal: TDK CLI organization copy

status: proposed

## Why

Public pages and repository descriptions must consistently explain TDK CLI's job: starting an engineer's existing services locally. This replaces the earlier public-positioning notes for this change.

## Goals

- Name the product “TDK CLI” in titles, About fields, npm metadata, and social copy. Keep `tdk-landscape` next to the product name where the organization identity is shown.
- Address one buyer: an engineer or tech lead already running several services and tired of local Compose, Dockerfiles, and a week of setup.
- Explain the local-start boundary: one `service.json` per service, then `tdk up`; production stays on Helm, Argo CD, or Kustomize.
- Keep performance claims paired with their hardware and fixture caveats.
- Keep the calculator on `/waiting`, and keep Premium out of the hero.

## Non-Goals

- Renaming repositories or `@tdk-landscape/tdk-cli-core`.
- Positioning TDK CLI as a production deployment tool, a hand-maintained Compose file, or a Kubernetes-on-machine product.
- Changing CLI behavior, Premium pricing, or production deployment workflows.
- Reopening `codex/tdk-cli-public-copy`, which has no common ancestor with `main`.

## Canonical copy

### First screen

- H1: `Start your services on your machine.`
- Subhead: `Not a deploy. Not a Compose file. One service.json, then tdk up. No Kubernetes on the machine.`
- Proof: `14 services healthy in 4.6s on a 16 GB M1 once images exist.`
- Caveat: `One hundred generated /health services are a fixture, not an ERP product.`

The homepage H1 and subhead are already shipped. The ROI calculator is off the homepage and remains on `/waiting`.

### Product boundary

The free MIT CLI is the product. Premium is $19 per developer per month for extras only; public pricing should say most teams should stay on free. Production remains on Helm, Argo CD, or Kustomize.

Tilt may appear once in How it works or Requirements: `Docker runs the containers. Tilt runs the dev loop. TDK CLI writes that config.` Do not explain Tilt in deploy- or Compose-misread replies.

### Approved replies

- Deploy misread: `This is not a production deploy. tdk up starts services, a database, and a proxy on your machine. No cluster. Helm still deploys production.`
- Compose misread: `Not a Compose file you maintain. One service.json per service, then tdk up. If Compose already works for you, skip TDK CLI.`

## Public About fields

Use the exact descriptions supplied in the TDK CLI organization spec for the organization and each listed repository. Archived repositories are read-only on GitHub and cannot have their About fields edited while archived.

The npm title is `TDK CLI — start services on your machine.` The package remains `@tdk-landscape/tdk-cli-core`.

## Already shipped

- Homepage H1 and deploy/Compose subhead are live on GitHub Pages.
- ROI calculator is off the homepage and remains on `/waiting`.
- Core public-copy text landed in #203.
- README SVG demo is restored in #205.

## Implementation scope

Align the homepage title and proof, GitHub organization profile, npm metadata, and this OpenSpec change with this canonical copy. Do not change already-correct behavior or copy unnecessarily.
