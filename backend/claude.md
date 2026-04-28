# Backend — Claude Context (New Architecture)

This file describes the target architecture for the backend sprint.
Compare against the existing root-level CLAUDE.md to understand what has changed.

## Graph topology

```
raw resumeText + jobText
        ↓
atsAnalysis ──────────────────────── analyzeFit    (parallel, both read raw text directly)
        ↓                                  ↓
generateTerminologyFixes            routeVerdicts
(fans out from atsAnalysis,         (deriveScenario — pure function, no LLM)
 runs parallel to fit path)               ↓
        ↓                     one verdict node fires:
        └──────────────────── analyzeStrongMatch | analyzeNarrativeGap | analyzeSkepticalReconciliation
                                          ↓
                                         END
```

## What changed from the old graph

`parseResume` and `parseJob` nodes are deleted. Both nodes are removed from the graph entirely. `analyzeFit` and `atsAnalysis` read raw `resumeText` and `jobText` directly from graph state.

`scoreMatch` is renamed to `analyzeFit`. It now produces the battle card, scenario summary, and structured `fitAnalysis` for verdict nodes.

`atsAnalysis` output schema significantly expanded — now covers three layers (machine parsing, knockout questions, recruiter search) rather than a single score and keyword list.

`generateTerminologyFixes` is a new node. It fans out from `atsAnalysis` output and runs in parallel with the fit analysis path. It produces `terminologyDiffs[]` — exact before/after rewrites of resume sentences — automatically, without user prompt.

`contextPrompt` moves out of `analyzeFit` and into `analyzeSkepticalReconciliation`.

---

## Node responsibilities

### `analyzeFit`

Reads: `resumeText`, `jobText` (raw text)

Single LLM call. Cold, forensic assessment of the human match. No mechanical advice — keyword lists, formatting observations, and terminology gaps belong entirely to `atsAnalysis` and `generateTerminologyFixes`.

LLM output schema (all fields required):
```ts
{
  fitScore: number
  headline: string
  battleCardBullets: string[]
  scenarioSummary: string
  sourceRole: string
  targetRole: string
  fitAnalysis: {
    careerTrajectory: string
    keyStrengths: string[]
    experienceGaps: string[]
    weakMatchReason: string     // REQUIRED — use "NONE" if fitScore >= 50
  }
}
```

Node logic after LLM call:
```ts
matchResult.weakMatch = matchResult.fitScore < 50
matchResult.fitAnalysis.weakMatchReason =
  result.fitAnalysis.weakMatchReason === "NONE"
    ? null
    : result.fitAnalysis.weakMatchReason
```

Critical prompt instruction: `weakMatchReason` is always required. If `fitScore >= 50`, return the string "NONE". Do not omit the field. Conditional fields are unreliable and will be missed.

---

### `atsAnalysis`

Reads: `resumeText`, `jobText` (raw text)

Single LLM call. Mechanical and literal — no semantic inference. Covers three distinct layers of ATS evaluation.

Prompt framing: the LLM simultaneously plays a recruiter configuring knockout questions before posting the role, and a recruiter running a Boolean search to find candidates. This framing produces more realistic output than asking for "ATS analysis" abstractly.

LLM output schema:
```ts
{
  atsScore: number              // 0–100, composite weighted 60% L3 / 25% L2 / 15% L1

  machineParsing: {             // Layer 1 — formatting
    likelyTwoColumn: boolean
    hasTablesOrGraphics: boolean
    contactInHeaderFooter: boolean
    inconsistentDateFormats: boolean
    nonStandardBullets: boolean
    missingSections: string[]
    flags: string[]             // human-readable summary of issues found
  }

  knockoutQuestions: {          // Layer 2 — hard filters
    question: string
    inferredFromJD: string
    candidatePasses: boolean | null
    riskLevel: "pass" | "at_risk" | "unknown"
  }[]

  recruiterSearch: {            // Layer 3 — keyword discoverability
    likelySearchQuery: string
    termsPresentInResume: string[]
    termsMissingFromResume: string[]
    terminologyMismatches: {
      resumeUses: string
      jdExpects: string
    }[]
  }

  machineRanking: string[]      // keyword gap summary strings for UI
}
```

