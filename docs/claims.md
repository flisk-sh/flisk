# Public claims registry

Public numbers and measured outcomes must link to this registry. Keep the source, conditions, and limits beside every claim. Flisk CLI turns a `service.json` per service into a local Docker stack, with Tilt (the local development tool) watching services and live-updating containers as you code. It is not a deploy tool and not a Compose replacement. Production stays on Helm.

| Claim | Allowed wording | Forbidden wording / source |
| --- | --- | --- |
| 14-service demo | “14 tiny services healthy in 4.6s on a 16 GB M1 after images existed. Not a cold boot.” | “from zero”, “cold boot”, “weeks of integration”. Source: local demo capture; warm start only. |
| 100-service bench | “100 generated `/health` stubs, ~20 lines each, healthy through Traefik in 472s on a clean Ubuntu runner ([run](https://github.com/flisk-sh/flisk/actions/runs/36395860088)). Not an ERP.” | “ERP system”; “100 services still readable” without “fixture”. Images built from scratch. |
| Compose import | “A plain Compose app (a Node API and Postgres) answered 49 s after `flisk import` on a clean Ubuntu CI runner, images pulled and built from scratch, install not counted.” Link the [run](https://github.com/flisk-sh/flisk/actions/runs/40660606705). | “in seconds” or “under a minute” as a general promise; any version without “clean” runner and the app size. Source: `tests/e2e/journeys/compose-import` CI3, one cold run on 2026-10-28; CI repeats it on every pull request. |
| Onboarding | “Designed so `flisk doctor` and `flisk up` replace a setup wiki. Not measured on a hiring cohort.” | “weeks of salary”; “day one” stated as a measured fact. |
| ROI calculator | “Inputs are user-set. Output is arithmetic, not savings.” | Default 5 hours/week presented as typical. |

The only permitted performance wording for the 14-service number includes the existing-images and warm-start caveat. Avoid derived phrases such as “under 5 seconds.”

<!-- CI checks public docs against the claims-guard block below (scripts/scores/claims-guard.mjs): change it with the table. “day one” and the ROI default are not machine-checked. “from zero” and “cold boot” are wrong only for the 14-service number, so the 4.6s caveat checks them; the cold-boot benchmarks use the words for what they measured. -->
<!-- claims-guard
forbid: weeks of integration | ERP system | weeks of salary | under 5 seconds
caveat: 4.6s => after images existed | warm start | not a cold boot
caveat: 472s => stub | fixture | not an ERP
caveat: 100 services still readable => fixture
caveat: 49 s => clean | from scratch | CI runner
-->
