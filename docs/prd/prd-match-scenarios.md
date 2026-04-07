# PRD: Match Scenarios, Score Branching & Contextual Prompting

**Status:** Draft
**Author:** sbasnyat
**Last updated:** 2026-04-06
**Supersedes:** previous version dated 2026-04-05

---

## Problem

The scoring chain has one mode: score the resume against the job and produce advice. This produces poor results across the range of real user situations for two reasons.

First, it conflates two independent questions: can a machine read this resume, and does this candidate actually match this role. These require different analysis modes and should surface as independent signals to the user.

Second, it treats all analysis as a single pass. The score is produced alongside the advice in one chain call, which means the advice is generated without knowing what scenario the user is actually in. A confirmed strong match needs sparse validation. A narrative gap needs reframing. A genuine weak match needs an honest verdict. The same prompt cannot serve all three well.

---

## Goals

- Separate ATS analysis from fit analysis — two independent signals always surfaced to the user
- `scoreMatch` produces a clean score and factual narrative summary — no advice
- Verdict nodes own advice — one fires per run, calibrated to the scenario
- Route to the correct scenario using two signals only: `fitScore` and `atsScore`
- HITL fires once maximum in Honest Verdict — rescore may move the user to a different scenario
- Gate archetype and intent enrichment behind the paid tier — base product is clean two-dimensional scoring and scenario-specific advice

---

## Non-goals

- Archetype registry and injection details (see `prd-archetype-system.md`)
- Eval harness design (separate PRD)
- Payment infrastructure and billing
- Multi-model routing per node

---

## Product tiers

### Base tier (free / all users)
- Two-dimensional scoring — `fitScore` and `atsScore` independently, always surfaced
- Four scenario routing — Confirmed Fit, Invisible Expert, Narrative Gap, Honest Verdict
- HITL for Honest Verdict — one exchange maximum
- Generic verdict node advice — not enriched by archetype or intent context
- `intent` defaults to `confident_match`, `intentContext` defaults to `{ basis: ["direct_experience"] }` — never from client on base tier

### Paid tier
- Everything in base tier
- Archetype enrichment — when a known transition is detected, verdict node prompt is enriched with transition-specific coaching data
- Intent enrichment — `intent` and `intentContext` are collected from the user and injected into the verdict node prompt for calibrated advice
- Routing logic does not change between tiers — only prompt richness changes

---

## Two-dimensional scoring

Every run produces two independent scores:

**`fitScore`** — does this candidate actually match this role? Career narrative, transferable skills, trajectory. Semantic, inferential. Produced by `scoreMatch`.

**`atsScore`** — can a machine read this resume and surface it for this role? Keyword density, layout parseability, terminology matching. Mechanical, literal. Produced by `atsAnalysis`.

These are orthogonal. A candidate can score high on one and low on the other. Both are always returned in the API response and always surfaced in the UI. `atsProfile` provides the structured detail behind `atsScore`.

---

## Graph topology

```
resumeText + jobText
      ↓
parseResumeFit + parseJobFit + atsAnalysis  (parallel)
      ↓
scoreMatch  →  fitScore, matchedSkills, missingSkills, narrativeAlignment
      ↓
detectArchetype  (pure lookup, no LLM — paid tier enrichment only)
      ↓
routeVerdicts  (deriveScenario — pure function, no LLM)
      ↓
one verdict node  (analyzeStrongMatch | analyzeNarrativeGap | analyzeSkepticalReconciliation)
      ↓
END
```

`atsAnalysis` runs in parallel with the fit parse nodes. Its output (`atsScore`, `atsProfile`) is in state before `scoreMatch` runs and is available to verdict nodes.

---

## Scenario routing — deriveScenario

Pure function. No LLM call. Two inputs only.

```typescript
deriveScenario(fitScore: number, atsScore: number | undefined): ScenarioId
```

| fitScore | atsScore | ScenarioId | Verdict node |
|---|---|---|---|
| >= 75 | >= 75 or undefined | `confirmed_fit` | `analyzeStrongMatch` |
| >= 75 | < 75 | `invisible_expert` | `analyzeStrongMatch` |
| 50–74 | any | `narrative_gap` | `analyzeNarrativeGap` |
| < 50 | any | `honest_verdict` | `analyzeSkepticalReconciliation` |

