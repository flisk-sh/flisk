# Reading a failing score

```text
fail   public-env-secrets   1 findings   No secret-looking values in tracked NEXT_PUBLIC_* / VITE_* examples
       - docs/recipes/shop.md:42 VITE_PAYMENT_KEY holds a secret-looking value; public variables ship in the client bundle
```

1. **Find the row.** The id on the left is the scorer; its page here explains the rule.
2. **Open the finding.** `path:line` is where. The text after it is the broken promise.
3. **Run it alone.** `node scripts/scores/run.mjs --only <id>` repeats the result in seconds.
4. **Fix the cause, not the number.** Change the example, the doc or the code the rule guards.
5. **Never edit a baseline to make a ratchet pass** unless the regression is intended and you explain it in the PR.

## Common causes

| Symptom | Likely cause |
| --- | --- |
| `cli/dist/... is missing` | run `npm --prefix cli run build`; scorers that import the CLI need its output |
| `Cannot find package 'chalk'` | run `bun install --frozen-lockfile` in `cli/` |
| a ratchet dropped | something that counted before no longer does (a renamed doctor check, a removed doc heading) |
| a finding in a path you did not touch | a shared rule changed; the scorer reads the whole tree |
