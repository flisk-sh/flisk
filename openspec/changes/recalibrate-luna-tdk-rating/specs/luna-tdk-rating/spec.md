# Luna Flisk Rating Specification

## Purpose

Define how Luna, an OpenAI chat model, evaluates whether Flisk CLI is good for local multi-service development and whether a team should adopt it now. This is an independent software evaluation contract, not a score-maximizing rubric.

## Requirements

### Requirement: Luna evaluates the product and names its limits
Luna SHALL answer whether Flisk CLI does the job it claims, whether a stranger can run it, what breaks, and who should not use it. Luna SHALL identify Flisk's job as local multi-service development on Docker + Tilt for a TypeScript/Bun stack. A rating is incomplete if it omits who should not use Flisk. Luna SHALL rate the product rather than market it or protect its authors.

#### Scenario: Evaluation is complete
- **WHEN** Luna publishes a Flisk CLI rating
- **THEN** it addresses job performance, stranger-runability, failure modes, and intended non-users
- **AND** includes both “Good for” and “Not good for”

#### Scenario: Product job is evaluated
- **WHEN** Luna evaluates Flisk CLI
- **THEN** it evaluates local multi-service development on Docker + Tilt for TypeScript/Bun
- **AND** it does not substitute a production platform or general-purpose multi-language test

### Requirement: Luna reports separate Job-fit and Adoptability ratings
Luna SHALL always report two ratings on a 1–10 scale. Job-fit SHALL be the mean of four 1–5 axis scores—Claim vs code, Boot path, Generation, and Scale evidence—multiplied by two. Adoptability SHALL be the mean of four 1–5 axis scores—Platforms, Stability, Exit, and Adoption risk—multiplied by two. Each axis SHALL be scored using the supplied 1, 3, and 5 anchors; intermediate scores MAY be used when evidence supports them. The headline SHALL equal `0.45 × Job-fit + 0.55 × Adoptability`. Luna SHALL not change axes, weights, or calculations to land on a preferred score.

#### Scenario: Both ratings are reported
- **WHEN** Luna publishes a rating
- **THEN** it reports Job-fit, Adoptability, and Headline separately
- **AND** shows each rating on a 10-point scale

#### Scenario: Headline is calculated from axis evidence
- **WHEN** Luna has scored all eight axes
- **THEN** it computes Job-fit and Adoptability from their specified four-axis means
- **AND** computes the headline using the fixed 45/55 formula

#### Scenario: Worked values are applied
- **WHEN** the axis values are Claim 4, Boot 4, Generation 4, Scale 3, Platforms 2, Stability 2, Exit 4, Adoption 1
- **THEN** Job-fit is 7.5/10 and Adoptability is 4.5/10
- **AND** Headline is 5.85/10, published as 6/10 rounded to a whole number
- **AND** Luna does not report 6.5 or 9/10 for this fixed calculation

### Requirement: The eight score axes use the stated anchors
Luna SHALL use these anchors and meanings:

| Axis | 1 | 3 | 5 |
|---|---|---|---|
| Claim vs code | README oversells | Claims match commands | Claims match commands and limits |
| Boot path | Tribal | Documented | Doctor, example, and known failure modes |
| Generation | Wrapper | Files exist | Regenerate/verify; user code is not smashed |
| Scale evidence | None | Fixture only | Fixture plus one real-shaped example |
| Platforms | One OS myth | Mac/Linux stated | Windows answered with a test, not a hope |
| Stability | 0.x in 1.x clothing | Caveats written | Caveats shrinking with CI |
| Exit | Vendor blob | Standard files | Documented “delete Flisk, keep stack” |
| Adoption risk | Ghost repo | Small + active | External users |

Luna SHALL score only these axes and SHALL connect every score to available evidence. A high score SHALL NOT be inferred solely from marketing comparisons or a dependency's reputation.

#### Scenario: Tilt is a dependency
- **WHEN** Luna observes that Flisk is built on Tilt
- **THEN** it does not transfer Tilt's stars or maturity to Flisk
- **AND** it evaluates Flisk evidence on the defined axes

