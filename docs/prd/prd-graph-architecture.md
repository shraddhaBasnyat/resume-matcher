# PRD: Graph Architecture

**Status:** Draft
**Author:** sbasnyat
**Last updated:** 2026-06-02
**Read first:** prd-what-good-looks-like.md, prd-archetype-system.md, prd-match-scenarios.md

---

## Purpose

This document defines the internal architecture of the JobInit LangGraph pipeline. It covers node responsibilities, graph topology, deterministic vs LLM call breakdown, state ownership, and the archetype config runtime pattern.

It does not cover scenario routing logic, user profiles, or the public API shape — those live in `prd-match-scenarios.md`.

---

## Design principles

**The analyze nodes are the primary inference layer.** `analyzeJD` and `analyzeResume` each read one document deeply and produce structured output that everything downstream consumes. No other node reads raw text directly — they read structured outputs.

**Deterministic before LLM.** Every operation that can be expressed as a computation over structured inputs is deterministic. LLM calls are reserved for operations that require genuine judgment: pattern recognition, semantic comparison, synthesis, tone.

**ATS path is fully cold.** The ATS path computes facts from structured inputs. It does not call an LLM for gap detection, scoring, or mismatch identification. LLM judgment enters only in verdict nodes, where legitimacy has been assessed against the full picture.

**Fit analysis is comparison only.** `analyzeFit` does not generate career narrative or trajectory language. It compares the structured outputs of `analyzeJD` and `analyzeResume` and produces a cold semantic assessment. Narrative lives in verdict nodes.

**Archetype config is a runtime data source.** The archetype definitions in `prd-archetype-system.md` are config, not documentation. Static properties — `scanPattern`, `interviewProbePattern` — are loaded at runtime from a typed config object, not derived by LLM calls.

---

## LLM vs deterministic breakdown

### LLM calls (judgment required)
- `analyzeJD` — pattern recognition and inference from JD subtext
- `analyzeResume` — reading comprehension judgment per bullet, archetype pattern recognition
- `analyzeFit` — semantic comparison across two structured document reads
- Verdict nodes — synthesis, tone calibration, specificity under emotional context

### Deterministic (computation over structured inputs)
- `parseResume` — file parsing, text extraction, Layer 1 formatting flag detection
- `atsGapAnalysis` — string matching, gap computation, score weighting
- `routeVerdicts` — threshold comparison, scenario label assignment
- Archetype config lookup — dictionary read inside verdict node function

---

## Graph topology

```
[input: resumeFile + jobText]
          ↓
┌─────────────────────────────────────────────────────┐
│  resumeSubgraph                                      │
│                                                      │
│  parseResume (deterministic)                         │
│    → resumeText                                      │
│    → formattingFlags (Layer 1)                       │
│          ↓                                           │
│  analyzeResume (LLM)                                 │
│    → candidateArchetype                              │
│    → demonstratedVsClaimed[]                         │
│    → scopeAmbiguity[]                                │
│    → careerArcNote { transitions[] }                 │
│    → resumeAha: string                               │
│          ↓                                           │
│  Cache key: hash(resumeFile)                         │
│  Cache hit → skip subgraph, read from cache          │
└─────────────────────────────────────────────────────┘
          ↓                          ↑ parallel
analyzeJD (LLM)                      │
  → jdArchetype { ideal, couldWork[] }
  → realAsk
  → recruiterFilter
          ↓ (both complete)
          ↓
atsGapAnalysis (deterministic) ←──── analyzeFit (LLM)
  reads:                              reads:
    recruiterFilter                     analyzeJD output
    demonstratedVsClaimed               analyzeResume output
    formattingFlags                   →  fitScore
  → termGaps[]                        → battleCardBullets[]
  → terminologyMismatches[]           → fitScenarioSummary
  → atsScore                          → fitAha
                                      → headline
          ↓                                ↓
               routeVerdicts (deterministic)
               fitScore + atsScore → scenarioId
                         ↓
               one verdict node fires (LLM)
               inline: ARCHETYPE_CONFIG[jdArchetype.ideal]
               reads: full state
               → fitAdvice[]
               → terminologyDiffs[] (legitimate only)
               → closingSummary
               → verdictAha
                         ↓
                        END
```