`atsScore` is `undefined` until the ATS pipeline is built. Routing treats `undefined` as passing — `confirmed_fit` or `narrative_gap` depending on `fitScore`.

---

## Node responsibilities

### `atsAnalysis`
Single node, single LLM call. Reads raw resume text and job text directly.

**Outputs:**
- `atsScore` — 0–100
- `atsProfile.missingKeywords` — required keywords absent from resume
- `atsProfile.layoutFlags` — parsing issues (missing sections, non-standard headers, etc.)
- `atsProfile.terminologyGaps` — where candidate uses different terminology than the job posting

### `scoreMatch`
Single node, single LLM call. Reads parsed resume and job data.

**Outputs:**
- `fitScore` — 0–100
- `matchedSkills` — skills the candidate has that the job requires
- `missingSkills` — required skills the candidate lacks
- `narrativeAlignment` — factual summary of how the career narrative maps to the role. Not advice — a reality check the verdict node builds from.
- `weakMatch` — derived deterministically as `fitScore < 50`. LLM does not output this.
- `weakMatchReason` — only when `fitScore < 50`. Specific explanation of why the gap is real.
- `contextPrompt` — nullable. The specific question that would change the assessment. Null when no context would help.

### `analyzeStrongMatch`
Fires for `confirmed_fit` and `invisible_expert`. Reads `fitScore`, `matchedSkills`, `missingSkills`, `narrativeAlignment`, `atsProfile` from state.

Produces `fitAdvice` — confirmation of fit. For `invisible_expert`, incorporates ATS reality check from `atsProfile`. Sparse output is correct when there is little to say.

### `analyzeNarrativeGap`
Fires for `narrative_gap`. Reads same state fields.

Produces `fitAdvice` — specific reframing advice. How to retell existing experience to fit the target role. No "go learn X" advice — the experience is right, the framing is wrong.

### `analyzeSkepticalReconciliation`
Fires for `honest_verdict`. Reads same state fields.

First pass (`hitlFired === false`):
- If `contextPrompt` is non-null — calls `interrupt()`, suspends graph, waits for human context. Sets `hitlFired: true`.
- If `contextPrompt` is null — gap is real, no context would help. Returns `fitAdvice` with `weakMatchReason`. No interrupt.

Second pass (`hitlFired === true`):
- Rescore has already run with `humanContext` in state.
- `deriveScenario` re-ran — if score moved, user is now in a different scenario.
- If still in `honest_verdict` — produce `fitAdvice` with `weakMatchReason`. No second interrupt.

---

## HITL flow

HITL fires inside `analyzeSkepticalReconciliation` only. Maximum one exchange per run.

```
analyzeSkepticalReconciliation (first pass)
  → contextPrompt non-null → interrupt → user provides humanContext
  → graph resumes → scoreMatch (with humanContext) → detectArchetype → routeVerdicts
  → deriveScenario re-runs with new fitScore
  → lands in whatever scenario the new score maps to
```

If `fitScore` moves above 50 after HITL, the user lands in `narrative_gap` or `confirmed_fit`. If it stays below 50, they land in `honest_verdict` again but `hitlFired: true` prevents a second interrupt.

`hitlFired` is a loop guard only — not a routing input to `deriveScenario`.

---

## Request body

```typescript
{
  resumeText: string
  jobText: string
  intent: "confident_match" | "exploring_gap"          // base tier: always "confident_match"
  intentContext: ConfidentMatchContext | ExploringGapContext  // base tier: always { basis: ["direct_experience"] }
}
```

`intent` and `intentContext` are accepted but ignored on base tier. On paid tier they are injected into the verdict node prompt as context enrichment. They never affect routing.

HITL resume: `POST /api/match/resume` accepts `{ threadId: string, humanContext: string }`. `humanContext` validated as `z.string().min(1)`.

---

## API response shape

