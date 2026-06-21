# Architecture — resume-matcher

## Why this exists
A learning project built to understand LangChain and LangGraph by building something real.
Decisions here prioritise clarity over production readiness.

---

## Graph topology

```
START
  ├→ analyzeJD ────────────────────────────┐
  ├→ analyzeResume ────────────────────────┤
  └→ analyzeFit ───────────────────────────┤
                                           └→ atsGapAnalysis (deterministic, no LLM)
                                                   │
                                            routeVerdicts (pure fn, no LLM)
                                                   │
                              ┌────────────────────┼──────────────────────┐
                              ↓                    ↓                      ↓
                    analyzeStrongMatch  analyzeNarrativeGap  analyzeSkepticalReconciliation
                              │                    │                      │ ↑ (loops on HITL)
                              └────────────────────┴──────────────────────┘
                                                   ↓
                                                  END
```

`analyzeJD`, `analyzeResume`, and `analyzeFit` run **in parallel** from `START`. `atsGapAnalysis`
is deterministic — no LLM — and fans in after the JD/resume/fit nodes complete. `routeVerdicts`
reads from `atsGapAnalysis` output. Exactly one verdict node fires per run.
`analyzeSkepticalReconciliation` can loop back to itself via LangGraph `interrupt()`.

**Note on `generateTerminologyFixes`**: This node was planned but never implemented. Terminology
diffs are produced directly by verdict nodes in Phase 2, assessed for legitimacy against the
full fit picture before output.

---

## Node responsibilities

| Node | Reads | Writes | Notes |
|------|-------|--------|-------|
| `analyzeFit` | `resumeText`, `jobText` | `fitScore`, `headline`, `battleCardBullets`, `fitScenarioSummary`, `sourceRole`, `targetRole`, `fitAnalysis`, `weakMatch`, `fitAha` | `weakMatch = fitScore < 60`, derived in node. `fitAnalysis.weakMatchReason` normalised: `"NONE"` → `null`. No mechanical advice — keyword gaps and terminology belong to `atsAnalysis`. `fitScenarioSummary`: human fit picture in isolation — factual, no ATS context, no scenario tone. `fitAha`: one sentence, the sharpest human fit observation — emitted in `node_done` payload. |
| `atsAnalysis` | `resumeText`, `jobText` | `atsProfile`, `atsScenarioSummary`, `atsAha` | Three-layer output: `machineParsing` (formatting), `knockoutQuestions` (hard filters), `recruiterSearch` (keyword discoverability). `atsScore` composite weighted 60% recruiter search / 25% knockout / 15% formatting. `atsScenarioSummary`: machine picture in isolation — 2–3 sentences, plain-language synthesis of what the three layers found collectively, no fit context. `atsAha`: one sentence, the most important ATS observation — emitted in `node_done` payload. Pure observation only — no card content, no fix language. |
| `generateTerminologyFixes` | `resumeText`, `atsProfile.recruiterSearch.terminologyMismatches` | `terminologyDiffs` | Fans out from `atsAnalysis`. Finds the exact resume sentence for each terminology mismatch and rewrites only that sentence. Runs automatically — no user prompt needed. Tracked in `progress` but normalised to `atsAnalysis` in the stepper UI. No aha — its output is already surfaced in the ATS panel cards. |
| `routeVerdicts` | `fitScore`, `atsScore` | `scenarioId` | Pure fn, no LLM. Emits `fitScore`, `atsScore`, `scenarioId` in `node_done` payload — the deterministic "therefore" beat in the provenance trail. No aha field — the routing logic IS the observation. |
| `analyzeStrongMatch` | `scenarioId`, `fitAnalysis`, `jdArchetype`, `candidateArchetype`, `realAsk`, `terminologyMismatches`, `resumeText`, `fitScenarioSummary`, `atsScenarioSummary`, `userTier` | `fitAdvice`, `verdictAha`, `closingSummary`, `terminologyDiffs` | Fires for `confirmed_fit` and `invisible_expert`. Looks up `ARCHETYPE_CONFIG[jdArchetype.ideal]` — for paid tier injects `scanPattern` + `interviewProbePattern` into prompt. Assesses each `terminologyMismatch` for legitimacy; produces `terminologyDiffs` for those that hold. For `confirmed_fit`, `fitAdvice` contains interview prep fields. For `invisible_expert`, `fitAdvice` contains ATS remediation fields. |
| `analyzeNarrativeGap` | `scenarioId`, `fitAnalysis`, `jdArchetype`, `candidateArchetype`, `careerArcNote`, `terminologyMismatches`, `resumeText`, `fitScenarioSummary`, `atsScenarioSummary`, `userTier` | `fitAdvice`, `verdictAha`, `closingSummary`, `terminologyDiffs` | Fires for `narrative_gap`. Looks up `ARCHETYPE_CONFIG[jdArchetype.ideal]` — paid tier gets scan pattern context for reframing suggestions. Assesses `terminologyMismatches` for legitimacy. ATS panel may be clean — the gap is narrative, not mechanical. |
| `analyzeSkepticalReconciliation` | `scenarioId`, `fitAnalysis`, `jdArchetype`, `scopeAmbiguity`, `terminologyMismatches`, `resumeText`, `humanContext`, `hitlFired`, `fitScenarioSummary`, `atsScenarioSummary`, `userTier` | `fitAdvice`, `verdictAha`, `closingSummary`, `terminologyDiffs`, `humanContext` (on interrupt), `hitlFired` | Fires for `honest_verdict`. Uses `scopeAmbiguity` to distinguish genuine skill absence from scope-level mismatch. Assesses `terminologyMismatches` for legitimacy. `closingSummary`: the most emotionally important piece of writing in the output. No second interrupt. |

