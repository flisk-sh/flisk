# How the scorers are built

Each scorer is a thin file that composes small modules. The pieces are separated so each can be tested alone and so the
scorer itself reads as a description of the promise, not as plumbing.

```text
scripts/scores/
  public-env-secrets.mjs      gate: composes parse + scan + judge over tracked files
  public-env-heuristic.mjs    gate: composes corpus + judge + evaluate
  doctor-check-docs.mjs       ratchet: composes extract + a case-insensitive lookup
  public-env/
    parse.mjs                 pure: a line of text -> [{ name, value }]
    scan.mjs                  pure: text + injected judge -> [{ line, name }]
    corpus.mjs                data: labelled CREDENTIALS and PUBLIC_VALUES
    evaluate.mjs              pure: judge + corpus -> accuracy and typed errors
    cli-heuristic.mjs         the one seam to cli/dist (the doctor's real judge)
  doctor-checks/
    extract.mjs               CLI source text -> doctor check names
  testing/
    fixture.mjs               withFixture(files, fn): a temp repo, always cleaned up
```

## Principles

| Principle | How it shows up |
| --- | --- |
| Pure core, thin shell | `parse`, `scan`, `evaluate` and `extract` take strings and return data. Files and git are touched only in the scorer's `measure`. |
| Inject what varies | `measure(ctx, { judge, cases })` takes the heuristic as a parameter. Tests pass a stub; CI passes nothing and gets the CLI's real one. |
| One seam to the product | `cli-heuristic.mjs` is the only place that imports `cli/dist`, so a CLI move is a one-file change and the missing-build hint lives once. |
| Data apart from logic | The corpus is data in its own file. Adding a case never touches code. |
| Errors that teach | A missing build says `run npm --prefix cli run build`. A heuristic error says `false negative` or `false positive`, with the promise it broke. |
| No value ever escapes | Values are judged inside `scan`, then dropped. Findings carry file, line and name only. |

## Why separate parse from judge

The parser decides *what is an assignment*; the judge decides *what is a secret*. They change for different reasons (a new
file syntax versus a new provider key), and a bug in one should not hide behind the other. Splitting them also lets the
gate and the doctor share the judge without sharing the parser.

## Rules for new scorers

1. A scorer file holds `meta`, `measure` and constants that describe the rule. Anything reusable moves to a subfolder
   named after the feature (`public-env/`). The runner loads only top-level `*.mjs`, so helpers there are never run as scorers.
2. Keep the test file at the top level (`<id>.test.mjs`): `make test-shell` runs `scripts/scores/*.test.mjs`.
3. Give `measure` a second argument for anything a test would otherwise have to fake on disk.
4. Build fixtures with `testing/fixture.mjs`, not hand-rolled temp directories.

See also: [add a check](adding-a-check.md), [modes](modes.md).
