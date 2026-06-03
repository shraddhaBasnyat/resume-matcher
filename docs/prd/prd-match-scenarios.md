# PRD: Match Scenarios, Score Branching & Contextual Prompting

**Status:** Updated — archetype system integration, ATS path overhaul
**Author:** sbasnyat
**Last updated:** 2026-06-02
**Supersedes:** version dated 2026-04-28
**See also:** prd-graph-architecture.md for node responsibilities and graph topology

---

## Problem

The scoring chain has one mode: score the resume against the job and produce advice. This produces poor results across the range of real user situations for three reasons.

First, it conflates two independent questions: can a machine read this resume, and does this candidate actually match this role. These require different analysis modes and should surface as independent signals to the user.

Second, it treats all analysis as a single pass. The score is produced alongside the advice in one chain call, which means the advice is generated without knowing what scenario the user is actually in. A confirmed strong match needs sparse validation. A narrative gap needs reframing. A genuine weak match needs an honest verdict. The same prompt cannot serve all three well.

Third, the ATS signal was a single score with no explanatory structure. A candidate who fails on terminology needs different advice than one who fails on formatting. Blending these into one number obscures the actual problem and the actual fix.

---

## Goals

- Separate ATS analysis from fit analysis — two independent signals always surfaced to the user
- ATS path surfaces mechanical facts — no inference, no judgment
- Verdict nodes own coaching advice — one fires per run, calibrated to the scenario
- Route to the correct scenario using two signals only: `fitScore` and `atsScore`
- HITL fires once maximum in Honest Verdict
- Archetype enrichment available on paid tier — does not change routing, changes advice depth

---

## Non-goals

- Graph topology and node responsibilities (see `prd-graph-architecture.md`)
- Archetype registry and injection details (see `prd-archetype-system.md`)
- Eval harness design (separate PRD)
- Payment infrastructure and billing
- Multi-model routing per node

---

## The division of labor: ATS panel vs. fit analysis

These are two different people's perspectives on the same application.

**ATS panel** is the recruiter's view — mechanical, literal, searchable. It answers: will you be seen? It surfaces keyword gaps and formatting problems as facts. It never speculates about human judgment.

**Fit analysis** is the hiring manager's view — inferential, semantic, human. It answers: once seen, will you be wanted? It owns career pattern assessment, transferability judgments, and honest gap assessment. It never touches keyword lists, formatting, or terminology.

This division is strict. Fit analysis does not restate ATS findings. ATS analysis does not speculate about human judgment. A candidate who passes all ATS checks perfectly can still have a weak fit score. A candidate who fails every ATS check can be the strongest human match in the pool. The two signals are orthogonal.

---

## Product tiers

### Base tier (free / all users)
- Two-dimensional scoring — `fitScore` and `atsScore` independently, always surfaced
- Full ATS panel — formatting flags, recruiter search, terminology mismatches as facts
- Four scenario routing — Confirmed Fit, Invisible Expert, Narrative Gap, Honest Verdict
- HITL for Honest Verdict — one exchange maximum
- Generic verdict node advice — not enriched by archetype or intent context
- `intent` defaults to `confident_match`, `intentContext` defaults to `{ basis: ["direct_experience"] }`

### Paid tier
- Everything in base tier
- Archetype enrichment — verdict node prompt enriched with real ask, archetype probe pattern, career arc, and transition-specific coaching
- Intent enrichment — `intent` and `intentContext` collected from user and injected into verdict node
- Routing logic does not change between tiers — only prompt richness changes

---

## Two-dimensional scoring

Every run produces two independent scores:

**`fitScore`** — does this candidate actually match this role? Career pattern, demonstrated evidence, transferable work. Semantic, inferential.

**`atsScore`** — can a machine read this resume and surface it for this role? Keyword presence, formatting parseability, terminology matching. Mechanical, literal. Weighted toward recruiter search as the most actionable signal.

These are orthogonal. Both are always returned in the API response and always surfaced in the UI.

---

## Scenario routing

Routing uses two signals only: `fitScore` and `atsScore`.

| scenarioId | fitScore | atsScore | Verdict node |
|---|---|---|---|
| `confirmed_fit` | >= 75 | >= 75 or null | `analyzeStrongMatch` |
| `invisible_expert` | >= 75 | < 75 | `analyzeStrongMatch` |
| `narrative_gap` | 50–74 | any | `analyzeNarrativeGap` |
| `honest_verdict` | < 50 | any | `analyzeSkepticalReconciliation` |

---

## Archetype match — coarse prior for fit scoring

