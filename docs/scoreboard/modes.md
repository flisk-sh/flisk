# Gate, ratchet or report

Every scorer declares a `mode` in its `meta`. The mode decides when the score fails a pull request.

| Mode | Fails when | Use it for | Example |
| --- | --- | --- | --- |
| gate | the value misses `meta.target` | a rule with no legitimate exception | `public-env-secrets` at 0 findings |
| ratchet | the value is worse than its entry in `baseline.json` | a quality that is not perfect yet but must not slip | `doctor-check-docs` |
| report | never | a number to watch, or one that needs GitHub data | weekly community numbers |

## Choosing

1. Can the repository reach the target today? If yes and a miss is always a bug, make it a **gate**.
2. If the number is below the target today, make it a **ratchet**. Record the current value; it can only improve.
3. If the number is noisy or only informative, make it a **report**.

## Ratchets stay honest

`node scripts/scores/run.mjs --update-baseline` only moves a baseline in its better direction. When a change makes a
ratchet worse on purpose, edit `scripts/scores/baseline.json` by hand in the same pull request and say why in the
description. A reviewer then sees the cost in the diff.

## Allow-lists

A gate that needs an exception keeps it in the scorer as an `ALLOWED` list with a reason per entry, and reports an entry
that matches nothing as a finding (see `tracked-secrets`). An exception can then never outlive its cause.
