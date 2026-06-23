# Architecture — resume-matcher

## Why this exists
A learning project built to understand LangChain and LangGraph by building something real.
Decisions here prioritise clarity over production readiness.

---

## Graph topology

```
START
  ├→ analyzeJD ──────────────┐
  └→ analyzeResume ──────────┤
                             ├→ atsGapAnalysis (deterministic, no LLM) ─┐
                             └→ analyzeFit ─────────────────────────────┤
                                                                         ↓
                                                                  routeVerdicts (pure fn, no LLM)
                                                                         │
                              ┌──────────────────────────────────────────┼──────────────────────┐
                              ↓                                          ↓                      ↓
                    analyzeStrongMatch                        analyzeNarrativeGap  analyzeSkepticalReconciliation
                              │                                          │                      │
                              └──────────────────────────────────────────┘                      ↓
                                                   ↓                                        hitlGate (interrupt)
                                                  END                                           │
                                                                                                └→ analyzeSkepticalReconciliation (2nd pass)
                                                                                                        ↓
                                                                                                       END
```

`analyzeJD` and `analyzeResume` run **in parallel** from `START`. Both must complete before
`atsGapAnalysis` and `analyzeFit` start — these two also run in parallel (fan-in from both
analyze nodes). `routeVerdicts` fires after both complete. Exactly one verdict node fires per
run. For `honest_verdict`, if `analyzeSkepticalReconciliation` sets a `contextPrompt`, a
conditional edge routes to `hitlGate`, which calls `interrupt()`. On resume, `hitlGate` writes
`humanContext` and routes back to `analyzeSkepticalReconciliation` for the second pass.

---

## Node responsibilities

