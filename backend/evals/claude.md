# Evals — Claude Code Context

## Purpose
This directory contains the promptfoo eval suite for JobInit. Evals are written TDD-style — they define what correct output looks like before the implementation produces it.

## Folder structure
One subdirectory per fixture under the chain being tested. Fixtures are shared at the chain level.

    evals/
      .gitignore
      claude.md
      BASELINE.md
      analyze-fit/
        fixtures/
          cresta-jd.md
          resume-a.md
          resume-b.md
        resume-a-cresta/
          promptfooconfig.yaml
          provider.ts
        resume-b-cresta/
          promptfooconfig.yaml
          provider.ts

## Provider pattern
Every fixture uses a custom TypeScript provider that wraps the real scoring graph — not a direct prompt or chain call. This ensures the eval tests the exact production code path.

The provider must:
- Be a class with id() and callApi() methods
- Import buildScoringGraph and invoke with interruptBefore: ["routeVerdicts"]
- Pass metadata: { run_type: "eval" } via RunnableConfig
- Return both output (JSON stringified result) and prompt (source text for g-eval grading)
- Handle errors by returning { error: error.message }

The graph runs analyzeJD + analyzeResume → atsGapAnalysis + analyzeFit and stops before verdict nodes. All four upstream nodes execute against real production code.

## Assertion layers
Every fixture uses four layers in order:

1. Structural — type: javascript, single inline expressions, no const, no return. Checks schema shape and valid enum values.
2. Binary critical checks — type: llm-rubric with metric tag. One specific pass/fail check per assertion. Rubrics must be anchored to specific resume content and JD language.
3. Multi-dimensional quality — type: g-eval with metric tag and threshold: 0.7. Multiple criteria per assertion, each graded independently and averaged.
4. Banned phrases — type: not-contains. Full list from research doc.

## Javascript assertion syntax
Promptfoo evaluates javascript values as single expressions — no const, no return, no multiline blocks. Always inline the parse logic:

    (typeof output === "string" ? JSON.parse(output) : output).fitScore < 60

Multiline blocks with const declarations cause "unexpected token return" or "undefined" errors.

## Grader model
- Generator: claude-haiku-4-5-20251001 (matches production chain)
- Grader: anthropic:messages:claude-sonnet-4-6 (more capable, reduces self-preference bias)

Set in defaultTest.options.provider.

## Derived metrics
Named metrics from assertions roll up into an OverallQuality score via derivedMetrics. Metric names are PascalCase. Every llm-rubric and g-eval assertion should have a metric tag.

## Running evals
From the fixture directory:

    cd evals/analyze-fit/resume-a-cresta
    promptfoo eval --env-file ../../../.env
    promptfoo view

Requires Node 22+. Install promptfoo via npm, not Homebrew.

## CI philosophy
Evals run in CI as informational only — continue-on-error: true. ADR 004 has shipped and baselines are established. Consider gating PRs on eval pass rate when baseline variance is understood well enough to set a reliable threshold. Current baselines: Resume A ~98%, Resume B ~95% (high variance on ScoreCalibration — known issue with domain-mismatched couldWork candidates).

## Fixture matrix

| Resume | JD | Expected scenario | Status |
|---|---|---|---|
| Resume A (no JobInit) | Cresta | honest_verdict | Baseline established — ~98% |
| Resume B (JobInit added) | Cresta | narrative_gap | Baseline established — ~95% |
| Resume A | Retool | TBD | Pending |
| Resume B | Retool | confirmed_fit | Pending |
| Resume A | Backend JD | confirmed_fit / narrative_gap | Pending |

## Grader context — when to include it

Not all assertions need context preambles. The rule:

**Include context when** the grader needs external knowledge to evaluate
the assertion — facts that cannot be derived from the model output alone.

**Skip context when** the grader just needs to read the output — things
directly visible in what the model produced.

Examples from resume-a-cresta baseline:
- TranslationLegitimacy — needs context: grader must know GraphQL and gRPC
  are fundamentally different protocols to evaluate whether the output
  correctly distinguished them. Without context, pass rate dropped from
  75% to 40% — not because the grader became more generous, but because
  it became inaccurate. The grader couldn't verify specific technical
  claims without the anchoring facts.
- HardGapAcknowledged — no context needed: grader can read battle card
  verdicts directly from the output.

Counter-intuitive finding: removing context did not make the grader more
generous — it made it less accurate. The grader defaulted to conservative
judgment when it couldn't verify specific technical criteria, failing valid
outputs. Context reduces grader discretion and improves accuracy, not
leniency.

The assertions that need context are also signals about what the generator
needs — if the grader can't evaluate without external knowledge, the prompt
probably needs that knowledge injected too.

## Score thresholds (ADR 004 + routing update)
- confirmed_fit / invisible_expert: fitScore >= 80
- narrative_gap: fitScore 60–79
- honest_verdict: fitScore < 60

Eval assertions should use < 60 not < 50 for honest_verdict calibration checks.