### Scenario routing (deriveScenario — pure fn)

```typescript
if (fitScore >= 80 && (atsScore === null || atsScore >= 75)) → "confirmed_fit"
if (fitScore >= 80 && atsScore < 75)                         → "invisible_expert"
if (fitScore >= 60)                                          → "narrative_gap"
else                                                         → "honest_verdict"
```

---

## State field ownership

LangGraph uses flat shared state — no enforced contract between nodes. This table makes
dependencies explicit. Before adding a node, declare its reads and writes here.

| Field | Type | Default | Written by | Read by |
|-------|------|---------|-----------|---------| 
| `resumeText` | `string` | required | request body | `analyzeFit`, `analyzeJD`, `analyzeResume`, verdict nodes |
| `jobText` | `string` | required | request body | `analyzeFit`, `analyzeJD`, `analyzeResume` |
| `humanContext` | `string` | `""` | HITL resume endpoint; `analyzeSkepticalReconciliation` (on interrupt) | `analyzeSkepticalReconciliation` |
| `fitScore` | `number \| undefined` | `undefined` | `analyzeFit` | `routeVerdicts`, all verdict nodes, runner |
| `headline` | `string \| undefined` | `undefined` | `analyzeFit` | runner |
| `battleCardBullets` | `string[] \| undefined` | `undefined` | `analyzeFit` | runner |
| `fitScenarioSummary` | `string \| undefined` | `undefined` | `analyzeFit` | verdict nodes |
| `sourceRole` | `string \| undefined` | `undefined` | `analyzeFit` | — (reserved for archetype system) |
| `targetRole` | `string \| undefined` | `undefined` | `analyzeFit` | — (reserved for archetype system) |
| `fitAnalysis` | `FitAnalysis \| undefined` | `undefined` | `analyzeFit` | all verdict nodes |
| `fitAnalysis.weakMatchReason` | `string \| null` | — | `analyzeFit` (normalised: `"NONE"` → `null`) | `analyzeSkepticalReconciliation`, runner |
| `weakMatch` | `boolean \| undefined` | `undefined` | `analyzeFit` (derived) | `routeVerdicts` |
| `fitAha` | `string \| undefined` | `undefined` | `analyzeFit` | runner (emitted in `node_done`) |
| `jdArchetype` | `{ ideal: RoleArchetype; couldWork: RoleArchetype[] } \| undefined` | `undefined` | `analyzeJD` | `analyzeFit`, verdict nodes |
| `realAsk` | `string \| undefined` | `undefined` | `analyzeJD` | `analyzeFit`, verdict nodes |
| `recruiterFilter` | `string \| undefined` | `undefined` | `analyzeJD` | `atsGapAnalysis` |
| `candidateArchetype` | `RoleArchetype \| undefined` | `undefined` | `analyzeResume` | `analyzeFit`, verdict nodes |
| `demonstratedVsClaimed` | `DemonstratedVsClaimed[] \| undefined` | `undefined` | `analyzeResume` | `analyzeFit`, `atsGapAnalysis` |
| `scopeAmbiguity` | `string[] \| undefined` | `undefined` | `analyzeResume` | `analyzeSkepticalReconciliation` |
| `careerArcNote` | `CareerArcNote \| undefined` | `undefined` | `analyzeResume` | `analyzeNarrativeGap` |
| `atsScore` | `number \| null \| undefined` | `undefined` | `atsGapAnalysis` | `routeVerdicts`, runner |
| `termGaps` | `TermGap[] \| undefined` | `undefined` | `atsGapAnalysis` | `analyzeStrongMatch`, runner |
| `terminologyMismatches` | `{ resumeUses: string; jdExpects: string }[] \| undefined` | `undefined` | `atsGapAnalysis` | verdict nodes, runner |
| `formattingFlags` | `string[] \| undefined` | `undefined` | `atsGapAnalysis` | runner |
| `atsScenarioSummary` | `string \| undefined` | `undefined` | — (Phase 1: not written) | verdict nodes |
| `terminologyDiffs` | `TerminologyDiff[] \| undefined` | `undefined` | verdict nodes | runner |
| `verdictAha` | `string \| undefined` | `undefined` | verdict nodes | runner (emitted in `node_done`) |
| `closingSummary` | `string \| undefined` | `undefined` | verdict nodes | runner (remapped to `scenarioSummary.text` in `PublicMatchResponse`) |
| `scenarioId` | `ScenarioId \| undefined` | `undefined` | `routeVerdicts` | all verdict nodes, runner |
| `fitAdvice` | `Record<string, unknown> \| undefined` | `undefined` | verdict nodes | runner |
| `hitlFired` | `boolean` | `false` | `analyzeSkepticalReconciliation` | `analyzeSkepticalReconciliation` |
| `intent` | `"confident_match" \| "exploring_gap" \| undefined` | `undefined` | request body | — |
| `intentContext` | `ConfidentMatchContext \| ExploringGapContext \| undefined` | `undefined` | request body | — |
| `userTier` | `"base" \| "paid"` | `"base"` | request body (hardcoded) | — |
| `threadId` | `string \| undefined` | `undefined` | — | runner |