| Node | Reads | Writes | Notes |
|------|-------|--------|-------|
| `analyzeJD` | `jobText` | `jdArchetype`, `realAsk`, `recruiterFilter` | LLM. Reads the JD blind — no resume context. `recruiterFilter`: mechanical Boolean-style filter string used by `atsGapAnalysis`. `realAsk`: the specific problem this company is hiring to solve. `jdArchetype.ideal` + `jdArchetype.couldWork` drive archetype prior in `analyzeFit`. |
| `analyzeResume` | `resumeText` | `candidateArchetype`, `demonstratedVsClaimed`, `careerArcNote`, `resumeAha` | LLM. Reads the resume blind — no JD context. `demonstratedVsClaimed`: per-bullet status (`demonstrated` / `claimed` / `ambiguous`) — consumed by `atsGapAnalysis` and `analyzeFit`. `resumeAha`: one sentence, the sharpest resume-only observation. |
| `analyzeFit` | `jdArchetype`, `realAsk`, `candidateArchetype`, `demonstratedVsClaimed` | `fitScore`, `headline`, `battleCardBullets`, `fitAnalysis`, `weakMatch`, `weakMatchReason`, `fitAha` | LLM. Cold semantic comparison of structured analyze-node outputs. `weakMatch = fitScore < 60`, derived in node. `weakMatchReason` normalised: `"NONE"` → `null`. `battleCardBullets`: `BattleCardBullet[]` — structured objects with `requirement`, `evidence`, `verdict`. `fitAha`: one sentence, emitted in `node_done`. |
| `atsGapAnalysis` | `recruiterFilter`, `resumeText`, `demonstratedVsClaimed` | `atsScore`, `termGaps`, `atsAha`, `formattingFlags` | Deterministic — no LLM. Parses `recruiterFilter` into terms, checks presence in `resumeText`, cross-references `demonstratedVsClaimed` for context status. `atsAha`: deterministic one-sentence summary built from gap counts — emitted in `node_done`. `formattingFlags`: stubbed as `[]` in Phase 1. |
| `routeVerdicts` | `fitScore`, `atsScore` | `scenarioId` | Pure fn, no LLM. Returns plain state update so `fitScore`, `atsScore`, `scenarioId` appear in `node_done` SSE payload. No aha — the scores ARE the observation. |
| `analyzeStrongMatch` | `scenarioId`, `fitAnalysis`, `jdArchetype`, `candidateArchetype`, `realAsk`, `termGaps`, `battleCardBullets`, `demonstratedVsClaimed`, `atsAha`, `userTier` | `fitAdvice`, `verdictAha` | Fires for `confirmed_fit` and `invisible_expert`. Looks up `ARCHETYPE_CONFIG[jdArchetype.ideal]` for paid-tier prompt injection. For `confirmed_fit`, `fitAdvice` contains interview prep fields. For `invisible_expert`, `fitAdvice` contains ATS remediation fields including `terminology_swaps`. |
| `analyzeNarrativeGap` | `fitAnalysis`, `jdArchetype`, `candidateArchetype`, `realAsk`, `careerArcNote`, `battleCardBullets`, `demonstratedVsClaimed` | `fitAdvice`, `verdictAha` | Fires for `narrative_gap`. ATS panel may be entirely clean — the problem is narrative, not mechanical. Looks up `ARCHETYPE_CONFIG[jdArchetype.ideal]` for paid-tier context. |
| `analyzeSkepticalReconciliation` | `fitAnalysis`, `jdArchetype`, `realAsk`, `battleCardBullets`, `demonstratedVsClaimed`, `careerArcNote`, `humanContext`, `hitlFired` | `fitAdvice`, `verdictAha`, `contextPrompt` | Fires for `honest_verdict`. First pass: if context would change assessment, sets `contextPrompt` — conditional edge routes to `hitlGate`. Second pass (after HITL): `hitlFired` is true, no second interrupt, produces `fitAdvice` with optional `acknowledgement`. |
| `hitlGate` | `contextPrompt` | `humanContext`, `hitlFired` | Calls `interrupt(state.contextPrompt)`. On resume, writes `humanContext` from the interrupt return value and sets `hitlFired: true`. Routes back to `analyzeSkepticalReconciliation` for the second pass. |

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
| `resumeText` | `string` | required | request body | `analyzeResume`, `atsGapAnalysis` |
| `jobText` | `string` | required | request body | `analyzeJD` |
| `humanContext` | `string` | `""` | `hitlGate` (on resume); append reducer | `analyzeSkepticalReconciliation` |
| `fitScore` | `number \| undefined` | `undefined` | `analyzeFit` | `routeVerdicts`, all verdict nodes, runner |
| `headline` | `string \| undefined` | `undefined` | `analyzeFit` | runner |
| `battleCardBullets` | `BattleCardBullet[] \| undefined` | `undefined` | `analyzeFit` | runner, verdict nodes |
| `fitAnalysis` | `{ keyStrengths: string[]; experienceGaps: string[] } \| undefined` | `undefined` | `analyzeFit` | all verdict nodes |
| `weakMatchReason` | `string \| null \| undefined` | `undefined` | `analyzeFit` (normalised: `"NONE"` → `null`) | `analyzeSkepticalReconciliation`, runner |
| `weakMatch` | `boolean \| undefined` | `undefined` | `analyzeFit` (derived: `fitScore < 60`) | `routeVerdicts` |
| `fitAha` | `string \| undefined` | `undefined` | `analyzeFit` | runner (emitted in `node_done`) |
| `jdArchetype` | `{ ideal: RoleArchetype; couldWork: RoleArchetype[] } \| undefined` | `undefined` | `analyzeJD` | `analyzeFit`, verdict nodes |
| `realAsk` | `string \| undefined` | `undefined` | `analyzeJD` | `analyzeFit`, verdict nodes |
| `recruiterFilter` | `string \| undefined` | `undefined` | `analyzeJD` | `atsGapAnalysis` |
| `candidateArchetype` | `RoleArchetype \| undefined` | `undefined` | `analyzeResume` | `analyzeFit`, verdict nodes |
| `demonstratedVsClaimed` | `DemonstratedVsClaimed[] \| undefined` | `undefined` | `analyzeResume` | `analyzeFit`, `atsGapAnalysis`, verdict nodes |
| `careerArcNote` | `CareerArcNote \| undefined` | `undefined` | `analyzeResume` | `analyzeNarrativeGap`, `analyzeSkepticalReconciliation` |
| `resumeAha` | `string \| undefined` | `undefined` | `analyzeResume` | — (reserved for future runner surfacing) |
| `atsScore` | `number \| null \| undefined` | `undefined` | `atsGapAnalysis` | `routeVerdicts`, runner |
| `termGaps` | `TermGap[] \| undefined` | `undefined` | `atsGapAnalysis` | `analyzeStrongMatch` |
| `formattingFlags` | `string[] \| undefined` | `undefined` | `atsGapAnalysis` (stubbed `[]` in Phase 1) | — |
| `atsAha` | `string \| undefined` | `undefined` | `atsGapAnalysis` | runner (emitted in `node_done`) |
| `atsScenarioSummary` | `string \| undefined` | `undefined` | — (Phase 1: not written; `atsGapAnalysis` is deterministic) | verdict nodes |
| `verdictAha` | `string \| undefined` | `undefined` | verdict nodes | runner (emitted in `node_done`) |
| `scenarioId` | `ScenarioId \| undefined` | `undefined` | `routeVerdicts` | all verdict nodes, runner |
| `fitAdvice` | `Record<string, unknown> \| undefined` | `undefined` | verdict nodes | runner |
| `contextPrompt` | `string \| null` | `null` | `analyzeSkepticalReconciliation` | `hitlGate` |
| `hitlFired` | `boolean` | `false` | `hitlGate` | `analyzeSkepticalReconciliation` (guards against second interrupt) |
| `intent` | `"confident_match" \| "exploring_gap" \| undefined` | `undefined` | request body | — |
| `intentContext` | `ConfidentMatchContext \| ExploringGapContext \| undefined` | `undefined` | request body | — |
| `userTier` | `"base" \| "paid"` | `"base"` | request body (hardcoded) | verdict nodes |
| `threadId` | `string \| undefined` | `undefined` | — | runner |

