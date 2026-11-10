#!/bin/sh
# Builds the 10-part shop as a Flisk project with the Flisk CLI (no hand-written container files), then drops the shared
# shop code (bench/shop, $BENCH_SHOP) into the resources the CLI created. Runs once in the work folder, untimed.
set -eu
[ -d .git ] || git init -q
F="${FLISK_CMD:-flisk}"
S="$BENCH_SHOP"
STACK=shop

$F project --yes --quiet >/dev/null

# Postgres comes with the project (shared Flisk Postgres, DATABASE_URL injected). The queue is a Redis resource.
$F resource queue --type database --framework redis --stack $STACK --yes >/dev/null

# One-shot migrator: the shared migrate.ts in its own container, run once, exits 0 before anything that depends on it.
$F resource migrator --type bring-your-own --dockerfile Dockerfile --restart no --no-proxy --stack $STACK --yes >/dev/null
cp "$S/db/Dockerfile" "$S/db/migrate.ts" services/$STACK/migrator/
cp -R "$S/db/migrations" services/$STACK/migrator/migrations

# Backends and workers.
for r in catalog payments orders notifications fulfilment; do
	type=backend
	case $r in notifications|fulfilment) type=worker ;; esac
	$F resource $r --type $type --stack $STACK --yes >/dev/null
	rm -rf services/$STACK/$r/src services/$STACK/$r/tests
	cp -R "$S/$r/src" services/$STACK/$r/src
done

# Web.
for r in storefront admin; do
	$F resource $r --type frontend --framework vanilla --stack $STACK --yes >/dev/null
done

# Wire dependsOn, injected URLs and the shop pages.
node "$BENCH_DIR/wire.mjs"