#### Scenario: Axis score is not supported by evidence
- **WHEN** available evidence does not establish an axis anchor
- **THEN** Luna describes the evidence gap and limits confidence
- **AND** does not invent a successful run or product behavior

### Requirement: Popularity is adoption evidence, not product-quality evidence
Stars and forks SHALL NOT change the scores for Claim vs code, Boot path, Generation, or Scale evidence. Luna MAY mention stars, forks, and external usage under Adoption risk, and MAY describe them as adoption risk rather than product quality. Luna SHALL NOT call an ecosystem promising when the stated evidence shows no external users, nor treat Tilt's popularity as proof that Flisk is battle-tested.

#### Scenario: Flisk has few stars or forks
- **WHEN** Luna observes low stars or zero forks
- **THEN** it may cite those as adoption risk
- **AND** does not reduce a Job-fit axis because of them

#### Scenario: Dependency is popular
- **WHEN** Tilt has substantially more stars than Flisk
- **THEN** Luna does not attribute Tilt's popularity or maturity to Flisk

### Requirement: Evidence is described accurately and runtime claims are truthful
Luna SHALL prefer the README status line, `flisk doctor`, quickstart, published benchmarks, and issue tracker. Luna SHALL distinguish documented claims from commands and runtime results. If Luna did not run Flisk, it SHALL say so and cap runtime confidence; it SHALL NOT invent a boot. A 100-service boot of tiny `/health` containers SHALL be called a fixture, not an ERP or business application. Luna SHALL treat “young / 0.x caveats” as Stability evidence and SHALL NOT award the same fact again as an honesty bonus. Windows SHALL be evaluated based on test evidence, not assumption; Luna SHALL state native Windows and WSL2 status accurately.

#### Scenario: Luna did not run Flisk
- **WHEN** Luna's evaluation did not execute Flisk commands
- **THEN** `Did you run it` is `no`
- **AND** it identifies runtime confidence as limited
- **AND** it does not claim a boot was observed

#### Scenario: Benchmark is fixture-only
- **WHEN** a published benchmark uses 100 tiny `/health` containers
- **THEN** Luna identifies it as a fixture
- **AND** does not describe it as an ERP or real business workload

#### Scenario: README describes early stability
- **WHEN** README says “treat 1.x as 0.x” or equivalent
- **THEN** Luna scores that under Stability
- **AND** does not award an additional honesty bonus for the same fact

#### Scenario: Windows claims lack end-to-end tests
- **WHEN** Windows or WSL2 support is claimed without end-to-end test evidence
- **THEN** Luna does not award the top Platforms score based on the claim alone
- **AND** states the unverified status without dismissing Windows

#### Scenario: Marketing table compares products
- **WHEN** Luna encounters a marketing comparison table
- **THEN** it treats the table as a claim to verify, not proof by itself

### Requirement: Luna avoids banned scoring and framing habits
Luna SHALL NOT default to 6 or 7 merely to be safe, alter the rubric so the result lands on 92/100 or another target, ignore Windows based on personal preference, call an ecosystem promising when the cited evidence shows no external users, or create a specification whose only purpose is to raise the score. Scores SHALL reflect evidence under the fixed axes and formula, even when the result is low or inconvenient.

#### Scenario: Uncertainty is present
- **WHEN** Luna is uncertain about runtime behavior
- **THEN** it states the uncertainty and limits runtime confidence
- **AND** does not default to 6 or 7 as a safety score

#### Scenario: Desired score conflicts with evidence
- **WHEN** an expected or preferred score conflicts with evidence or fixed arithmetic
- **THEN** Luna reports the evidence-based calculation
- **AND** does not change axes, weights, or scores to fit the desired result

### Requirement: Luna uses the mandatory output format
Every evaluation SHALL use these fields and preserve their order:

```text
Job-fit:        _ / 10
Adoptability:   _ / 10
Headline:       _ / 10

Good for:
Not good for:
Strongest fact:
Weakest fact:
Did you run it: yes/no
```

#### Scenario: Report omits a required field
- **WHEN** Luna prepares the evaluation
- **THEN** it includes every field in the mandatory output format
- **AND** names at least one group that should not use Flisk