`humanContext` uses an append reducer: `prev ? "${prev}\n${next}" : next` — subsequent HITL
passes accumulate context rather than overwriting it.

---

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

// atsGapAnalysis
{
  node: "atsGapAnalysis", durationMs, timestamp,
  aha: string    // one sentence — built deterministically from term gap counts
                 // e.g. "Resume matches 2 of 5 recruiter filter terms — missing: RAG, agentic systems, embeddings."
}

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
Beat 1 — atsGapAnalysis node_done
  aha string (deterministic, one sentence built from gap counts)

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

`contextPrompt` in the interrupted payload is the question string written to state by
`analyzeSkepticalReconciliation` and passed to LangGraph's `interrupt()` by `hitlGate`. May
be `null` if the LLM did not generate a question — the frontend always renders fallback copy.

### `completed` event — `PublicMatchResponse` shape

```typescript
{
  scenarioId: "confirmed_fit" | "invisible_expert" | "narrative_gap" | "honest_verdict"
  fitScore: number
  battleCard: {
    headline: string
    bullets: {
      requirement: string
      evidence: string
      verdict: "hard_gap" | "framing_gap" | "terminology_gap" | "strong_match" | "evidence_gap"
    }[]
  }
  fitAdvice: Array<
    | { key: "reframing_suggestions";  items: ReframingItem[] }
    | { key: "missing_skills";         items: TaggedItem[]    }
    | { key: "lead_with_these";        items: EvidenceItem[]  }
    | { key: "expect_these_questions"; items: EvidenceItem[]  }
    | { key: "watch_out_for";          items: EvidenceItem[]  }
    | { key: "standout_strengths";     items: EvidenceItem[]  }
    | { key: "ats_reality_check";      items: EvidenceItem[]  }
    | { key: "terminology_swaps";      items: ReframingItem[] }
    | { key: "keywords_to_add";        items: TaggedItem[]    }
    | { key: "honest_assessment";      items: EvidenceItem[]  }
    | { key: "closing_steps";          items: TaggedItem[]    }
    | { key: "acknowledgement";        items: EvidenceItem[]  }
  >
  atsScore: number | null
  threadId: string
  _meta: { durationMs: number }
}
```

