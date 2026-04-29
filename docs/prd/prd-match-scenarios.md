# PRD: Match Scenarios, Score Branching & Contextual Prompting

**Status:** Updated — ATS three-layer model + terminology fixes node
**Author:** sbasnyat
**Last updated:** 2026-04-28
**Supersedes:** version dated 2026-04-06

---

## Problem

The scoring chain has one mode: score the resume against the job and produce advice. This produces poor results across the range of real user situations for three reasons.

First, it conflates two independent questions: can a machine read this resume, and does this candidate actually match this role. These require different analysis modes and should surface as independent signals to the user.

Second, it treats all analysis as a single pass. The score is produced alongside the advice in one chain call, which means the advice is generated without knowing what scenario the user is actually in. A confirmed strong match needs sparse validation. A narrative gap needs reframing. A genuine weak match needs an honest verdict. The same prompt cannot serve all three well.

Third, the ATS signal was a single score with no explanatory structure. A candidate who fails on terminology (Layer 3) needs different advice than one who fails on formatting (Layer 1) or knockout questions (Layer 2). Blending these into one number obscures the actual problem and the actual fix.

---

## Goals

- Separate ATS analysis from fit analysis — two independent signals always surfaced to the user
- ATS analysis covers three distinct layers: machine parsing, knockout filters, recruiter search
- `generateTerminologyFixes` surfaces exact before/after diffs automatically — no user prompt required
- `analyzeFit` produces a clean score and factual narrative summary — no mechanical advice
- Verdict nodes own coaching advice — one fires per run, calibrated to the scenario
- Route to the correct scenario using two signals only: `fitScore` and `atsScore`
- HITL fires once maximum in Honest Verdict
- Gate archetype and intent enrichment behind the paid tier

---

## Non-goals

- Archetype registry and injection details (see `prd-archetype-system.md`)
- Eval harness design (separate PRD)
- Payment infrastructure and billing
- Multi-model routing per node

---

## The division of labor: ATS panel vs. fit analysis

These are two different people's perspectives on the same application.

**ATS panel** is the recruiter's view — mechanical, literal, searchable. It answers: will you be seen? It owns all three parsing and discoverability problems. It produces actionable fixes automatically.

**Fit analysis** is the hiring manager's view — inferential, narrative, human. It answers: once seen, will you be wanted? It owns career trajectory, transferability judgments, and honest gap assessment. It never touches keyword lists, formatting, or terminology.

This division is strict. Fit analysis does not restate ATS findings in softer language. ATS analysis does not speculate about human judgment. A candidate who passes all three ATS layers perfectly can still have a weak fit score. A candidate who fails every ATS layer can be the strongest human match in the pool. The two signals are orthogonal.

---

## Product tiers

### Base tier (free / all users)
- Two-dimensional scoring — `fitScore` and `atsScore` independently, always surfaced
- Full three-layer ATS panel — machine parsing, knockout questions, recruiter search
- Automatic terminology diffs — `terminologyDiffs[]` generated without user prompt
- Four scenario routing — Confirmed Fit, Invisible Expert, Narrative Gap, Honest Verdict
- HITL for Honest Verdict — one exchange maximum
- Generic verdict node advice — not enriched by archetype or intent context
- `intent` defaults to `confident_match`, `intentContext` defaults to `{ basis: ["direct_experience"] }`

### Paid tier
- Everything in base tier
- Archetype enrichment — verdict node prompt enriched with transition-specific coaching data
- Intent enrichment — `intent` and `intentContext` collected from user and injected into verdict node
- Routing logic does not change between tiers — only prompt richness changes

---

## Two-dimensional scoring

Every run produces two independent scores:

**`fitScore`** — does this candidate actually match this role? Career narrative, transferable skills, trajectory. Semantic, inferential. Produced by `analyzeFit`.

**`atsScore`** — can a machine read this resume and surface it for this role? Keyword density, layout parseability, terminology matching. Mechanical, literal. Produced by `atsAnalysis`. Composite of all three layers, weighted toward Layer 3 (recruiter search) as the most actionable signal.