The comparison between `candidateArchetype` (from resume analysis) and `jdArchetype` (from JD analysis) provides a coarse prior that informs fit scoring:

```
candidateArchetype === jdArchetype.ideal     → strong match territory
candidateArchetype in jdArchetype.couldWork  → narrative gap territory
neither                                      → honest verdict territory
```

This is a prior, not a constraint. Battle card evidence and demonstrated experience are the fine-grained signal. A candidate in `couldWork` territory with strong demonstrated evidence can score higher than the tier suggests.

---

## Scenario profiles

### Scenario 1 — The Confirmed Fit
**fitScore >= 75, atsScore >= 75**

**Who they are:** A candidate who genuinely matches the role and has a well-structured, keyword-rich resume. They want confirmation.

**What they're feeling:** Hopeful and looking for validation. They believe they are qualified and want the tool to confirm they aren't second-guessing themselves unnecessarily.

**What success looks like:** They close the tool feeling energised and ready to apply without hesitation. Sparse output is correct output here — padding erodes trust.

**ATS panel role:** All checks are clear. Show it clearly. The panel's job is to confirm there's nothing to fix, not to find problems.

**Fit analysis role:** Confirms the human match with specific strengths named from the actual resume. No generic encouragement.

---

### Scenario 2 — The Invisible Expert
**fitScore >= 75, atsScore < 75**

**Who they are:** A highly qualified candidate whose resume is invisible to automated filters due to terminology choices or formatting. They keep not getting interviews despite knowing they are the right person for the role.

**What they're feeling:** Frustrated and bewildered. They know they are qualified but aren't getting traction.

**What success looks like:** A massive sense of relief. They realise the problem isn't their talent — it's a translation issue. They close the tool knowing exactly which terminology swaps will make them visible.

**ATS panel role:** This is the scenario where the ATS panel does its most important work. Terminology diffs surface as inline before/after rewrites on the candidate's own sentences — no user prompt required. The panel is the product for this user.

**Fit analysis role:** Confirms clearly that the qualification is real and strong. Load-bearing for the emotional arc — the candidate needs to hear "you match this role" before the ATS panel's explanation of why they're invisible lands as relief rather than another rejection.

**Critical:** The fit analysis must not restate the terminology gaps. The fit analysis speaks to the human match. The ATS panel speaks to the mechanical fix. They are separate voices.

---

### Scenario 3 — The Narrative Gap
**fitScore 50–74, atsScore any**

**Who they are:** A professional whose career trajectory and transferable skills fit the role well, but whose resume reads as a literal history of past job titles rather than a narrative pointing toward a future role.

**What they're feeling:** Anxious and slightly insecure. They worry that because they haven't held this exact title before, no one will take them seriously.

**What success looks like:** They feel seen and understood. The moment they realise they already have the experience — it's just not framed to show it. They close the tool knowing exactly how to reframe their existing story.

**ATS panel role:** May be entirely clean — `atsScore` can be high even when `fitScore` is mid-range. If the panel is clean, show it clearly and briefly: "Your resume is readable and surfaces in search. The gap is not mechanical."

**Fit analysis role:** This node owns this scenario entirely. Reframing suggestions must be specific to this candidate's actual experience. The specificity test applies with full force: could this reframing suggestion have been written without reading this specific resume? If yes, it fails.

---

### Scenario 4 — The Honest Verdict
**fitScore < 50, atsScore any**

**Who they are:** A candidate whose confidence may not be grounded in the evidence. The gap is real.

**What they're feeling:** Defensive initially, then potentially deflated.

**What success looks like:** They feel respected even though the answer may be no. The tool doesn't manufacture false hope. The verdict is direct and specific — not cruel, not generic, but honest in a way that a trusted mentor would be. They close the session knowing clearly why the gap exists and what it would actually take to close it. Clarity over comfort.

**ATS panel role:** Secondary. The gap is in the fit score, not the ATS score. Surface the ATS panel normally but it does not soften the honest verdict.

**HITL note:** HITL fires once maximum per run. If the rescore moves `fitScore` above 50, the user lands in Narrative Gap or Confirmed Fit instead. `hitlFired` prevents a second interrupt.

---

## Paid tier enrichment

The four scenarios above are the base product. On the paid tier, two context layers enrich the advice without changing the routing:

**Archetype context** — verdict node prompt enriched with the role's real ask, the archetype's interview probe pattern, the candidate's career arc transitions, and transition-specific coaching data. The scenario doesn't change — the advice gets more specific.

**Intent context** — when the user declares their intent and current status, the verdict node prompt is calibrated to their declared situation. Base tier always defaults to `confident_match` + `direct_experience`.

