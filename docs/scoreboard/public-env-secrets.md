# public-env-secrets

**Gate, 0 findings.** No tracked file shows a secret-looking value assigned to a `NEXT_PUBLIC_*` or `VITE_*` variable.

## Why

Next.js and Vite copy these variables into the JavaScript every visitor downloads. A credential in one is published.
`flisk doctor` warns users about it in their `.env` files ([troubleshooting](../troubleshooting.md)). This gate holds
the repository to the same rule in the places users copy from: env templates, Markdown examples, Compose files,
Dockerfiles, YAML, shell scripts and the Starlark generators. An example that shows a real-looking key teaches the
mistake, and users paste examples.

## How it works

1. List the tracked files (`git ls-files`) and keep the ones a user would copy from. Generated output (`cli/dist`,
   `release-dist-*`, `.flisk*`) is skipped because it repeats its source.
2. For each line, [`parse.mjs`](../../scripts/scores/public-env/parse.mjs) finds assignments of a public variable: `KEY=value`, `KEY: value`, `"KEY": "value"`, `ENV KEY=value`,
   `--build-arg KEY=value`. A name inside a longer identifier (`REACT_VITE_FRONTEND`) is a constant and is ignored.
3. Judge the value with `isSecretLookingValue` from `cli/dist`, the same function the doctor check runs.
4. Report `file:line NAME`. The value is dropped before the finding is built, so it can never leak into CI logs.

## Why reuse the product's rules

Two copies of a rule drift. Importing the doctor's function means a new provider pattern added for users protects the
repository the same day, and a false positive fixed for users is fixed here too.

## Fix a finding

Replace the value with an obvious placeholder (`your_publishable_key`, `<PUBLISHABLE_KEY>`) or a publishable key
(`pk_test_...`), or move the secret to a server-side variable. Never "allow" a real credential.

## What it cannot see

Values built at runtime, values in files outside the scanned types, and credential formats the heuristic does not list.
Pair it with [tracked-secrets](../../scripts/scores/tracked-secrets.mjs) and GitHub push protection.

Source: [`public-env-secrets.mjs`](../../scripts/scores/public-env-secrets.mjs).
