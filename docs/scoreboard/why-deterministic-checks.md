# Why deterministic checks belong in CI

A deterministic check is a program whose output depends only on the files it reads. Run it twice on the same commit
and you get the same answer. That one property is what makes it worth putting in CI.

## What you get

- **Repeatable.** A reviewer's "looks fine" varies by day and by person. A score does not, so a red check is never
  "flaky review".
- **Located.** A finding is `path:line what is wrong`. The author fixes it without asking what the reviewer meant.
- **Cheap.** The files scorers run in seconds with no network, no model and no secrets, so they can run on every pull
  request, including pull requests from forks.
- **Cumulative.** A promise written once ("no secret-looking value in a public variable") keeps holding after the
  person who wrote it has moved on. Review attention does not scale that way.
- **Explainable.** There is no confidence score to argue with. A rule either matched a line or it did not.

## What it does not do

A deterministic check finds what its rules describe, nothing more. A heuristic such as the doctor's secret detector
can miss a credential in a format nobody listed. That is why Flisk checks the heuristic itself
([public-env-heuristic](public-env-heuristic.md)): the limits are written down as a labelled corpus, and a change that
widens or narrows them shows up as a diff.

## When not to add one

- The thing you want to measure needs judgement (is this paragraph clear?). A number would pretend to certainty.
- The signal is noisy and you have no tolerance for it. Use a [report](modes.md) row, not a gate.
- A linter or a unit test already covers it. Prefer the tool that fails closest to the edit.

## The checks this PR adds

| Scorer | Mode | The promise |
| --- | --- | --- |
| [public-env-secrets](public-env-secrets.md) | gate | the repository's own examples never show a credential in a public variable |
| [public-env-heuristic](public-env-heuristic.md) | gate | the doctor check catches what it says it catches and leaves ordinary config alone |
| [doctor-check-docs](doctor-check-docs.md) | ratchet | the share of doctor checks with a troubleshooting entry only goes up |