These are orthogonal. Both are always returned in the API response and always surfaced in the UI.

---

## Graph topology

```
resumeText + jobText
      ↓
atsAnalysis ─────────────────── analyzeFit    (parallel, both read raw text)
      ↓                               ↓
generateTerminologyFixes         routeVerdicts
(parallel with analyzeFit,            ↓
 reads atsAnalysis output)      one verdict node fires:
      ↓                         analyzeStrongMatch |
      └──────────────────────── analyzeNarrativeGap |
                                analyzeSkepticalReconciliation
                                      ↓
                                     END
```

`atsAnalysis` and `analyzeFit` run in parallel. `generateTerminologyFixes` fans out from `atsAnalysis` output immediately — it does not wait for `analyzeFit`. The verdict node has access to both `atsProfile` and `terminologyDiffs` from state.

---

## Node responsibilities

### `atsAnalysis`

Single node, single LLM call. Reads raw resume text and job text directly. Mechanical and literal — no semantic inference.

**Prompt framing:** The LLM plays two roles simultaneously: a recruiter configuring knockout questions before posting the job, and a recruiter running a Boolean search query to find candidates. This framing produces more realistic output than asking for "ATS analysis" abstractly.

**Output schema:**
```ts
{
  atsScore: number              // 0–100, composite weighted toward Layer 3

  // Layer 1 — formatting (inferred from text artifacts)
  machineParsing: {
    likelyTwoColumn: boolean
    hasTablesOrGraphics: boolean
    contactInHeaderFooter: boolean
    inconsistentDateFormats: boolean
    nonStandardBullets: boolean
    missingSections: string[]   // e.g. ["skills section", "summary"]
    flags: string[]             // human-readable summary of issues found
  }

  // Layer 2 — knockout questions (LLM acts as recruiter setting gates)
  knockoutQuestions: {
    question: string            // e.g. "Are you authorized to work in the US?"
    inferredFromJD: string      // the JD phrase that implies this requirement
    candidatePasses: boolean | null  // null = cannot determine from resume
    riskLevel: "pass" | "at_risk" | "unknown"
  }[]

  // Layer 3 — recruiter search (LLM acts as recruiter running Boolean query)
  recruiterSearch: {
    likelySearchQuery: string   // e.g. "LangGraph AND (Python OR TypeScript) NOT junior"
    termsPresentInResume: string[]
    termsMissingFromResume: string[]
    terminologyMismatches: {
      resumeUses: string        // e.g. "agent orchestration"
      jdExpects: string         // e.g. "agentic systems"
    }[]
  }

  machineRanking: string[]      // keyword gap summary strings for UI display
}
```

**Node logic after LLM call:**
```ts
// atsScore composite weighting
// Layer 3 carries 60% weight — it's the most actionable and most common failure
// Layer 2 carries 25% weight — knockout risk is high-stakes
// Layer 1 carries 15% weight — formatting issues are fixable but rarer
atsResult.machineParsing = { ...parsed, flags: derivedFlags }
```

**Layer 1 limitation:** The LLM infers formatting problems from text artifacts (garbled text, inconsistent dates, missing sections). It cannot detect two-column layout from plain text because the text is already linearized by the time it arrives. For Phase 1, LLM inference is sufficient. Programmatic PDF/DOCX analysis is the Phase 2 upgrade path for Layer 1.

---

### `generateTerminologyFixes`

New node. Single focused LLM call. Fires immediately after `atsAnalysis` completes, in parallel with the fit analysis path.

**Reads:** `resumeText`, `atsAnalysis.recruiterSearch.terminologyMismatches[]`

**Purpose:** For each terminology mismatch, find the exact sentence in the resume that contains the outdated phrase and rewrite only that sentence with the correct terminology. Surgical — no other content changes.

