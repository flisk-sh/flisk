# Branch ruleset snapshots

These JSON files are GitHub ruleset API request bodies and the checked-in record
of the repository's active rulesets. Keep them in sync with **Settings → Rules →
Rulesets** when protection changes. `scripts/check-ruleset-snapshots.mjs` compares
the snapshots with the live API; the scheduled required-checks drift workflow
reports differences in one issue. GitHub does not apply these files
automatically, and the repository ruleset API requires an Administration write
token.

When adding a required check, merge the workflow that produces it first, then
add that check to the live GitHub rulesets. This avoids requiring a status
context before GitHub can run it from the default branch. The main-branch check
inventory is also recorded in `../required-checks.json` for classic branch
protection. Required checks in the `main merge queue` ruleset are validated
against the same CI inventory independently, since rulesets and classic branch
protection can enforce different check sets.

`main.json` keeps the main-branch merge queue and requires PR review and the
listed checks. `releases.json` applies the same review and safety requirements
to `release/*` and `releases/**/*` without a merge queue.

Both rulesets require one human approval. Automated PR checks can reject
incomplete PR summaries, but GitHub bots and AI reviews do not count as human
approvals for OpenSSF Scorecard's Code-Review check.