**Critical path:**
```
parseResume
  → analyzeResume + analyzeJD (parallel)
  → atsGapAnalysis + analyzeFit (parallel)
  → routeVerdicts
  → verdict node
  → END
```

---

## Resume subgraph

`parseResume` and `analyzeResume` are grouped as a subgraph for two reasons:

1. **Unified output shape** — the subgraph produces one clean `ResumeAnalysis` object that everything downstream consumes. The parent graph never sees intermediate state from inside the subgraph.

2. **Caching boundary** — the subgraph output is stable across job applications for the same resume. Cache key is `hash(resumeFile)`. On cache hit, the subgraph is skipped entirely and `ResumeAnalysis` is read from cache. The parent graph is unchanged — it receives the same output shape whether from cache or live run.

**Cached output shape:**
```ts
type ResumeAnalysis = {
  resumeText: string
  formattingFlags: FormattingFlags
  candidateArchetype: RoleArchetype
  demonstratedVsClaimed: DemonstratedVsClaimedItem[]
  scopeAmbiguity: ScopeAmbiguityItem[]
  careerArcNote: { transitions: ArchetypeTransition[] }
}
```

---

## Node specifications

### `parseResume`

**Type:** Deterministic
**Input:** Raw resume file (PDF or DOCX)
**Runs:** Inside resumeSubgraph, always first

Reads the raw file before text extraction. This is the only moment structural facts about the file are available — after extraction they are destroyed.

**Layer 1 formatting flags (Phase 2 — not yet implemented):**
- Two-column layout detection
- Tables or graphics present
- Contact information in header/footer
- Inconsistent date formats
- Non-standard bullet characters
- Missing standard sections

**Phase 1:** Text extraction only. `formattingFlags` stubbed as empty. Layer 1 formatting detection is the Phase 2 build — requires PDF/DOCX structural parsing before text extraction.

---

### `analyzeResume`

**Type:** LLM
**Input:** `resumeText` only — no JD context
**Runs:** Inside resumeSubgraph, after `parseResume`

The mentor read. What does a trusted advisor see when reading this resume cold, without knowing the target role?

**Output:**
```ts
{
  candidateArchetype: RoleArchetype

  demonstratedVsClaimed: {
    bullet: string
    status: "demonstrated" | "claimed" | "ambiguous"
    evidencePresent: string | null
  }[]

  scopeAmbiguity: {
    bullet: string
    ambiguous: boolean
    reason: string | null
  }[]

  careerArcNote: {
    transitions: {
      from: RoleArchetype
      to: RoleArchetype
      signal: string  // one sentence, factual
    }[]
  }

  resumeAha: string  // one sentence — sharpest resume-only observation
}
```

**Prompt constraints:**
- No career narrative. No trajectory language. Factual reads only.
- `candidateArchetype` reflects the dominant pattern today — most recent and strongest signals, not full career history
- `careerArcNote.transitions` is empty array if career shows a consistent single archetype
- Generalist career patterns should be classified as `founding_engineer` with the generalist signal noted in the relevant transition

---

### `analyzeJD`

**Type:** LLM
**Input:** Job text only — no resume context
**Runs:** In parallel with resumeSubgraph

The recruiter read. What is this role actually asking for beneath the requirements list?

**Output:**
```ts
{
  jdArchetype: {
    ideal: RoleArchetype
    couldWork: [] | [RoleArchetype] | [RoleArchetype, RoleArchetype]
  }
  realAsk: string       // the specific problem this company is hiring to solve
  recruiterFilter: string  // mechanical first-pass filter — what gets a resume seen
}
```

**Prompt constraints:**
- `ideal` is what the company would hire if they found a perfect match
- `couldWork` is what they will realistically consider given market availability — maximum two, must differ from `ideal`
- `realAsk` instantiates the archetype pattern against this specific JD — not generic archetype description
- `recruiterFilter` is the mechanical Boolean-style filter a recruiter would run — specific terms, not generic categories
- No confidence field — uncertainty should be reflected in a broader `couldWork` list

---

### `atsGapAnalysis`