**Output schema:**
```ts
terminologyDiffs: {
  location: string          // e.g. "Senior Engineer @ Acme — bullet 2"
  swapLabel: string         // e.g. "agent orchestration → agentic systems"
  before: string            // exact original sentence from resume
  after: string             // rewritten sentence with terminology swap
}[]
```

**Prompt design:**
```
The candidate's resume uses these phrases where the recruiter's search
uses different terminology:

{terminologyMismatches as before → after pairs}

Find the exact sentences in the resume below that contain these phrases.
Rewrite only those sentences, replacing only the flagged phrase with the
recruiter's preferred term. Do not change anything else — metrics,
structure, tense, and all other content must remain identical.

Return one object per mismatch. If a phrase does not appear in the
resume, skip it.

Resume text:
{resumeText}
```

**Why this runs automatically:** The system already has everything needed to produce the diffs. Deferring behind a button forces the user to ask for work the system could have done. For the Invisible Expert scenario specifically, seeing their own sentence with the fix already applied — without asking — is the moment the product earns trust. The user recognizes their own words and can immediately verify nothing was fabricated.

**Cost:** Small focused call. 4–6 output objects. Runs in parallel with verdict nodes. Adds no latency to the critical path.

---

### `analyzeFit`

Single LLM call. Cold, forensic assessment of the human match. Reads raw resume text and job text directly.

**Scope:** Career trajectory, transferable skills, genuine gaps. No mechanical advice — that belongs entirely to the ATS panel. No keyword lists. No formatting observations. Purely the human judgment question: once seen, will this candidate be wanted?

**Output schema (all fields required):**
```ts
{
  fitScore: number              // 0–100
  headline: string              // battle card headline
  battleCardBullets: string[]   // 3–5 supporting bullets
  scenarioSummary: string       // user-facing prose summary
  sourceRole: string            // candidate's current/most recent role
  targetRole: string            // role they are applying for

  fitAnalysis: {
    careerTrajectory: string    // where they've been and where they're heading
    keyStrengths: string[]      // specific strengths relative to this role
    experienceGaps: string[]    // specific gaps relative to this role
    weakMatchReason: string     // REQUIRED — use "NONE" if fitScore >= 50
  }
}
```

**Node logic after LLM call:**
```ts
matchResult.weakMatch = matchResult.fitScore < 50
matchResult.fitAnalysis.weakMatchReason =
  result.fitAnalysis.weakMatchReason === "NONE"
    ? null
    : result.fitAnalysis.weakMatchReason
```

**Critical prompt instruction:** `weakMatchReason` is always required. If `fitScore >= 50`, return the string "NONE". Do not omit the field. Conditional fields are unreliable and will be missed.

---

### `routeVerdicts`

Pure function. No LLM. Reads `fitScore` and `atsScore`. Writes `scenarioId`.

```ts
function deriveScenario(fitScore: number, atsScore: number | null): ScenarioId {
  if (fitScore >= 75 && (atsScore === null || atsScore >= 75)) return "confirmed_fit"
  if (fitScore >= 75 && atsScore !== null && atsScore < 75)   return "invisible_expert"
  if (fitScore >= 50)                                          return "narrative_gap"
  return "honest_verdict"
}
```

---

### `analyzeStrongMatch`

Fires for: `confirmed_fit` and `invisible_expert`. Reads `fitScore`, `scenarioId`, `fitAnalysis`, `atsProfile`, `terminologyDiffs`.

**For `confirmed_fit`:** Sparse output is correct. The ATS panel is clean. The fit is strong. Do not manufacture advice to appear thorough. Empty `fitAdvice` is the right answer.

**For `invisible_expert`:** The fit analysis confirms the candidate is qualified. The ATS panel and `terminologyDiffs` already contain the mechanical fix. The verdict node's job is the human framing: acknowledge the qualification clearly, then point to the ATS panel for the specific fixes. Do not restate the terminology gaps — they are already shown in Station 3.