`humanContext` uses an append reducer: `prev ? "${prev}\n${next}" : next` — subsequent HITL
passes accumulate context rather than overwriting it.

`weakMatchReason` lives inside `fitAnalysis`, not as a top-level field. It is accessed as
`fitAnalysis.weakMatchReason` throughout the graph.

---

## Type definitions

```typescript
interface AtsProfile {
  atsScore: number | null

  machineParsing: {
    likelyTwoColumn: boolean
    hasTablesOrGraphics: boolean
    contactInHeaderFooter: boolean
    inconsistentDateFormats: boolean
    nonStandardBullets: boolean
    missingSections: string[]
    flags: string[]             // human-readable summary of issues found
  }

  knockoutQuestions: {
    question: string
    inferredFromJD: string
    candidatePasses: boolean | null
    riskLevel: "pass" | "at_risk" | "unknown"
  }[]

  recruiterSearch: {
    likelySearchQuery: string
    termsPresentInResume: string[]
    termsMissingFromResume: string[]
    terminologyMismatches: {
      resumeUses: string
      jdExpects: string
    }[]
  }

  machineRanking: string[]      // keyword gap summary strings for UI display
}

interface TerminologyDiff {
  location: string              // e.g. "Senior Engineer @ Acme — bullet 2"
  swapLabel: string             // e.g. "agent orchestration → agentic systems"
  before: string                // exact original sentence from resume
  after: string                 // rewritten sentence with swap applied
}
```

`machineParsing` is LLM-inferred from text artifacts in Phase 1. The LLM cannot detect
two-column layout from linearized plain text — programmatic PDF/DOCX file analysis is the
Phase 2 upgrade path for reliable formatting detection.

---

## API

### Routes

| Route | Method | Request body | Response |
|-------|--------|--------------|----------|
| `/api/match/run` | POST | `{ resumeText, jobText, intent, intentContext }` | SSE stream |
| `/api/match/resume` | POST | `{ threadId, humanContext }` | SSE stream |
| `/api/match/accept` | POST | `{ threadId }` | SSE stream |
| `/api/match/cancel` | POST | `{ threadId, rootRunId?, runStartTime? }` | JSON `{ cancelled: true }` |
| `/api/parse-resume` | POST | FormData with `resume` (PDF file) | JSON `{ text }` |
| `/api/health` | GET | — | JSON `{ status: "ok", timestamp }` |

All routes validate request bodies with Zod before touching the graph. Text fields are
clamped to 1–100,000 chars. `/run` uses a discriminated union schema to enforce that
`intentContext` shape matches `intent`.

### `/api/match/run` — request body