**Type:** Deterministic
**Input:** `analyzeJD` output + `analyzeResume` output + `resumeText`
**Runs:** In parallel with `analyzeFit`, after both analyze nodes complete

Computes ATS gaps mechanically from structured inputs. No LLM call.

**Step 1 — term matching:**
Parse `recruiterFilter` into term list. For each term:
- Check presence in `resumeText` — string matching
- If present, check `demonstratedVsClaimed` for this bullet → `present_demonstrated` or `present_no_context`
- If absent → `missing`

**Step 2 — mismatch detection:**
Surface terminology mismatches as cold facts only. No judgment on legitimacy — that lives in `analyzeFit` and verdict nodes.

**Step 3 — score computation:**
Weighted by gap severity. Terms missing entirely suppress score more than terms present without context. Layer 1 formatting flags suppress score when available (Phase 2).

**Output:**
```ts
{
  atsScore: number
  termGaps: {
    term: string
    status: "missing" | "present_no_context" | "present_demonstrated"
  }[]
  terminologyMismatches: {
    resumeUses: string
    jdExpects: string
  }[]
  formattingFlags: string[]
}
```

---

### `analyzeFit`

**Type:** LLM
**Input:** `analyzeJD` output + `analyzeResume` output
**Runs:** In parallel with `atsGapAnalysis`, after both analyze nodes complete

Cold semantic comparison. Uses archetype match tier as a prior for scoring. Uses `demonstratedVsClaimed` to distinguish `evidence_gap` from `hard_gap` in battle card verdicts.

**Archetype match prior (consumed internally, not a schema field):**
```
candidateArchetype === jdArchetype.ideal     → weight toward 75+
candidateArchetype in jdArchetype.couldWork  → weight toward 50–74
neither                                      → weight toward <50
```

This is a prior, not a constraint. Battle card evidence overrides it.

**Output:**
```ts
{
  fitScore: number
  headline: string
  battleCardBullets: {
    requirement: string
    evidence: string
    verdict: "strong_match" | "framing_gap" | "terminology_gap" | "hard_gap" | "evidence_gap"
  }[]
  fitScenarioSummary: string
  fitAha: string
  sourceRole: string
  targetRole: string
}
```

**Prompt constraints:**
- No career narrative. No trajectory language. No arc. Facts and gaps only.
- `evidence_gap` when a bullet is claimed without demonstrated evidence — not `hard_gap`, not `terminology_gap`
- `fitScenarioSummary` is factual, no scenario tone — consumed by verdict nodes which add the emotional register
- If fitScore < 50, at least one bullet must be `hard_gap` or `evidence_gap`

---

### `routeVerdicts`

**Type:** Deterministic
**Input:** `fitScore`, `atsScore`

| scenarioId | fitScore | atsScore |
|---|---|---|
| `confirmed_fit` | >= 75 | >= 75 or null |
| `invisible_expert` | >= 75 | < 75 |
| `narrative_gap` | 50–74 | any |
| `honest_verdict` | < 50 | any |

---

### Verdict nodes

**Type:** LLM
**Input:** Full graph state
**One fires per run:** `analyzeStrongMatch`, `analyzeNarrativeGap`, `analyzeSkepticalReconciliation`

**Inline archetype config lookup (before prompt assembly, paid tier):**
```ts
const archetypeConfig = ARCHETYPE_CONFIG[state.jdArchetype.ideal]
// archetypeConfig.scanPattern
// archetypeConfig.interviewProbePattern
```

Not a graph node. Not a trace entry. A dictionary read at the top of the verdict node function.

**Terminology diffs produced here:**
For each `terminologyMismatch` from `atsGapAnalysis`, assess legitimacy against the full fit picture. Produce before/after diff only where legitimate. Drop silently where the analogy doesn't hold. The mismatch fact remains in `atsProfile` — only the diff is suppressed.

**Output:**
```ts
{
  fitAdvice: { key: string, items: Item[] }[]
  terminologyDiffs: { location: string, swapLabel: string, before: string, after: string }[]
  closingSummary: string
  verdictAha: string
}
```

---

## Archetype config — runtime data source

The archetype definitions are config, not just documentation. Static properties are loaded at runtime:

```ts
const ARCHETYPE_CONFIG: Record<RoleArchetype, {
  scanPattern: string
  interviewProbePattern: string
}> = {
  specialist_depth: {
    scanPattern: "The specific technology or domain name, held for multiple years at recognisable companies",
    interviewProbePattern: "Goes very deep on one thing. Multiple follow-up questions on the strongest claimed skill. Walk me through exactly how you built X."
  },
  // ... all six archetypes
}
```

This is version-controlled in code. Migration to a database is a future phase concern — warranted when archetypes need to be editable without a deploy, or if/when a RAG pipeline stores briefs against archetype keys.

---

## Internal graph state — field ownership

| Field | Written by | Read by |
|---|---|---|
| `resumeText` | `parseResume` | `analyzeResume`, `atsGapAnalysis` |
| `formattingFlags` | `parseResume` | `atsGapAnalysis` |
| `candidateArchetype` | `analyzeResume` | `analyzeFit`, verdict nodes |
| `demonstratedVsClaimed` | `analyzeResume` | `atsGapAnalysis`, `analyzeFit` |
| `scopeAmbiguity` | `analyzeResume` | `analyzeFit`, verdict nodes |
| `careerArcNote` | `analyzeResume` | verdict nodes |
| `resumeAha` | `analyzeResume` | runner |
| `jdArchetype` | `analyzeJD` | `analyzeFit`, `routeVerdicts`, verdict nodes |
| `realAsk` | `analyzeJD` | `analyzeFit`, verdict nodes |
| `recruiterFilter` | `analyzeJD` | `atsGapAnalysis` |
| `atsScore` | `atsGapAnalysis` | `routeVerdicts` |
| `termGaps` | `atsGapAnalysis` | verdict nodes, runner |
| `terminologyMismatches` | `atsGapAnalysis` | verdict nodes |
| `fitScore` | `analyzeFit` | `routeVerdicts`, verdict nodes |
| `headline` | `analyzeFit` | runner |
| `battleCardBullets` | `analyzeFit` | runner |
| `fitScenarioSummary` | `analyzeFit` | verdict nodes |
| `fitAha` | `analyzeFit` | runner |
| `sourceRole` | `analyzeFit` | runner |
| `targetRole` | `analyzeFit` | runner |
| `scenarioId` | `routeVerdicts` | verdict nodes, runner |
| `fitAdvice` | verdict nodes | runner |
| `terminologyDiffs` | verdict nodes | runner |
| `verdictAha` | verdict nodes | runner |
| `closingSummary` | verdict nodes | runner |
| `hitlFired` | `analyzeSkepticalReconciliation` | `analyzeSkepticalReconciliation` |
| `humanContext` | HITL resume endpoint | `analyzeSkepticalReconciliation` |
| `contextPrompt` | `analyzeSkepticalReconciliation` | runner |

---

## Model selection

Deferred to eval results. Cognitive load groupings:

**Structured extraction from single document:**
- `analyzeJD`
- `analyzeResume`

**Semantic comparison across two structured inputs:**
- `analyzeFit`

**Synthesis, tone, specificity under emotional context:**
- Verdict nodes

The last group is where weak models will fail the specificity test first. Eval cases for verdict nodes need to be the sharpest. Model assignment TBD based on eval quality per tier.

## Known gaps — deferred

### Cross-domain translation knowledge

The current architecture has no reliable mechanism for injecting knowledge about 
cross-domain translation legitimacy — whether a technology or pattern from one 
domain has a genuine structural analogy in another.

Example: GraphQL federation is not equivalent to gRPC. E-commerce monolith 
decomposition has genuine structural analogy to agent backend infrastructure. 
These distinctions cannot be derived from the resume, the JD, or the archetype 
config — they require external domain knowledge.

Current workaround: static prompt text covering anticipated cases.
Known failure: unreliable without explicit context injection (evidenced by 
TranslationLegitimacy assertion at 40% without context in F1 baseline).

Possible approaches include archetype config translation guides, RAG retrieval 
keyed to source/target domain pair, or relying on model general knowledge with 
tighter prompting. Not yet decided — needs real-world data before committing 
to an approach.