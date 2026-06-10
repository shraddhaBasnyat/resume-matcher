# Evals — Claude Code Context

## Purpose
This directory contains the promptfoo eval suite for JobInit. Evals are written TDD-style — they define what correct output looks like before the implementation produces it. Failures are expected until the new graph architecture ships.

## Folder structure
One subdirectory per fixture. Each fixture tests one specific resume/JD combination against one node.

    evals/
      .gitignore
      claude.md
      f1-resume-a-cresta/
        promptfooconfig.yaml
        provider.ts
        fixtures/
          resume-a.md
          cresta-jd.md

## Provider pattern
Every fixture uses a custom TypeScript provider that wraps the real chain — not a direct prompt call. This ensures the eval tests the exact production code path including withStructuredOutput.

The provider must:
- Be a class with id() and callApi() methods
- Import the chain using a static ESM import
- Return both output (JSON stringified result) and prompt (source text for g-eval grading)
- Handle errors by returning { error: error.message }

## Assertion layers
Every fixture uses four layers in order:

1. Structural — type: javascript, single inline expressions, no const, no return. Checks schema shape and valid enum values.
2. Binary critical checks — type: llm-rubric with metric tag. One specific pass/fail check per assertion. Rubrics must be anchored to specific resume content and JD language.
3. Multi-dimensional quality — type: g-eval with metric tag and threshold: 0.7. Multiple criteria per assertion, each graded independently and averaged.
4. Banned phrases — type: not-contains. Full list from research doc.

## Javascript assertion syntax
Promptfoo evaluates javascript values as single expressions — no const, no return, no multiline blocks. Always inline the parse logic:

    (typeof output === "string" ? JSON.parse(output) : output).fitScore < 55

Multiline blocks with const declarations cause "unexpected token return" or "undefined" errors.

## Grader model
- Generator: claude-haiku-4-5-20251001 (matches production chain)
- Grader: anthropic:messages:claude-sonnet-4-6 (more capable, reduces self-preference bias)

Set in defaultTest.options.provider.

## Derived metrics
Named metrics from assertions roll up into OverallF1Quality via derivedMetrics. Metric names are PascalCase. Every llm-rubric and g-eval assertion should have a metric tag.

## Running evals
From the fixture directory:

    cd evals/f1-resume-a-cresta
    promptfoo eval --env-file ../../.env
    promptfoo view

Requires Node 22+. Install promptfoo via npm, not Homebrew.

## CI philosophy
Evals run in CI as informational only — continue-on-error: true. Do not hard-gate PRs on eval pass rate until the new graph architecture ships. The current baseline has known failures expected to resolve with the new architecture.

## Fixture matrix

| ID | Resume | JD | Expected scenario | Status |
|---|---|---|---|---|
| F1 | Resume A (no JobInit) | Cresta | honest_verdict | Baseline established |
| F2 | Resume B (JobInit added) | Cresta | narrative_gap / confirmed_fit | Pending |
| F3 | Resume A | Retool | TBD | Pending |
| F4 | Resume B | Retool | confirmed_fit | Pending |
| F5 | Resume A | Backend JD | confirmed_fit / narrative_gap | Pending |

## F1 baseline (established 2026-06-10)
- Pass rate: 94% (36/39)
- fitScore: 62 (target: <55 after new architecture ships)
- HardGapAcknowledged: 1.00
- SpecificityTest: 1.00
- SummaryQuality: 0.73
- AhaQuality: 0.63
- TranslationLegitimacy: 0.40
- ScoreCalibration: 0.00 (expected failure — TDD)