# Encore (stub, no `bench.json` yet)

Encore is the one tool from the agent bench that is not here. It has no `bench.json`, so the runner skips this folder.

Why it is not wired in: Encore is a framework, not a runner for a shared codebase. Its services are written against `encore.dev`
APIs (`api()`, `SQLDatabase`, `Topic`, `Subscription`), so the shop in `bench/shop` cannot be reused; it needs its own
TypeScript port of the 10 parts. Its installer (`curl -fsSL https://encore.dev/install.sh | sh`) downloads a large binary
and `encore run` needs Docker for Postgres, so it is also the slowest to set up on a runner.

To finish it: port the shop to Encore services, add `bench.json` (`requires: ["encore"]`, `start: "encore run --port $BENCH_PORT ..."`),
a CI step that installs Encore, and point `base`/`paths` at its gateway. See ../../README.md.