```ts
// confirmed_fit
{ scenarioId: "confirmed_fit", fitAdvice: [] }

// invisible_expert
{
  scenarioId: "invisible_expert"
  fitAdvice: {
    standoutStrengths: string[]
    atsRealityCheck: string[]     // human framing only — "your terminology, not your skills"
    terminologySwaps: string[]    // omit if terminologyDiffs covers it — no duplication
    keywordsToAdd: string[]
  }
}
```

---

### `analyzeNarrativeGap`

Fires for: `narrative_gap`. Reads `fitScore`, `scenarioId`, `fitAnalysis`.

The ATS panel may be entirely clean for this scenario. The problem is not mechanical — the career story doesn't obviously point at this role. This node owns the scenario entirely. Its output is about reframing existing experience, not fixing terminology or formatting.

```ts
{
  scenarioId: "narrative_gap"
  fitAdvice: {
    transferableStrengths: string[]
    reframingSuggestions: string[]
    missingSkills: string[]
  }
}
```

---

### `analyzeSkepticalReconciliation`

Fires for: `honest_verdict`. Reads `fitScore`, `scenarioId`, `fitAnalysis`, `hitlFired`.

The ATS panel may be clean. The gap is real — not a terminology problem, not a formatting problem. This node owns the honest verdict. HITL gives the candidate one chance to surface context the resume missed.

**First pass (`hitlFired === false`):**
- If the gap is real and more context would change the assessment: generate `contextPrompt` → call `interrupt()` → set `hitlFired: true`
- If no context would help: produce `fitAdvice` directly, no interrupt

**Second pass (`hitlFired === true`):**
- `humanContext` is in state
- Produce `fitAdvice` with `acknowledgement` if context changed the assessment
- No second interrupt regardless of score

```ts
{
  scenarioId: "honest_verdict"
  fitAdvice: {
    honestAssessment: string[]
    closingSteps: string[]
    acknowledgement: string[] | null
  }
}
```

---

## Scenario routing

| scenarioId | fitScore | atsScore | Verdict node |
|---|---|---|---|
| `confirmed_fit` | >= 75 | >= 75 or null | `analyzeStrongMatch` |
| `invisible_expert` | >= 75 | < 75 | `analyzeStrongMatch` |
| `narrative_gap` | 50–74 | any | `analyzeNarrativeGap` |
| `honest_verdict` | < 50 | any | `analyzeSkepticalReconciliation` |

---

## Internal graph state — field ownership

| Field | Written by | Read by |
|---|---|---|
| `resumeText` | request body | `analyzeFit`, `atsAnalysis`, `generateTerminologyFixes` |
| `jobText` | request body | `analyzeFit`, `atsAnalysis` |
| `fitScore` | `analyzeFit` | `routeVerdicts`, all verdict nodes |
| `weakMatch` | `analyzeFit` (derived) | `routeVerdicts` |
| `headline` | `analyzeFit` | runner |
| `battleCardBullets` | `analyzeFit` | runner |
| `scenarioSummary` | `analyzeFit` | runner |
| `sourceRole` | `analyzeFit` | `detectArchetype` (future) |
| `targetRole` | `analyzeFit` | `detectArchetype` (future) |
| `fitAnalysis` | `analyzeFit` | all verdict nodes |
| `atsScore` | `atsAnalysis` | `routeVerdicts` |
| `atsProfile` | `atsAnalysis` | `analyzeStrongMatch`, runner |
| `terminologyDiffs` | `generateTerminologyFixes` | runner, `analyzeStrongMatch` |
| `scenarioId` | `routeVerdicts` | all verdict nodes, runner |
| `fitAdvice` | verdict nodes | runner |
| `hitlFired` | `analyzeSkepticalReconciliation` | `analyzeSkepticalReconciliation` |
| `humanContext` | HITL resume endpoint | `analyzeSkepticalReconciliation` |
| `contextPrompt` | `analyzeSkepticalReconciliation` | runner |

---

## Public API — PublicMatchResponse

