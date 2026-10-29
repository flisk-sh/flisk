# Scoreboard docs

The scoreboard is a set of small programs in [`scripts/scores/`](../../scripts/scores/README.md). Each reads files, a CI
artifact or GitHub counts and prints one number. No model is involved, so the same input gives the same number, and a
drop points at a file and a line the way a lint error does.

| Page | Read it when |
| --- | --- |
| [Why deterministic checks belong in CI](why-deterministic-checks.md) | you want to know why a number beats a review comment |
| [Gate, ratchet or report](modes.md) | you are choosing how strict a new check should be |
| [Add a check to CI](adding-a-check.md) | you are writing a scorer |
| [Reading a failing score](reading-a-failure.md) | `make test-shell` or `make scores` just went red |
| [public-env-secrets](public-env-secrets.md) | a finding names a `NEXT_PUBLIC_*` or `VITE_*` line |
| [public-env-heuristic](public-env-heuristic.md) | a case in the labelled corpus flipped |
| [doctor-check-docs](doctor-check-docs.md) | you added or renamed a `flisk doctor` check |

## Run it

```bash
make scores                                              # every files scorer, as on a pull request
node scripts/scores/run.mjs --only public-env-secrets    # one scorer
node scripts/scores/run.mjs --only doctor-check-docs --markdown
```

`make test-shell` runs the same scorers with `--check`, so a failing gate or ratchet fails the pull request.
