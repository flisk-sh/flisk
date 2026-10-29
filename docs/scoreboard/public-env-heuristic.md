# public-env-heuristic

**Gate, 100%.** `flisk doctor`'s public-env check classifies every case in a labelled corpus correctly.

## Why

A heuristic fails in two directions, and both are silent:

- **False positive.** It starts warning on publishable keys, build ids or URLs. Users learn to ignore the warning, and
  then miss the real one.
- **False negative.** A refactor loosens a pattern and a real key reaches the browser.

Unit tests of the check show it works on the author's examples. This gate pins the *promises* in one table, so a
change in behaviour is a visible diff in a reviewed file instead of a surprise in production.

## How it works

`CASES` in [`public-env-heuristic.mjs`](../../scripts/scores/public-env-heuristic.mjs) lists
`{ name, value, secret, why }`:

- 16 credential shapes that must warn (Stripe, OpenAI, Anthropic, AWS, GitHub, Slack, Google, npm, webhook, JWT, URL
  with credentials, secret-named variables).
- 19 public values that must stay quiet (publishable keys, placeholders, URLs, kebab-case config, build ids, versions,
  commit SHAs in build variables, UUIDs, booleans, numbers, paths, short values).

The scorer runs `isSecretLookingValue` from `cli/dist` on each and reports the ones that disagree, naming the promise
(`Stripe secret key (VITE_STRIPE_KEY): doctor misses it (false negative)`), not the value.

Credentials are assembled at runtime from a prefix and filler, so the file holds no credential-shaped literal and
[tracked-secrets](../../scripts/scores/tracked-secrets.mjs) stays at zero.

## When a case flips

Decide which side is right. If the code regressed, fix it. If the promise changes on purpose, edit the case and
[troubleshooting](../troubleshooting.md) in the same pull request.

## Add a case

Whenever a user reports a missed key or a noisy warning, add the value shape to `CASES` first, watch the gate go red,
then fix the heuristic. The corpus only grows.

## What it cannot see

Only the listed shapes. It measures agreement with the corpus, not real-world recall.