Layer 1 limitation: the LLM infers formatting problems from text artifacts. It cannot detect two-column layout from plain linearized text. LLM inference is the Phase 1 approach; programmatic PDF/DOCX file analysis is the Phase 2 upgrade path.

---

### `generateTerminologyFixes`

Reads: `resumeText`, `atsAnalysis.recruiterSearch.terminologyMismatches[]`

New node. Single focused LLM call. Fires immediately after `atsAnalysis` completes. Finds the exact sentence in the resume for each terminology mismatch and rewrites only that sentence — no other content changes.

LLM output schema:
```ts
{
  terminologyDiffs: {
    location: string      // e.g. "Senior Engineer @ Acme — bullet 2"
    swapLabel: string     // e.g. "agent orchestration → agentic systems"
    before: string        // exact original sentence from resume
    after: string         // rewritten sentence with swap applied
  }[]
}
```

This node runs automatically — it does not require user input. The output is surfaced directly in Station 3 of the ATS panel as inline before/after diffs. For the invisible_expert scenario, seeing their own sentence with the fix already applied is the product's primary trust-building moment.

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

Fires for: `confirmed_fit` and `invisible_expert`
Reads: `fitScore`, `scenarioId`, `fitAnalysis`, `atsProfile`, `terminologyDiffs`

For `confirmed_fit`: sparse output is correct. ATS panel is clean, fit is strong. Empty `fitAdvice` is the right answer. Do not manufacture advice.

For `invisible_expert`: fit analysis confirms qualification. ATS panel and `terminologyDiffs` already contain the mechanical fix. The verdict node provides human framing only — it does not restate terminology gaps already shown in Station 3.

Output schema:
```ts
// confirmed_fit
{ scenarioId: "confirmed_fit", fitAdvice: [] }

// invisible_expert
{
  scenarioId: "invisible_expert"
  fitAdvice: {
    standoutStrengths: string[]
    atsRealityCheck: string[]
    terminologySwaps: string[]
    keywordsToAdd: string[]
  }
}
```

---

### `analyzeNarrativeGap`

Fires for: `narrative_gap`
Reads: `fitScore`, `scenarioId`, `fitAnalysis`

The ATS panel may be entirely clean for this scenario. The problem is the career story doesn't obviously point at this role. This node owns the scenario entirely — no overlap with ATS findings.

Output schema:
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

Fires for: `honest_verdict`
Reads: `fitScore`, `scenarioId`, `fitAnalysis`, `hitlFired`

Owns `contextPrompt`. First pass: if context would change assessment, generate question → `interrupt()` → set `hitlFired: true`. If no context would help, produce `fitAdvice` directly. Second pass: produce `fitAdvice` with `acknowledgement` if context shifted the assessment. No second interrupt.

Output schema:
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
| `fitAnalysis.weakMatchReason` | `analyzeFit` (normalised) | `analyzeSkepticalReconciliation`, runner |
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

Emitted by `runner.ts` on the `completed` SSE event under `result`. Validated by `PublicMatchResponseSchema` (Zod) before emission. Internal fields never leave the server.

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

    machineRanking: string[]
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

## `mapFitAdvice` — discriminated union to flat array

Lives in `runner.ts`.

```ts
// confirmed_fit
[]

// invisible_expert
[
  { key: "standout_strengths",  bulletPoints: fitAdvice.standoutStrengths },
  { key: "ats_reality_check",   bulletPoints: fitAdvice.atsRealityCheck   },
  { key: "terminology_swaps",   bulletPoints: fitAdvice.terminologySwaps  },
  { key: "keywords_to_add",     bulletPoints: fitAdvice.keywordsToAdd     },
]

// narrative_gap
[
  { key: "transferable_strengths", bulletPoints: fitAdvice.transferableStrengths },
  { key: "reframing_suggestions",  bulletPoints: fitAdvice.reframingSuggestions  },
  { key: "missing_skills",         bulletPoints: fitAdvice.missingSkills         },
]

// honest_verdict
[
  { key: "honest_assessment", bulletPoints: fitAdvice.honestAssessment },
  { key: "closing_steps",     bulletPoints: fitAdvice.closingSteps     },
  ...(fitAdvice.acknowledgement
    ? [{ key: "acknowledgement", bulletPoints: fitAdvice.acknowledgement }]
    : []),
]
```