### Requirement: Supplied current-fill evidence is represented without overstating verification
When using the supplied worked example, Luna SHALL report the axis values Claim 4, Boot 4, Generation 4, Scale 3, Platforms 2, Stability 2, Exit 4, and Adoption 1, with the supplied reasons: commands exist but the 100-service copy can be misread; doctor and examples exist but Docker/Tilt/Bun are dependencies; manifest generation emits standard files with regeneration but the contract is young; scale is fixture-only; Mac/Linux are described while native Windows is unverified and WSL2 remains under test; README acknowledges 1.x/0.x stability; MIT and Docker/Tilt/TypeScript files support exit; and the supplied adoption snapshot is 2 stars, 0 forks, 67 issues. Luna SHALL identify these as supplied evidence unless independently verified, SHALL say it did not run Flisk when that is the case, and SHALL apply the fixed formula to derive a 5.85/10 headline (published as 6 rounded to a whole number). The separate proposed 6.5 headline SHALL NOT override the formula.

#### Scenario: Current-fill values are used
- **WHEN** Luna uses the user's supplied current-fill axis scores and facts
- **THEN** it reports Job-fit 7.5/10, Adoptability 4.5/10, and Headline 5.85/10, published as 6/10 rounded to a whole number
- **AND** labels the evidence as supplied rather than independently verified where applicable
- **AND** reports `Did you run it: no` if Luna did not execute Flisk

#### Scenario: Rating-process improvement is distinguished from product improvement
- **WHEN** Luna describes the effect of adopting this rating contract
- **THEN** it says the rating process improved but Flisk CLI did not
- **AND** does not imply the rubric change raised the product score
- **AND** states that the score uses the same evidence and that real product fixes are required before the rating can improve

### Requirement: The worked recommendation separates today's score from future product fixes
When using the supplied current evidence, Luna SHALL use this summary: “Job-fit is decent (7.5). Adopt now is weak (4.5). Headline 6/10. After real product fixes (stability, tested Windows/WSL, non-toy example, tracker hygiene), headline can move toward 8. Not before.” Luna SHALL present future improvement as conditional, not as a result already achieved or a guaranteed future score. The product gaps SHALL remain explicit: young 1.x stability, almost no external users, no demonstrated native Windows landscape boot, and a 100-service `/health` fixture rather than a non-toy application.

#### Scenario: Supplied product summary is published
- **WHEN** Luna publishes the current worked evaluation
- **THEN** it uses the specified summary and distinguishes current evidence from future conditions
- **AND** does not claim that this documentation-only rating change improved Flisk CLI

### Current evidence-based rescore (2026-10-01)

This dated rescore supersedes the earlier current-fill values for the current repository evidence; the earlier supplied worked example remains a historical example. The fixed axes, weights, and formula are unchanged.

| Axis | Score |
|---|---:|
| Claim vs code | 4 |
| Boot path | 4 |
| Generation | 5 |
| Scale evidence | 3 |
| Platforms | 4 |
| Stability | 2 |
| Exit | 4 |
| Adoption risk | 2 |

- Job-fit: `((4 + 4 + 5 + 3) / 4) × 2 = 8.0`
- Adoptability: `((4 + 2 + 4 + 2) / 4) × 2 = 6.0`
- Headline: `0.45×8.0 + 0.55×6.0 = 6.9`

Platforms is 4, not 5: the required main-branch job tests Docker Engine inside Ubuntu 24.04 WSL2 on `windows-2022`, while [`docs/wsl2.md`](https://github.com/flisk-sh/tdk-cli-core/blob/d8bc46b/docs/wsl2.md) still prescribes Docker Desktop. The [successful WSL2 run](https://github.com/flisk-sh/tdk-cli-core/actions/runs/36903887190) ran on `ad7c5c0`; the successful [main run on `d8bc46b`](https://github.com/flisk-sh/tdk-cli-core/actions/runs/36905524644) reconfirmed it. Only successful conclusions count; skipped, cancelled, and neutral results do not. The Stability score and its 1.x caveat remain unchanged. A Platforms 5 requires either tested Docker Desktop WSL integration or updating both the guide and `flisk doctor` guidance to make the tested Engine-in-WSL2 path the supported route.
