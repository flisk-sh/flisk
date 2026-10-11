# Design: TDK CLI organization copy

## Buyer and job

One buyer on every public page: an engineer or tech lead who already runs several services and is tired of local Compose, Dockerfiles, and a week of setup. TDK CLI starts those services on the developer's machine. It does not deploy production and it is not a Compose file maintained by hand.

Each service has one `service.json`; `tdk up` starts the local stack. No Kubernetes runs on the machine. Production stays on Helm, Argo CD, or Kustomize.

## Naming

- Write `TDK CLI` in titles, About fields, npm metadata, and social copy.
- Keep `tdk-landscape` alongside the product name in organization identity.
- Do not write `Tilt Development Kit` or use bare `TDK` as the product name in titles.
- Preserve repository names and `@tdk-landscape/tdk-cli-core`.
- npm description/title: `TDK CLI — start services on your machine.`

## First screen

- H1: `Start your services on your machine.`
- Subhead: `Not a deploy. Not a Compose file. One service.json, then tdk up. No Kubernetes on the machine.`
- Proof, with caveat in the same sentence: `14 services healthy in 4.6s on a 16 GB M1 once images exist.`
- The 100 generated `/health` services are a fixture, not an ERP product.

Do not put Tilt, Starlark, PSR, golden L1–L4, Infisical, Traefik, orchestration, deployment language, `docker-compose`, or “built on Tilt” in the H1, title, About, or first paragraph. The prescribed phrase “Not a deploy” in the subhead is an explicit exception to the word-level prohibition on deploy claims.

Tilt may appear once in How it works or Requirements: `Docker runs the containers. Tilt runs the dev loop. TDK CLI writes that config.`

## Offer and placement

The free MIT CLI is the product. Premium costs $19 per developer per month for extras only, stays out of the hero, and pricing should say most teams should stay on free. The ROI calculator stays on `/waiting` only.

## Repository About copy

Use the exact lines from the supplied organization spec for `tdk-landscape`, `tdk-cli-core`, `tdk-website`, `tdk-landscape.github.io`, `tdk-example`, `tdk-erp-system`, `tdk-saas-starter`, `tdk-restaurant-example`, `tdk-user-management`, `tdk-auth-queue-email-example`, `tdk-ecommerce-example`, `tdk-docker-compose-example`, `tdk-cli-releases`, `tdk-labs`, `tdk-demo-animation`, `create-tdk-stack`, `awesome-tdk-framework`, `tdk-skills`, and `tdk-discovery`. The archived `tdk-discovery` About field cannot be changed while the repository is archived.

## Scope replies

- Deploy misread: `This is not a production deploy. tdk up starts services, a database, and a proxy on your machine. No cluster. Helm still deploys production.`
- Compose misread: `Not a Compose file you maintain. One service.json per service, then tdk up. If Compose already works for you, skip TDK CLI.`

Stop after that; do not explain Tilt in these replies.

## Existing shipped work

Keep the shipped homepage H1/subhead, the calculator's `/waiting` placement, core public copy from #203, and the restored README SVG from #205. Never reopen `codex/tdk-cli-public-copy`; that branch has no common ancestor with `main`.
