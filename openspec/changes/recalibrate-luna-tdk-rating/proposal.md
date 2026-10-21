## Why

Luna's rating of Flisk CLI must answer two different questions without confusing product fit with the risk of adopting it: does it do its local-development job, and would a team standardize on it now? A single maturity-heavy score obscures the useful distinction; a popularity-blind score obscures adoption risk. The supplied contract requires evidence, names both audiences and failure modes, and forbids adjusting criteria or weights just to produce a preferred headline. This is a documentation-only change to the evaluation process; it does not change Flisk CLI or improve its product score.

## What Changes

- Define Luna's role as an independent software evaluator and the questions every Flisk CLI review must answer, including who should not use it.
- Replace the prior eight-category rating with two 1–10 ratings: Job-fit and Adoptability, each derived from four specified 1–5 axes.
- Define the fixed headline formula as `0.45 × Job-fit + 0.55 × Adoptability` and require the arithmetic to be shown consistently.
- Establish evidence rules that keep stars and forks out of product-quality axes while allowing them as adoption-risk evidence; identify tiny health-container benchmarks as fixtures; and require explicit disclosure when Luna did not run the tool.
- Ban default-safe scoring, rubric manipulation, unsupported claims based on Tilt's popularity, untested Windows assumptions, and score-driven spec writing.
- Require the exact two-rating output fields and capture the supplied worked evidence without presenting it as independently executed verification.
- State clearly that the rubric change improves the rating process only; product weaknesses remain until real product fixes are shipped and evidenced.

## Capabilities

### New Capabilities
- `luna-tdk-rating`: Luna gives evidence-grounded Job-fit and Adoptability ratings for Flisk CLI using the prescribed axes, formula, exclusions, and report format.

### Modified Capabilities
- None.

## Non-goals

- Changing Flisk CLI, its documentation, platform support, benchmarks, or adoption metrics.
- Optimizing the rubric to achieve a 9/10 or any other predetermined score.
- Treating popularity as product quality or omitting adoption risk to inflate Job-fit.
- Claiming Luna ran Flisk CLI when it did not.

## Impact

- Adds OpenSpec documentation that defines rating behavior for the OpenAI model Luna.
- Establishes an auditable worked example using the evidence and scores supplied by the user.
- Changes documentation only; it does not alter Flisk CLI behavior, platform support, stability, examples, adoption, or the product score.
- Does not require a hidden scorer, prompt file, or evaluator integration inside the Flisk CLI repository.