```typescript
{
  resumeText: string
  jobText: string
  intent: "confident_match" | "exploring_gap"
  intentContext: ConfidentMatchContext | ExploringGapContext
}

interface ConfidentMatchContext {
  basis: Array<"direct_experience" | "adjacent_role" | "side_projects" | "self_taught" | "career_pivot">
}

interface ExploringGapContext {
  timeline: "applying_now" | "three_to_six_months" | "one_year_plus"
  currentStatus: Array<"side_projects" | "self_taught" | "transferable_skills" | "starting_from_scratch" | "already_retraining">
}
```

### SSE events

| Event | Payload | When |
|-------|---------|------|
| `meta` | `{ threadId, rootRunId, runStartTime }` | Before graph invocation (LangSmith enabled only) |
| `node_start` | `{ node, timestamp }` | Tracked node begins |
| `node_done` | see per-node payload below | Tracked node completes |
| `completed` | `{ result: PublicMatchResponse }` | Graph ran to completion |
| `interrupted` | `{ fitScore, threadId, contextPrompt }` | HITL interrupt fired |
| `error` | `{ error, message }` | Any execution error |

#### `node_done` payload — per node

Each node emits a base payload plus node-specific fields. The `aha` field is the provenance trail beat for that node — one sentence, human-readable, surfaced in the logic pill UI.

```typescript
// base (all nodes)
{ node: string, durationMs: number, timestamp: string }

// atsAnalysis
{
  node: "atsAnalysis", durationMs, timestamp,
  aha: string    // one sentence — most important ATS observation, pure finding only
                 // e.g. "Your resume surfaces for Python and LangGraph but misses
                 //       RAG and agentic systems — the terms the recruiter is filtering for."
}

// generateTerminologyFixes
{ node: "generateTerminologyFixes", durationMs, timestamp }
// no aha — output already surfaced in ATS panel cards, no duplication

// analyzeFit
{
  node: "analyzeFit", durationMs, timestamp,
  aha: string    // one sentence — sharpest human fit observation
                 // e.g. "Your Wayfair replatforming work maps directly to fulfillment
                 //       automation — but your resume frames it as storefront engineering."
}

// routeVerdicts
{
  node: "routeVerdicts", durationMs: 0, timestamp,
  fitScore: number,
  atsScore: number | null,
  scenarioId: ScenarioId
  // no aha — the routing data IS the observation, rendered deterministically in the pill
}

// verdict nodes (analyzeStrongMatch | analyzeNarrativeGap | analyzeSkepticalReconciliation)
{
  node: "analyzeStrongMatch" | "analyzeNarrativeGap" | "analyzeSkepticalReconciliation",
  durationMs, timestamp,
  aha: string    // one LLM sentence — points user to the single most important result card
                 // e.g. "Your reframing cards show exactly how to retell the Wayfair
                 //       story as fulfillment-native — start there."
                 // For honest_verdict first pass: points to the HITL context question
                 // For honest_verdict second pass: reflects whether context shifted assessment
}
```

#### Provenance trail — pill content spec

The logic pill in the frontend assembles its provenance trail from `node_done` events in arrival order. Four beats, rendered sequentially as nodes complete:

```
Beat 1 — atsAnalysis node_done
  aha string (LLM-generated, one sentence)

Beat 2 — analyzeFit node_done
  aha string (LLM-generated, one sentence)

Beat 3 — routeVerdicts node_done
  Deterministic render: "fit {fitScore} · ATS {atsScore} → {scenarioId label}"
  Different visual treatment from beats 1 and 2 — mechanical, smaller, muted

Beat 4 — verdict node node_done
  aha string (LLM-generated, one sentence)
  Followed by: "Results ready — collapse to view" (static closing line, not LLM)
```

The pill auto-expands when "Analyze Match" is pressed. It does not auto-collapse on `completed` — the user closes it manually. The static "Results ready — collapse to view" line appears as the final beat when the verdict node fires, cueing the user that the results are ready without forcing them to close.

`contextPrompt` in the interrupted payload is the question string generated by
`analyzeSkepticalReconciliation` and passed to LangGraph's `interrupt()`. May be `null`
if the LLM did not generate a question — the frontend always renders fallback copy.

### `completed` event — `PublicMatchResponse` shape