---

## Runner whitelist — internal fields never emitted

`fitAnalysis`, `headline` (remapped to `battleCard.headline`), `battleCardBullets` (remapped to `battleCard.bulletPoints`), `scenarioSummary` (remapped to `scenarioSummary.text`), `sourceRole`, `targetRole`, `weakMatch`, `weakMatchReason`, `matchedSkills`, `missingSkills`, `narrativeAlignment`, `humanContext`, `hitlFired`, `contextPrompt`

`PublicMatchResponseSchema.safeParse()` runs on the mapped result before emission. If validation fails → emit error event, never emit malformed data.

---

## Scenarios reference

| scenarioId | fitScore | atsScore | Verdict node |
|---|---|---|---|
| `confirmed_fit` | >= 75 | >= 75 or null | `analyzeStrongMatch` |
| `invisible_expert` | >= 75 | < 75 | `analyzeStrongMatch` |
| `narrative_gap` | 50–74 | any | `analyzeNarrativeGap` |
| `honest_verdict` | < 50 | any | `analyzeSkepticalReconciliation` |

---

## SSE events

| Event | Payload |
|---|---|
| `meta` | `threadId`, `rootRunId`, `runStartTime` |
| `node_start` | `node`, `timestamp` |
| `node_done` | `node`, `durationMs`, `timestamp` |
| `completed` | `result: PublicMatchResponse` |
| `interrupted` | `fitScore`, `threadId`, `contextPrompt` |
| `error` | `error`, `message` |

---

## Schema conventions (unchanged)

`safeParse` → `logValidationFailure` → `throw validated.error` on every chain output. Never use `Schema.parse({ ...result })` — spreading null/undefined throws TypeError that masks the real Zod error. Nullable string fields: `z.string().min(1).nullable()` not `z.string().nullable()`. `weakMatch` and `weakMatchReason` (after normalisation) are derived in the node — not LLM output fields.

---

## Testing conventions (unchanged)

Top-level `vi.mock()` only. All model mocks must include `bind: vi.fn().mockReturnThis()`. `RootRunCapture` must be a regular function declaration, not an arrow function. Every chain must have a validation failure test asserting `ZodError` + `logValidationFailure` called with `rawOutput` and `nodeName`. `buildMockModel` in `scoring-graph.test.ts` must include LLM schema for every verdict node. Use `expect.objectContaining({ nodeName: "...", rawOutput: invalidOutput })` on validation failure assertions.

---

## Temperature per node

No `.bind({ temperature: 0 })` on any node currently — removed due to TypeScript issues. All nodes run at model default temperature until revisited.

---

## What to delete

- `backend/src/graphs/scoring/nodes/parseResume.ts`
- `backend/src/graphs/scoring/nodes/parseJob.ts`
- All imports and graph edges referencing `parseResume` and `parseJob`
- `scoreMatch` node file — replaced by `analyzeFit`
- Any chain files for `scoreMatch`
- `MatchResult` fields that no longer exist: `matchedSkills`, `missingSkills`, `narrativeAlignment`, `contextPrompt` (top-level), `weakMatchReason` (top-level — moved into `fitAnalysis`)

## What to add

- `backend/src/graphs/scoring/nodes/analyzeFit.ts`
- `backend/src/graphs/scoring/nodes/generateTerminologyFixes.ts`
- Updated `atsAnalysis` node with three-layer output schema
- `PublicMatchResponseSchema` Zod schema — `backend/src/types/public-response.ts`
- `mapFitAdvice` function in `runner.ts`
- `buildPublicResponse` function in `runner.ts`

## What to update

- `frontend/lib/types/api.ts` — replace `MatchResponse` with `PublicMatchResponse` shape including `terminologyDiffs` and full `atsProfile`
- `frontend/components/resume-init/accordion-config.ts` — update keys per scenario
- `frontend/components/resume-init/MainResultsStage.tsx` — wire to live data, surface ATS three-layer panel and `terminologyDiffs` diffs in Station 3
- `frontend/hooks/useMatchRunner.ts` — result type updates
- Delete `frontend/components/resume-init/dummy-data.ts`
- Delete `frontend/app/page.tsx` (legacy)
- Delete `frontend/components/match/` (legacy, entire directory)