Neither enrichment changes which scenario the user is in. They change how specifically the verdict node speaks to that user's situation.

---

## Tone principles across all scenarios

**Never manufacture advice.** Empty `fitAdvice` on a strong match is correct. Padding to appear thorough erodes trust faster than saying nothing.

**Honesty over comfort, but never cruelty.** Scenario 4 especially. The tool is a trusted mentor, not a rejection machine.

**Specificity is the product.** Generic advice — "strengthen your experience section," "highlight your skills" — is the failure mode in every scenario. The test for any output: could this have been written without reading this specific resume and this specific job description? If yes, it's generic.

**The ATS panel and fit analysis are separate voices.** They do not restate each other. The fit analysis does not mention keyword gaps. The ATS panel does not speculate about career narrative or human judgment.

**The user's emotional state is the context.** Tone is not decoration — it is part of the output quality.

---

## Public API — PublicMatchResponse

```ts
{
  scenarioId: "confirmed_fit" | "invisible_expert" | "narrative_gap" | "honest_verdict"

  fitScore: number

  battleCard: {
    headline: string
    bullets: {
      requirement: string
      evidence: string
      verdict: "strong_match" | "framing_gap" | "terminology_gap" | "hard_gap" | "evidence_gap"
    }[]
  }

  fitAdvice: {
    key: string
    items: Item[]
  }[]

  atsProfile: {
    atsScore: number | null
    machineParsing: {
      flags: string[]
      likelyTwoColumn: boolean
      hasTablesOrGraphics: boolean
      contactInHeaderFooter: boolean
      inconsistentDateFormats: boolean
      nonStandardBullets: boolean
      missingSections: string[]
    }
    recruiterSearch: {
      recruiterFilter: string
      termGaps: { term: string, status: "missing" | "present_no_context" | "present_demonstrated" }[]
      terminologyMismatches: { resumeUses: string, jdExpects: string }[]
    }
    machineRanking: string[]
  }

  terminologyDiffs: {
    location: string
    swapLabel: string
    before: string
    after: string
  }[]

  scenarioSummary: { text: string }

  threadId: string
  _meta: { durationMs: number }
}
```

Changes from prior version:
- `knockoutQuestions` removed from `atsProfile`
- `battleCard.bullets[].verdict` adds `evidence_gap` as fifth value
- `atsProfile.recruiterSearch.likelySearchQuery` renamed to `recruiterFilter`
- `atsProfile.recruiterSearch.termGaps` replaces `termsPresentInResume` / `termsMissingFromResume`

---

## HITL flow

Unchanged. HITL fires inside `analyzeSkepticalReconciliation` only. Maximum one exchange per run. If `fitScore` moves above 50 after HITL, the user lands in a different scenario. `hitlFired` is a loop guard only — not a routing input.

---

## SSE events

| Event | Payload | When |
|---|---|---|
| `meta` | `threadId`, `rootRunId`, `runStartTime` | Before graph invocation |
| `node_start` | `node`, `timestamp` | Tracked node begins |
| `node_done` | see per-node spec below | Tracked node completes |
| `completed` | `result: PublicMatchResponse` | Graph ran to completion |
| `interrupted` | `fitScore`, `threadId`, `contextPrompt` | HITL interrupt fired |
| `error` | `error`, `message` | Any execution error |

### `node_done` payload — per node

```typescript
// atsGapAnalysis
{ node: "atsGapAnalysis", durationMs, timestamp,
  aha: string }

// analyzeFit
{ node: "analyzeFit", durationMs, timestamp,
  aha: string }

// routeVerdicts
{ node: "routeVerdicts", durationMs: 0, timestamp,
  fitScore: number, atsScore: number | null, scenarioId: ScenarioId }

// verdict nodes
{ node: string, durationMs, timestamp,
  aha: string }
```

### Provenance trail — logic pill content

```
Beat 1  atsGapAnalysis done  → aha string
Beat 2  analyzeFit done      → aha string
Beat 3  routeVerdicts done   → "fit {score} · ATS {score} → {scenario}" (deterministic)
Beat 4  verdict node done    → aha string + "Results ready — collapse to view"
```

---

## Open questions

- Should `terminologyDiffs` be capped at N results?
- Should the `recruiterFilter` string be surfaced directly in the UI as the filter query?

---

## Out of scope for this PRD

- Graph topology and node responsibilities (see `prd-graph-architecture.md`)
- Archetype injection details (see `prd-archetype-system.md`)
- Specific prompt copy for each verdict node
- Model selection per node
- Frontend UI implementation details
- Eval harness design
- Payment infrastructure