```typescript
{
  scenarioId: "confirmed_fit" | "invisible_expert" | "narrative_gap" | "honest_verdict"
  fitScore: number
  battleCard: { headline: string; bulletPoints: string[] }
  fitAdvice: { key: string; bulletPoints: string[] }[]   // empty for confirmed_fit

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

  provenanceTrail: {
    node: string
    durationMs: number
    aha: string | null          // null for generateTerminologyFixes; routeVerdicts uses
                                // fitScore/atsScore/scenarioId instead
    fitScore?: number           // routeVerdicts beat only
    atsScore?: number | null    // routeVerdicts beat only
    scenarioId?: ScenarioId     // routeVerdicts beat only
  }[]

  scenarioSummary: { text: string }   // populated from closingSummary (verdict node)
                                       // scenario-aware synthesis of fitScenarioSummary
                                       // + atsScenarioSummary — the closing statement
                                       // the user reads at the bottom of the report
  threadId: string
  _meta: { durationMs: number }
}
```

`fitAdvice` keys by scenario:
- `confirmed_fit`: `lead_with_these`, `expect_these_questions`, `watch_out_for`
- `invisible_expert`: `standout_strengths`, `ats_reality_check`, `terminology_swaps`, `keywords_to_add`
- `narrative_gap`: `transferable_strengths`, `reframing_suggestions`, `missing_skills`
- `honest_verdict`: `honest_assessment`, `closing_steps`, `acknowledgement` (optional — present if HITL context changed the assessment)

`provenanceTrail` is assembled by the runner from `node_done` events in arrival order. It is
always present in `PublicMatchResponse` — the frontend logic pill consumes it directly.
`generateTerminologyFixes` is included as a beat with `aha: null` so the pill can show its
duration without a text observation. `routeVerdicts` beat renders deterministically from
`fitScore`, `atsScore`, and `scenarioId` — the pill formats this as
`"fit {fitScore} · ATS {atsScore} → {scenarioLabel}"` without an aha string.

`PublicMatchResponseSchema` (Zod) validates the mapped result before emission. If validation
fails, an `error` event is emitted instead of malformed data.

Internal fields never emitted: `fitAnalysis`, `fitScenarioSummary`, `atsScenarioSummary`,
`closingSummary` (remapped to `scenarioSummary.text`), `atsAha`, `fitAha`, `verdictAha`
(remapped into `provenanceTrail`), `headline` (remapped to `battleCard.headline`),
`battleCardBullets` (remapped to `battleCard.bulletPoints`), `sourceRole`, `targetRole`,
`weakMatch`, `humanContext`, `hitlFired`, `contextPrompt`.

---

## HITL flow

1. `analyzeSkepticalReconciliation` fires for `honest_verdict` (fitScore < 60)
2. If first pass and LLM returns a `contextPrompt` question: calls `interrupt(contextPrompt)`,
   sets `hitlFired = true`, loops back to itself
3. Backend emits `interrupted` SSE event with `fitScore`, `threadId`, `contextPrompt`
4. Thread persists in checkpointer (not deleted)
5. Frontend shows `HitlDrawer` — user types context and submits
6. `POST /api/match/resume` sends `{ threadId, humanContext }` → resumes graph via
   `Command({ resume: humanContext })`
7. Second pass runs with `humanContext` in state, `hitlFired = true` prevents second interrupt
8. Graph completes normally, emits `completed`

**Accept path:** `POST /api/match/accept` reads final state from checkpointer without
re-invoking the graph, then emits `completed` with the pre-interrupt state.

---

## Frontend

### Entry point and state management

`app/(main)/page.tsx` is a single `"use client"` page. All application state lives in
`useMatchRunner` — no global store (no Zustand, Redux, Context). The page calls the hook
once and fans props out to children.

```
app/(main)/page.tsx
  ├── useMatchRunner()          ← single source of truth for all state
  ├── <Header />
  ├── <UploadSection />         ← resume + JD input, sticky slim bar
  ├── <MainResultsStage />      ← results tabs, stepper, fit advice, ATS panel
  └── <HitlDrawer />            ← slides up from bottom on interrupted state
```

### `useMatchRunner` — what it owns

```typescript
// App state machine
appState: "idle" | "running" | "interrupted" | "completed"

// Inputs
resumeText: string | null
jobDescription: string
parseLoading: boolean
parseError: string | null
fileInputRef: RefObject<HTMLInputElement>

// HITL
humanContext: string
contextPrompt: string | null   // from interrupted SSE event, null if absent
interruptedScore: number | null

// Results
result: MatchResponse | null
matchError: string | null
progress: Record<string, NodeProgress>

// Derived flags (not state — re-derived on every render)
isInputsDisabled: boolean      // appState === "running" || "interrupted"
canMatch: boolean              // !isInputsDisabled && resumeText && jobDescription.trim()
showCancel: boolean            // same as isInputsDisabled

// Handlers
handleMatch, handleRescore, handleAccept, handleCancel,
handleFileUpload, handleClearResume,
setJobDescription, setHumanContext
```

