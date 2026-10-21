#!/usr/bin/env bash
# Fails when cli/dist does not match what `npm run build` produces from cli/src.
# Run after building (CI does this in the "Pack CLI" job; locally use
# `npm run check:dist` in cli/, which builds first). cli/dist is gitignored, so
# new compiled files only show up with --ignored, and need `git add -f`.
set -euo pipefail

cd "$(dirname "$0")/.."

changes="$(git status --porcelain --ignored -- cli/dist)"
if [ -z "$changes" ]; then
  echo "cli/dist is up to date."
  exit 0
fi

printf '%s\n' "$changes"
cat >&2 <<'MSG'

::error::cli/dist is stale: it does not match cli/src.

To fix it, from the repository root:

  cd cli && npm run build && cd ..
  git add -f cli/dist
  git commit -m "Rebuild cli/dist"
  git push

cli/dist is committed so `npm install -g github:flisk-sh/tdk-cli-core`
works without a build step. Use `git add -f` for new files under cli/dist.
Pull requests from forks cannot be fixed by the CI bot; push the commit to
your own branch yourself.
MSG
exit 1
