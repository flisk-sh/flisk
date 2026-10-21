# Public claims registry

Public numbers and measured outcomes must link to this registry. Keep the source, conditions, and limits beside every claim. Flisk CLI turns a `service.json` per service into a local Docker stack, with Tilt (the local development tool) watching services and live-updating containers as you code. It is not a deploy tool and not a Compose replacement. Production stays on Helm.

| Claim | Allowed wording | Forbidden wording / source |
| --- | --- | --- |
| 14-service demo | “14 tiny services healthy in 4.6s on a 16 GB M1 after images existed. Not a cold boot.” | “from zero”, “cold boot”, “weeks of integration”. Source: local demo capture; warm start only. |
| 100-service bench | “100 generated `/health` stubs, ~20 lines each, healthy through Traefik in 472s on a clean Ubuntu runner ([run](https://github.com/flisk-sh/tdk-cli-core/actions/runs/36395860088)). Not an ERP.” | “ERP system”; “100 services still readable” without “fixture”. Images built from scratch. |
| Onboarding | “Designed so `flisk doctor` and `flisk up` replace a setup wiki. Not measured on a hiring cohort.” | “weeks of salary”; “day one” stated as a measured fact. |
| ROI calculator | “Inputs are user-set. Output is arithmetic, not savings.” | Default 5 hours/week presented as typical. |

The only permitted performance wording for the 14-service number includes the existing-images and warm-start caveat. Avoid derived phrases such as “under 5 seconds.”