Node progress tracking: three steps — `atsAnalysis`, `analyzeFit`, `analyzeMatch`.
All three verdict nodes normalise to `"analyzeMatch"` for the stepper UI.
`generateTerminologyFixes` is tracked in `progress` but normalised to `"atsAnalysis"` —
it is part of the ATS analysis work from the user's perspective.

### Component inventory

**Layout:**
- `Header` — sticky, `z-50`, `h-[88px]`, Base UI `Menu` dropdown
- `UploadSection` — sticky slim bar at `top-[88px]`, `z-10`. Two cards (resume + JD) with
  3 visual states: empty (dashed border), uploaded (solid border), running (opacity-40,
  pointer-events-none). JD input via `Dialog` modal.
- `HitlDrawer` — `position: fixed`, bottom-of-viewport slide-up, `z-50`. Opens when
  `appState === "interrupted"`. Always shows fallback copy if `contextPrompt` is null.

**Results (`components/resume-init/`):**
- `MainResultsStage` — owns `activeTab` state, 3-tab layout (ResumeInit / CompanyInit / ArcInit)
- `ResultsHeader` — tab switcher + progress bar
- `ResultsTop` — stepper + BattleCard
- `Stepper` — 3 nodes with done/active/idle states
- `BattleCard` — score circle + headline + bullets, skeleton while loading
- `FitAdviceAccordion` — Base UI Accordion, maps `fitAdvice` keys via `accordion-config.ts`
- `ScenarioSummary` — left-border accent block
- `AtsPanelStation` — three-station ATS panel (machine parsing / knockout questions / recruiter terminal). Consumes `atsProfile` and `terminologyDiffs` from `result`. Station 3 renders `terminologyDiffs` as inline before/after diffs — no user prompt required.

**UI primitives (`components/ui/`):** `button`, `avatar`, `tabs`, `progress`, `field`,
`input`, `card`, `dialog`, `drawer` — all thin wrappers around `@base-ui/react` primitives
using CVA variants and Tailwind.

**Paywall:** `PaywallGateResult` shared by `CompanyInitResult` and `ArcInitResult`.

### Frontend → backend communication

Frontend calls the backend directly via `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:3001`).
**No Next.js proxy rewrites** — `next.config.mjs` is empty. On Vercel, `NEXT_PUBLIC_BACKEND_URL`
points to the Render service URL.

SSE is consumed by `fetch()` + `ReadableStream` reader in `useMatchRunner.processStream`.
The hook manages reader lifecycle: closes any in-flight reader before opening a new connection
to prevent duplicate-connection errors across multiple runs.

---

## Cancellation

In-memory `activeRuns` Map, keyed by `threadId`. Stores `AbortController` reference per run.
Works on single Render instance — `/run` and `/cancel` hit the same process, same Map.

`AbortController` is a Web standard. LangGraph respects the `signal` option in invoke config,
checking it between nodes. On cancel: abort signal fired → `/cancel` optionally tags the
LangSmith trace as user-cancelled → thread deleted from checkpointer.

At scale: Redis pub/sub for cross-instance abort signalling; job queue (BullMQ, Inngest) for
retries, dead letter queues, and independent worker scaling.

---

## Observability (LangSmith)

### RootRunCapture
`BaseCallbackHandler` that captures the root run ID from a LangChain invocation. Fires only
on the first chain start with no `parentRunId`. Instantiated inside the invoke closure (not
the chain factory) — lives on the stack frame of each call so concurrent requests get
independent instances.

### logValidationFailure
Attaches Zod schema failures to the LangSmith trace via `client.updateRun()`. Tags the run
with `["validation-failed", nodeName]` for filtering. Short-circuits if tracing is disabled
or `runId` is undefined — safe no-op in tests.

### Known limitation — routeVerdicts node_done payload

`routeVerdicts` returns a LangGraph `Command` object rather than a plain state update.
LangGraph does not pass the `Command`'s `update` object through to `handleChainEnd._outputs`
in the callback — it routes the update internally. As a result, the `routeVerdicts`
`node_done` SSE event carries only the base payload `{ node, durationMs, timestamp }` —
`fitScore`, `atsScore`, and `scenarioId` are absent despite being written to the Command
update in `edges.ts`.

**Frontend handling:** The logic pill renders the `routeVerdicts` beat in two phases:

