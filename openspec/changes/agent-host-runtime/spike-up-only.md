# Spike: `flisk up --only` and Tilt resource selection

Run 2026-10-04 against a scratch copy of `tdk-ecommerce-example` (stack `store`: `catalog-api`, and `storefront-web` which has `"dependsOn": ["catalog-api"]`), Tilt 0.37.7. Selection was read with `tilt alpha tiltfile-result -f .tdk/.tdk-out/Tiltfile -- <args>`, which evaluates the Tiltfile and lists `EnabledManifests` without starting any container. Readiness behavior was read from a real Tilt with two local resources, one disabled by `config.set_enabled_resources`.

## What Tilt selects

The generated Tiltfile already has a focus filter (`--focus=a,b`, `apply_focus_filter` in `engine/topologies/tilt/config/profiles.star`). It accepts concrete service names, stack names, and release phases.

| Arguments | Enabled resources (besides the always-on set) |
|---|---|
| none (pre-alpha phase) | `catalog-api`, `storefront-web` |
| `--focus=store` | `catalog-api`, `storefront-web` |
| `--focus=catalog-api` | `catalog-api` |
| `--focus=storefront-web` | `storefront-web` and `catalog-api` (its `dependsOn`) |
| `--focus=catalog-api,storefront-web` | both |
| `--focus=nope` | **everything**, including `*-run-only` and `*-yaml` variants |

Always on in every case: `init-networks`, `postgres`, `traefik`, `golden-layers-build`, `provision-db-store`, and each selected service's `-config-gen`. Resources outside the selection still exist in Tilt but are disabled.

## Findings

1. **`dependsOn` exists.** `service.json` has a `dependsOn` list and the Tiltfile follows it transitively (including across stacks). The earlier note that no dependency field exists was wrong. Dependents are not pulled in: `--focus=catalog-api` does not start `storefront-web`.
2. **Service name equals Tilt resource name** for generated app resources (`catalog-api`, `storefront-web`), so `logs --service` and `up --only` use the same names. Shared infra has no `service.json` and cannot be selected or excluded; it is always enabled.
3. **An unknown focus name enables the whole stack.** A typo in `--only` would silently start everything, so the CLI must validate names itself (`UNKNOWN_SERVICE`, exit 2, valid names listed) before calling Tilt.
4. **A second `flisk up` does not replace or union with a running one.** `up` finds a free Tilt port when 10350 is taken and starts a second Tilt on it, which would apply a different selection to the same containers. For `--only` that is refused (`TILT_ALREADY_RUNNING`) unless `--force` is given. This is read from the code and probed with a listener on 10350; a live replace was not run.
5. **Readiness bug found, and fixed here.** Tilt reports a disabled resource with `updateStatus: none`, `runtimeStatus: none`, `disableStatus.state: Disabled`. The readiness check added with `up --json` treated those as pending, so it would wait forever (until `UP_TIMEOUT`) on any stack with resources outside the focus, including the default phase. A serve-only local resource reports `updateStatus: not_applicable`, which also read as pending. Readiness now ignores disabled resources and treats `not_applicable` as built.

## Chosen semantics

- `flisk up [stack] --only <service...>` starts the named services plus their `dependsOn` closure, and the always-on infra. Unknown names fail before anything starts.
- `--only` is passed to the Tiltfile as `--focus=<names>`; the stack argument only limits which names are valid.
- `--json` readiness covers the enabled resources only, so a partial up reports ready when its own resources are running. The success object adds `requested` and `dependencies`.
- `--only` validates names before the CLI writes anything to the project (`.env`, runtime assets, `.tdk/project.json`).
- `--only` while a Tilt answers on the default port 10350 or on `TILT_PORT` is `TILT_ALREADY_RUNNING`, not a second Tilt; with `--force` it stops those instances first. A listener that is not Tilt does not count.
- Readiness for `--only` expects each requested service to be listed, enabled and running: one Tilt lists as disabled is a failure, and one not listed yet is pending, so it cannot be filtered out of an otherwise-ready stack. Dependencies are not individually expected, because the Tiltfile skips some on purpose (for example a dependency whose name contains `frontend`).
- `dependencies` in the success object is what Tilt actually enabled (services that are not `requested`). The dry-run object has no Tilt to ask and reports the `service.json` closure as `declaredDependencies`, which can differ from the Tiltfile's expansion (aliases, domains, frontend skipping).
- The dry-run `command` is built from the same arguments as the real run.

## Not verified

A full `flisk up --only` was not run to completion (no containers or images were built). The selection was verified by evaluating the Tiltfile; the readiness change by a real Tilt with a disabled resource and by unit tests.