```ts
{
  scenarioId: ScenarioId

  fitScore: number

  battleCard: {
    headline: string
    bulletPoints: string[]
  }

  fitAdvice: {
    key: string
    bulletPoints: string[]
  }[]                             // empty array for confirmed_fit

  atsProfile: {
    atsScore: number | null

    machineParsing: {
      flags: string[]             // human-readable formatting issues
      likelyTwoColumn: boolean
      hasTablesOrGraphics: boolean
      contactInHeaderFooter: boolean
      inconsistentDateFormats: boolean
      nonStandardBullets: boolean
      missingSections: string[]
    }

    knockoutQuestions: {
      question: string
      inferredFromJD: string
      riskLevel: "pass" | "at_risk" | "unknown"
    }[]

    recruiterSearch: {
      likelySearchQuery: string
      termsPresentInResume: string[]
      termsMissingFromResume: string[]
    }

    machineRanking: string[]      // keyword gap summary strings
  }

  terminologyDiffs: {
    location: string
    swapLabel: string
    before: string
    after: string
  }[]

  scenarioSummary: {
    text: string
  }

  threadId: string
  _meta: { durationMs: number }
}
```

---

## HITL flow

Unchanged from prior design. HITL fires inside `analyzeSkepticalReconciliation` only. Maximum one exchange per run. If `fitScore` moves above 50 after HITL, the user lands in a different scenario. `hitlFired` is a loop guard only — not a routing input to `deriveScenario`.

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
// atsAnalysis
{ node: "atsAnalysis", durationMs, timestamp,
  aha: string }    // one sentence — most important ATS observation, pure finding only

// generateTerminologyFixes
{ node: "generateTerminologyFixes", durationMs, timestamp }
// no aha — output surfaced in ATS panel cards

// analyzeFit
{ node: "analyzeFit", durationMs, timestamp,
  aha: string }    // one sentence — sharpest human fit observation

// routeVerdicts
{ node: "routeVerdicts", durationMs: 0, timestamp,
  fitScore: number, atsScore: number | null, scenarioId: ScenarioId }
// no aha — routing data IS the observation, rendered deterministically

// verdict nodes
{ node: string, durationMs, timestamp,
  aha: string }    // one LLM sentence pointing to most important result card
```

### Provenance trail — logic pill content

The frontend logic pill assembles four beats from `node_done` events as they arrive:

```
Beat 1  atsAnalysis done     → aha string (LLM)
Beat 2  analyzeFit done      → aha string (LLM)
Beat 3  routeVerdicts done   → "fit {score} · ATS {score} → {scenario}" (deterministic,
                                different visual treatment — mechanical, muted)
Beat 4  verdict node done    → aha string (LLM)
                               + static closing line: "Results ready — collapse to view"
```

Pill behaviour:
- Auto-expands when "Analyze Match" is pressed
- Does NOT auto-collapse on `completed` — user closes manually
- "Results ready — collapse to view" appears as the final beat when verdict node fires
- Pill persists as a floating pin during scrolling after user closes it
- For `honest_verdict`: pill acts as the "Why" anchor explaining the HITL requirement;
  HITL drawer is the "How" and is self-explanatory — does not require pill to be open

---

## Open questions

- Should `machineParsing` Layer 1 flags be inferred by the LLM (current) or produced programmatically from file analysis (Phase 2 upgrade)?
- Should `terminologyDiffs` be capped at N results to avoid overwhelming users with many swaps?
- Should `knockoutQuestions` be shown only when `riskLevel` is `at_risk` or `unknown`, or always?
- Should the `recruiterSearch.likelySearchQuery` string be surfaced directly in the UI as the Boolean query? (Current design answer: yes — it's a differentiating insight no competitor shows.)

---

## Out of scope for this PRD

- Archetype injection details (see `prd-archetype-system.md`)
- Specific prompt copy for each verdict node
- Model selection per node
- Frontend UI implementation details
- Eval harness design
- Payment infrastructure