1. `node_done` fires → beat 3 appears as done with placeholder text (timing only, no
   score data yet)
2. `completed` fires → beat 3 is backfilled with real data from `result.fitScore`,
   `result.atsProfile.atsScore`, and `result.scenarioId`

The gap between `routeVerdicts` `node_done` and `completed` is the verdict node duration
(~5–10s) — the backfill is effectively simultaneous with the results cards rendering from
the user's perspective.

**Do not attempt to fix this by changing the emitter or edges.ts** — the Command routing
is LangGraph-internal and not accessible via callback `_outputs`. The two-phase pill
rendering is the correct solution.

The `node_done` per-node payload spec in the SSE events section describes the intended
target state. The `routeVerdicts` entry there reflects the design intent, not the current
runtime behaviour. This discrepancy is intentional and documented here.

---

## Schema conventions

- `withStructuredOutput(Schema)` shapes LLM output but does NOT run Zod validation or apply
  `.default()` values
- Every chain: `safeParse → logValidationFailure → throw validated.error`
- Never use `Schema.parse({ ...result })` — spreading `null`/`undefined` throws TypeError
  that masks the real Zod error
- Nullable string fields: `z.string().min(1).nullable()` not `z.string().nullable()` — empty
  string is not a valid null substitute
- `weakMatch` is derived in `analyzeFit` node, not LLM output
- `fitAnalysis.weakMatchReason` is normalised in `analyzeFit` node (`"NONE"` → `null`), not LLM output

---

## LangGraph state management — known rough edges

- No access control between nodes — any node can read/write any key at runtime
- TypeScript is a guardrail at dev time, not a gate at runtime
- Overwrite reducers used for most fields — merge reducers would be better for granular nodes
- `MemorySaver` is ephemeral — paused HITL graphs lost on server restart.
  `PostgresSaver` (Supabase) required for production HITL persistence.

---

## Deployment

### Frontend: Vercel
- Serves Next.js UI only
- `NEXT_PUBLIC_BACKEND_URL` env var points to Render backend
- No API routes on Vercel

### Backend: Render (persistent server)
- Persistent Node.js process — `MemorySaver` and `activeRuns` work within a session
- Kept alive via UptimeRobot pinger every 10 minutes
- 512MB RAM limit — rules out local Ollama; uses `ChatAnthropic` in production
- `buildScoringGraph(model)` factory pattern makes model swap a one-line change

### State: Supabase
- `PostgresSaver` replaces `MemorySaver` for persistent HITL checkpointing
- Survives Render restarts and deploys
- Self-cleaning cron: `DELETE FROM checkpoints WHERE created_at < NOW() - INTERVAL '24 hours'`
- `waitlist` and `subscriptions` tables for beta user management

### Still needed at scale
- Redis: only if multiple Render instances needed
- Circuit breaker: if Anthropic has outages at scale
- SIGTERM handler: for clean deploys on Render

---

## Resilience — implemented

- `safeParse + logValidationFailure` on every chain output
- `weakMatch` derived deterministically — not an LLM output field
- `fitAnalysis.weakMatchReason` normalised deterministically — not an LLM output field
- HITL interrupt for `honest_verdict` (fitScore < 60) on first pass
- `hitlFired` guard prevents second interrupt on resume pass
- `AbortController` for user-initiated cancellation
- `activeRuns` Map (`src/active-runs.ts`) — maps `threadId` to abort fn + `runStartTime`
- `PublicMatchResponseSchema` validates before every `completed` emission
- LangSmith tagging for failure classification

## Resilience — planned

- Critical vs non-critical field distinction in schemas
- `retryCount` in `GraphState` + max retry conditional edge
- On retry exhausted → route to HITL, not silent error
- Input validation before graph starts (fail fast, save tokens)
- `maxRetries` + timeout on model constructor (transient failures only)

---

## Breaking changes log

### Summary field refactor — two-draft closing summary model (2026-04-28)

`scenarioSummary` removed from `analyzeFit` output. Replaced by two draft fields:

`fitScenarioSummary` — added to `analyzeFit`. Human fit picture in isolation: career
trajectory, strengths, gaps. Written blind to ATS context. Read by verdict nodes.

`atsScenarioSummary` — added to `atsAnalysis`. Machine picture in isolation: 2–3 sentence
plain-language synthesis of what the three ATS layers found collectively. Written blind to
fit context. Read by verdict nodes.

