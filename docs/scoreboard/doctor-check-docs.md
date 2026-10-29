# doctor-check-docs

**Ratchet, higher is better.** The share of `flisk doctor` checks whose name appears in
[`docs/troubleshooting.md`](../troubleshooting.md).

## Why

A doctor line is the first thing a stuck user sees. The troubleshooting page is where they look it up. A check with no
entry leaves them with a red line and no cause or fix, and the maintainers answer the same question in issues. Counting
the gap makes it shrink instead of grow silently as checks are added.

## How it works

1. Read the doctor sources: `cli/src/commands/doctor*.ts`, `cli/src/utils/doctor-*.ts`, `windows-doctor.ts`,
   `service-config-checks.ts` and `public-env-secrets.ts` (tests excluded).
2. Collect each `name: "Check Name"` that builds a `CheckResult`.
3. A check is documented when its name appears in the page, ignoring case.
4. Value = documented / total. Each missing name is a finding.

## Fix a finding

Add a heading or a table row that uses the check's exact name, with its **Cause** and **Fix**. Follow the format of the
"Public environment secrets" entry. Then raise the baseline:

```bash
node scripts/scores/run.mjs --only doctor-check-docs --update-baseline
```

## Why a ratchet

Most checks are undocumented today, so a gate would fail on day one. The ratchet records where the repository stands
and refuses to go backwards, so every new check must arrive with its entry, and the backlog can be paid down in small
pull requests.

## What it cannot see

A name mentioned in passing counts as documented. It checks presence, not quality.
