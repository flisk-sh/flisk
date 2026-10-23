## Context

The user clarified that Luna is an OpenAI chat model, not a hidden evaluator in the Flisk CLI repository. The change is the rating contract for that model. Its purpose is an honest evaluation, not achieving a high score. The rubric separates whether Flisk fits local Docker + Tilt TypeScript/Bun development from whether it is adoptable as a team standard this quarter. This change edits OpenSpec documentation only; it does not fix Flisk CLI or improve its product score. The same supplied product evidence remains in force.

## Goals / Non-Goals

### Goals
- Require two distinct ratings: Job-fit and Adoptability.
- Derive each rating from its four explicitly named axes, using evidence and the supplied 1/3/5 anchors.
- Keep popularity out of product-quality axes while preserving it as adoption-risk context.
- Apply one fixed headline formula and make arithmetic auditable.
- Require an explicit “Not good for” answer and truthful disclosure about execution.

### Non-Goals
- Maximize a score, preserve the former 92/100 result, or average uncertainty into a comfortable 7.
- Create or search for an evaluator implementation in the Flisk repository.
- Generalize this Flisk-specific rubric to other software products.

## Decisions

### Separate product fit from adoptability
Job-fit is the mean of Claim vs code, Boot path, Generation, and Scale evidence. Adoptability is the mean of Platforms, Stability, Exit, and Adoption risk. Convert each 1–5 mean to a 1–10 rating by multiplying by two. The two scores answer different questions and must both be shown.

### Use the fixed headline formula without adjustment
The headline is `0.45 × Job-fit + 0.55 × Adoptability`. Adoptability has the larger weight because the question “is it good?” includes whether a team can live on it. Luna must not adjust those weights to produce a preferred number.

For the supplied worked values, Job-fit is `(4+4+4+3)/4 × 2 = 7.5`; Adoptability is `(2+2+4+1)/4 × 2 = 4.5`; and the fixed headline is `0.45×7.5 + 0.55×4.5 = 5.85/10`, published as 6/10 when rounded to a whole number. The old sloppy 6.5 headline conflicts with this formula and is not used; it would require changing the stated weights. The false 92/100 / 9/10 scorecard is discarded.

### Treat stars as adoption context only
Stars and forks may explain external-adoption risk, but cannot change Claim vs code, Boot path, Generation, or Scale evidence scores. Tilt's stars do not transfer to Flisk and do not prove that Flisk is battle-tested. Issue counts are evidence only with context; Luna should characterize the tracker rather than assume all issues are junk.

### Identify the limits of benchmark evidence
A 100-service tiny `/health` boot is a fixture. It can support fixture-scale evidence but is not a business application or “ERP.” The scale axis anchors distinguish no evidence, fixture-only, and fixture plus a real-shaped example.

### Disclose execution and platform evidence
Luna must say whether it ran Flisk. If not, it must say so and limit runtime confidence; it may not invent a boot. Windows must be evaluated from test evidence. “Supported” claims without end-to-end evidence do not earn the top platform score. Mac/Linux support and native Windows/WSL status must be stated accurately.

### Preserve the mandatory concise report
The report contains Job-fit, Adoptability, Headline, Good for, Not good for, Strongest fact, Weakest fact, and Did you run it. Every rating must be backed by the evidence rules and axes; the “Not good for” field is required for completion.

## Risks / Trade-offs

- **Risk:** Readers may mistake a better rating process for a better product. → State that this change is documentation-only, preserves the same evidence, and does not improve Flisk CLI or its score.
- **Risk:** Popularity is either misused as quality or hidden entirely. → Keep it exclusively in the Adoption risk axis and permit it as contextual evidence there.
- **Risk:** Fixture results may be oversold as production-like workloads. → Require the fixture label and reserve the top Scale evidence anchor for fixture plus one real-shaped example.
- **Risk:** “Not run” may become an excuse for a middle score or fabricated runtime confidence. → Require explicit disclosure, evidence-limited confidence, and no invented boot.
- **Risk:** Windows may be dismissed based on assumptions. → Require evidence and distinguish native Windows from WSL2 claims.

## Migration Plan

Replace the earlier single weighted 1–5 category scorecard with this two-rating contract. No Flisk CLI code or repository evaluator changes are needed. Future Luna evaluations use this specification and the mandatory output format.

## Open Questions

None. With the supplied axis scores the fixed formula gives 5.85/10, published as 6/10 rounded to a whole number. Product improvement would require real, tested changes to stability, Windows/WSL support, examples, and issue-tracker hygiene; this rubric change does not deliver those fixes or guarantee a future score.