```typescript
{
  // Fit scoring — always present, flat
  fitScore: number
  matchedSkills: string[]
  missingSkills: string[]
  narrativeAlignment: string
  weakMatch: boolean
  weakMatchReason: string | null

  // ATS scoring — always present, nested
  atsProfile: {
    atsScore: number | null          // null until ATS pipeline ships
    missingKeywords: string[]
    layoutFlags: string[]
    terminologyGaps: string[]
  }

  // Advice — always present
  fitAdvice: Record<string, unknown>

  // Meta — always present
  scenarioId: ScenarioId
  hitlFired: boolean
  contextPrompt: string | null      // the question asked during HITL, null if no HITL
  threadId: string
}
```

`resumeData` and `jobData` are internal graph state — never included in the API response.

---

## Graph state — key fields

| Field | Type | Set by | Notes |
|---|---|---|---|
| `fitScore` | `number` | `scoreMatch` | Renamed from `score` in Pass 1 |
| `atsScore` | `number \| undefined` | `atsAnalysis` | undefined until ATS pipeline ships |
| `atsProfile` | `AtsProfile \| undefined` | `atsAnalysis` | undefined until ATS pipeline ships |
| `narrativeAlignment` | `string` | `scoreMatch` | Factual summary, not advice |
| `archetypeContext` | `ArchetypeContext \| null` | `detectArchetype` | null on base tier |
| `hitlFired` | `boolean` | `analyzeSkepticalReconciliation` | Loop guard only |
| `userTier` | `"base" \| "paid"` | Auth middleware | Hardcoded `"base"` until auth lands |
| `intent` | `"confident_match" \| "exploring_gap"` | Request body | Base tier always `"confident_match"` |
| `intentContext` | `ConfidentMatchContext \| ExploringGapContext` | Request body | Base tier always `{ basis: ["direct_experience"] }` |
| `scenarioId` | `ScenarioId` | `routeVerdicts` | Written atomically with branch dispatch |
| `fitAdvice` | `Record<string, unknown>` | Verdict node | Shape defined per node in implementation |

---

## Resolved decisions

**Two signals drive routing.** `fitScore` and `atsScore` only. Intent, archetype, and `hitlFired` do not affect `deriveScenario`. They affect prompt richness (intent, archetype) or are loop guards (`hitlFired`).

**`scoreMatch` outputs `narrativeAlignment`, not advice.** Factual summary of how the career narrative maps to the role. Verdict nodes own advice framing — they read `narrativeAlignment` from state and build from it.

**`atsAnalysis` is a single node.** Parse and gap analysis combined. No separate `parseResumeATS` / `parseJobATS` nodes — the analysis needs both resume and job anyway.

**`analyzeATSGap` node removed.** ATS reality check surfaces via `atsProfile` directly to the UI. Verdict nodes read `atsProfile` from state when relevant (especially `analyzeStrongMatch` for `invisible_expert`). No separate ATS advice node.

**`analyzeRoadmap` and `analyzeArchetypeGap` removed from graph.** Archetype enrichment is prompt injection into the verdict node on paid tier, not a separate routing branch. Roadmap is out of scope for this phase.

**`intent` and `intentContext` stay in request body.** Base tier ignores them for routing and prompt enrichment. Paid tier uses them for prompt calibration. Collecting them now means no request shape change when paid tier ships.

**Four scenarios, not nine.** Collapsed from the previous design. HITL is an implementation detail within Honest Verdict — not a separate persona.

---

## Open questions

- Should `narrativeAlignment` be a structured object or a string? Current implementation is a string. A structured object would be more injectable into verdict node prompts.
- Should `atsProfile` fields be populated with empty arrays when `atsScore` is null, or should the entire `atsProfile` be null until the ATS pipeline ships?
- Minimum `fitScore` threshold — is there a score below which we skip verdict node analysis entirely and return just `weakMatchReason`?

---

## Out of scope for this PRD

- Archetype injection details (see `prd-archetype-system.md`)
- Specific prompt copy for each verdict node (owned by implementation, validated by eval harness)
- Model selection per node
- Frontend UI implementation
- Eval harness design
- Payment infrastructure