Item types (`types/fit-advice.ts`): `EvidenceItem = { label, detail, confidence: "high" | "medium" }`;
`ReframingItem = { before, after, reason }`; `TaggedItem = { severity: "material" | "notable", text }`.
`confidence` and `severity` are derived deterministically in `mapFitAdvice` in `runner.ts`, not
produced by the LLM.

`fitAdvice` keys by scenario:
- `confirmed_fit`: `lead_with_these`, `expect_these_questions`, `watch_out_for`
- `invisible_expert`: `standout_strengths`, `ats_reality_check`, `terminology_swaps`, `keywords_to_add`
- `narrative_gap`: `reframing_suggestions`, `missing_skills`
- `honest_verdict`: `honest_assessment`, `closing_steps`, `acknowledgement` (optional — present if HITL context was provided)

The frontend logic pill assembles its provenance trail from `node_done` events in arrival order.
`routeVerdicts` beat renders deterministically from `fitScore`, `atsScore`, and `scenarioId`
emitted in its `node_done` payload — formatted as `"fit {fitScore} · ATS {atsScore} → {scenarioLabel}"` without an aha string.

`PublicMatchResponseSchema` (Zod) validates the mapped result before emission. If validation
fails, an `error` event is emitted instead of malformed data.

Internal fields never emitted: `fitAnalysis`, `atsScenarioSummary`, `atsAha`, `fitAha`,
`verdictAha`, `headline` (remapped to `battleCard.headline`), `battleCardBullets` (remapped
to `battleCard.bullets`), `weakMatch`, `weakMatchReason`, `humanContext`, `hitlFired`,
`contextPrompt`, `termGaps`, `formattingFlags`, `recruiterFilter`, `resumeAha`.

---

## HITL flow

1. `analyzeSkepticalReconciliation` fires for `honest_verdict` (fitScore < 60)
2. If first pass and LLM sets a `contextPrompt`: node writes `contextPrompt` to state and
   returns. A conditional edge routes to the `hitlGate` node (if `contextPrompt != null &&
   !hitlFired`). `hitlGate` calls `interrupt(state.contextPrompt)` and sets `hitlFired: true`.
3. Backend emits `interrupted` SSE event with `fitScore`, `threadId`, `contextPrompt`
4. Thread persists in checkpointer (not deleted)
5. Frontend shows `HitlDrawer` — user types context and submits
6. `POST /api/match/resume` sends `{ threadId, humanContext }` → resumes graph via
   `Command({ resume: humanContext })`. `hitlGate` resumes, writes `humanContext` to state,
   then routes to `analyzeSkepticalReconciliation` for the second pass.
7. Second pass: `hitlFired` is already `true` — conditional edge bypasses `hitlGate`, verdict
   node produces `fitAdvice` with optional `acknowledgement`
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

Node progress tracking: three steps — `atsGapAnalysis`, `analyzeFit`, `analyzeMatch`.
All three verdict nodes normalise to `"analyzeMatch"` for the stepper UI.

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
- `BattleCard` — score circle + headline + structured bullet rows with `VerdictPill`
- `FitAdviceCard` — collapsible card shell; body component selected by `key` discriminant
- `EvidenceListBody`, `BeforeAfterBody`, `TaggedListBody` — body renderers for the three item types
- `CoachesNotes` — provenance trail strip above the BattleCard, driven by `node_done` SSE events

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

## Schema conventions

- `withStructuredOutput(Schema)` shapes LLM output but does NOT run Zod validation or apply
  `.default()` values
- Every chain: `safeParse → logValidationFailure → throw validated.error`
- Never use `Schema.parse({ ...result })` — spreading `null`/`undefined` throws TypeError
  that masks the real Zod error
- Nullable string fields: `z.string().min(1).nullable()` not `z.string().nullable()` — empty
  string is not a valid null substitute
- `weakMatch` is derived in `analyzeFit` node, not LLM output
- `weakMatchReason` is normalised in `analyzeFit` node (`"NONE"` → `null`), not LLM output; stored as a top-level state field

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
- `weakMatchReason` normalised deterministically (`"NONE"` → `null`) — not an LLM output field
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