`closingSummary` — added to all verdict node outputs. Scenario-aware synthesis of both
draft summaries. Reads `fitScenarioSummary`, `atsScenarioSummary`, `fitAnalysis`,
`atsProfile`, `scenarioId`, and `fitAdvice`. Remapped to `scenarioSummary.text` in
`PublicMatchResponse` by the runner — no frontend schema change required.

Verdict nodes now read `fitScenarioSummary` and `atsScenarioSummary` from state in addition
to their existing inputs. State field ownership table updated accordingly.

Rationale: `analyzeFit` writes the fit summary blind to scenario and ATS findings.
`atsAnalysis` writes the ATS summary blind to fit. The verdict node, which knows both
`scenarioId` and both draft summaries, synthesises the final closing statement with
scenario-appropriate tone. For `honest_verdict` this is the most emotionally important
piece of writing in the output — direct, respectful, mentor not rejection machine.

### Provenance trail + aha observations added (2026-04-28)

`aha` fields added to `atsAnalysis`, `analyzeFit`, and all verdict node output schemas.
Each is a single LLM-generated sentence — the most important observation from that node's
analysis. `generateTerminologyFixes` and `routeVerdicts` do not produce aha fields.

`node_done` SSE payload is now node-specific rather than uniform. `atsAnalysis` and
`analyzeFit` emit `{ node, durationMs, timestamp, aha }`. `routeVerdicts` emits
`{ node, durationMs: 0, timestamp, fitScore, atsScore, scenarioId }`. Verdict nodes emit
`{ node, durationMs, timestamp, aha }`. `generateTerminologyFixes` emits base payload only.

`provenanceTrail` added to `PublicMatchResponse` — assembled by runner from `node_done`
events in arrival order. The frontend logic pill consumes this field directly to render
the four-beat provenance trail. Internal aha state fields (`atsAha`, `fitAha`,
`verdictAha`) are remapped into `provenanceTrail` by the runner and never emitted raw.

State field ownership table updated: `atsAha`, `fitAha`, `verdictAha` added as fields
written by their respective nodes and read only by the runner for remapping.

### `generateTerminologyFixes` node added; `atsProfile` schema expanded (2026-04-28)

New node `generateTerminologyFixes` added to the graph. Fans out from `atsAnalysis` output,
runs in parallel with the fit analysis path. Reads `resumeText` and
`atsProfile.recruiterSearch.terminologyMismatches`. Writes `terminologyDiffs[]` to state.
Produces exact before/after sentence rewrites automatically — no user prompt.

`atsProfile` schema expanded from `{ atsScore, machineParsing: string[], machineRanking: string[] }`
to a structured three-section object: `machineParsing` (structured formatting flags),
`knockoutQuestions` (inferred hard filters with risk level), `recruiterSearch` (Boolean
query, present/missing terms, terminology mismatches). `atsScore` composite weighting: 60%
recruiter search / 25% knockout / 15% formatting.

`terminologyDiffs` added to `PublicMatchResponse`. Frontend `AtsPanelStation` component added
to `MainResultsStage` — consumes `atsProfile` and `terminologyDiffs` from `result`.

State table: `resumeText` readers updated to include `generateTerminologyFixes`.
`weakMatchReason` removed as a top-level state field — it lives inside `fitAnalysis` as
`fitAnalysis.weakMatchReason` (this was logged in the April refactor but the state table
was not updated at that time; corrected now).

### `contextPrompt` added to interrupted SSE payload (2026-04-28)
`contextPrompt: string | null` added to the `interrupted` event alongside `fitScore` and
`threadId`. Extracted from `snapshot.tasks[0].interrupts[0].value` in `runner.ts` — the value
passed to LangGraph's `interrupt()` by `analyzeSkepticalReconciliation`. May be `null`.

### Graph refactor — `parseResume`, `parseJob`, `scoreMatch` removed (2026-04)
`parseResume` and `parseJob` nodes deleted. Both `analyzeFit` and `atsAnalysis` read raw
`resumeText` and `jobText` directly. `scoreMatch` renamed to `analyzeFit` with an expanded
output schema (adds `headline`, `battleCardBullets`, `scenarioSummary`, `sourceRole`,
`targetRole`, `fitAnalysis`). Verdict nodes added: `analyzeStrongMatch`, `analyzeNarrativeGap`,
`analyzeSkepticalReconciliation`. `weakMatchReason` moved from top-level state into
`fitAnalysis.weakMatchReason`.

### `score` renamed to `fitScore` (2026-04-05)
`MatchResult.score` and `MatchResponse.score` renamed to `fitScore`. Any client reading
`score` from the SSE stream will receive `undefined` after this change.