# Architecture — resume-matcher

## Why this exists
A learning project built to understand LangChain and LangGraph by building something real.
Decisions here prioritise clarity over production readiness.

---

## Graph topology

```
START
  ├→ atsAnalysis ──────────────┐
  └→ analyzeFit ───────────────┤
                               └→ routeVerdicts (pure fn, no LLM)
                                       │
                      ┌────────────────┼──────────────────────┐
                      ↓                ↓                      ↓
            analyzeStrongMatch  analyzeNarrativeGap  analyzeSkepticalReconciliation
                      │                │                      │ ↑ (loops on HITL)
                      └────────────────┴──────────────────────┘
                                       ↓
                                      END
```

`atsAnalysis` and `analyzeFit` run **in parallel** from `START` — both edges connect directly
to `__start__`, both must complete before `routeVerdicts` fires. Exactly one verdict node fires
per run. `analyzeSkepticalReconciliation` can loop back to itself via LangGraph `interrupt()`.

---

## Node responsibilities

| Node | Reads | Writes | Notes |
|------|-------|--------|-------|
| `analyzeFit` | `resumeText`, `jobText` | `fitScore`, `headline`, `battleCardBullets`, `scenarioSummary`, `sourceRole`, `targetRole`, `fitAnalysis`, `weakMatch`, `weakMatchReason` | `weakMatch = fitScore < 50`, derived in node. `weakMatchReason` normalised: `"NONE"` → `null` |
| `atsAnalysis` | `resumeText`, `jobText` | `atsProfile` | `machineParsing` is a TODO placeholder |
| `routeVerdicts` | `fitScore`, `atsScore` | `scenarioId` | Pure fn, no LLM — see routing thresholds below |
| `analyzeStrongMatch` | `scenarioId`, `fitAnalysis`, `atsProfile` | `fitAdvice` | Fires for `confirmed_fit` and `invisible_expert` |
| `analyzeNarrativeGap` | `scenarioId`, `fitAnalysis` | `fitAdvice` | Fires for `narrative_gap` |
| `analyzeSkepticalReconciliation` | `scenarioId`, `fitAnalysis`, `weakMatchReason`, `humanContext`, `hitlFired` | `fitAdvice`, `humanContext` (on interrupt), `hitlFired` | Fires for `honest_verdict`. Calls `interrupt(contextPrompt)` on first pass if LLM returns a question. Second pass uses `humanContext` from HITL resume. |

### Scenario routing (deriveScenario — pure fn)

```typescript
if (fitScore >= 75 && (atsScore === null || atsScore >= 75)) → "confirmed_fit"
if (fitScore >= 75 && atsScore < 75)                         → "invisible_expert"
if (fitScore >= 50)                                          → "narrative_gap"
else                                                         → "honest_verdict"
```

---

## State field ownership

LangGraph uses flat shared state — no enforced contract between nodes. This table makes
dependencies explicit. Before adding a node, declare its reads and writes here.

| Field | Type | Default | Written by | Read by |
|-------|------|---------|-----------|---------|
| `resumeText` | `string` | required | request body | `analyzeFit`, `atsAnalysis` |
| `jobText` | `string` | required | request body | `analyzeFit`, `atsAnalysis` |
| `humanContext` | `string` | `""` | HITL resume endpoint; `analyzeSkepticalReconciliation` (on interrupt) | `analyzeSkepticalReconciliation` |
| `fitScore` | `number \| undefined` | `undefined` | `analyzeFit` | `routeVerdicts`, all verdict nodes, runner |
| `headline` | `string \| undefined` | `undefined` | `analyzeFit` | runner |
| `battleCardBullets` | `string[] \| undefined` | `undefined` | `analyzeFit` | runner |
| `scenarioSummary` | `string \| undefined` | `undefined` | `analyzeFit` | runner |
| `sourceRole` | `string \| undefined` | `undefined` | `analyzeFit` | — (reserved for future archetype system) |
| `targetRole` | `string \| undefined` | `undefined` | `analyzeFit` | — (reserved for future archetype system) |
| `fitAnalysis` | `FitAnalysis \| undefined` | `undefined` | `analyzeFit` | all verdict nodes |
| `weakMatch` | `boolean \| undefined` | `undefined` | `analyzeFit` (derived) | `routeVerdicts` |
| `weakMatchReason` | `string \| null \| undefined` | `undefined` | `analyzeFit` (normalised) | `analyzeSkepticalReconciliation` |
| `atsProfile` | `{ atsScore, machineParsing, machineRanking } \| undefined` | `undefined` | `atsAnalysis` | `analyzeStrongMatch`, runner |
| `scenarioId` | `ScenarioId \| undefined` | `undefined` | `routeVerdicts` | all verdict nodes, runner |
| `fitAdvice` | `Record<string, unknown> \| undefined` | `undefined` | verdict nodes | runner |
| `hitlFired` | `boolean` | `false` | `analyzeSkepticalReconciliation` | `analyzeSkepticalReconciliation` |
| `intent` | `"confident_match" \| "exploring_gap" \| undefined` | `undefined` | request body | — |
| `intentContext` | `ConfidentMatchContext \| ExploringGapContext \| undefined` | `undefined` | request body | — |
| `userTier` | `"base" \| "paid"` | `"base"` | request body (hardcoded) | — |
| `threadId` | `string \| undefined` | `undefined` | — | runner |

`humanContext` uses an append reducer: `prev ? "${prev}\n${next}" : next` — subsequent HITL
passes accumulate context rather than overwriting it.

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
| `node_done` | `{ node, durationMs, timestamp }` | Tracked node completes |
| `completed` | `{ result: PublicMatchResponse }` | Graph ran to completion |
| `interrupted` | `{ fitScore, threadId, contextPrompt }` | HITL interrupt fired |
| `error` | `{ error, message }` | Any execution error |

`contextPrompt` in the interrupted payload is the question string generated by
`analyzeSkepticalReconciliation` and passed to LangGraph's `interrupt()`. It may be
`null` if the LLM did not generate a question — the frontend always renders fallback copy.

### `completed` event — `PublicMatchResponse` shape

```typescript
{
  scenarioId: "confirmed_fit" | "invisible_expert" | "narrative_gap" | "honest_verdict"
  fitScore: number
  battleCard: { headline: string; bulletPoints: string[] }
  fitAdvice: { key: string; bulletPoints: string[] }[]  // empty for confirmed_fit
  atsProfile: { atsScore: number | null; machineParsing: string[]; machineRanking: string[] }
  scenarioSummary: { text: string }
  threadId: string
  _meta: { durationMs: number }
}
```

`fitAdvice` keys by scenario:
- `confirmed_fit`: `[]`
- `invisible_expert`: `standout_strengths`, `ats_reality_check`, `terminology_swaps`, `keywords_to_add`
- `narrative_gap`: `transferable_strengths`, `reframing_suggestions`, `missing_skills`
- `honest_verdict`: `honest_assessment`, `closing_steps`, `acknowledgement` (optional — present if HITL context changed the assessment)

`PublicMatchResponseSchema` (Zod) validates the mapped result before emission. If validation
fails, an `error` event is emitted instead of malformed data.

---

## HITL flow

1. `analyzeSkepticalReconciliation` fires for `honest_verdict` (fitScore < 50)
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
  ├── <MainResultsStage />      ← results tabs, stepper, fit advice
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
All three verdict nodes normalise to `"analyzeMatch"` for the progress stepper UI.

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

---

## Schema conventions

- `withStructuredOutput(Schema)` shapes LLM output but does NOT run Zod validation or apply
  `.default()` values
- Every chain: `safeParse → logValidationFailure → throw validated.error`
- Never use `Schema.parse({ ...result })` — spreading `null`/`undefined` throws TypeError
  that masks the real Zod error
- Nullable string fields: `z.string().min(1).nullable()` not `z.string().nullable()` — empty
  string is not a valid null substitute
- `weakMatch` and `weakMatchReason` are derived/normalised in `analyzeFit` node, not LLM output

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
- HITL interrupt for `honest_verdict` (fitScore < 50) on first pass
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

### `contextPrompt` added to interrupted SSE payload (2026-04-28)
`contextPrompt: string | null` added to the `interrupted` event alongside `fitScore` and
`threadId`. Extracted from `snapshot.tasks[0].interrupts[0].value` in `runner.ts` — the value
passed to LangGraph's `interrupt()` by `analyzeSkepticalReconciliation`. May be `null`.

### Graph refactor — `parseResume`, `parseJob`, `scoreMatch` removed (2026-04)
`parseResume` and `parseJob` nodes deleted. Both `analyzeFit` and `atsAnalysis` read raw
`resumeText` and `jobText` directly. `scoreMatch` renamed to `analyzeFit` with an expanded
output schema (adds `headline`, `battleCardBullets`, `scenarioSummary`, `sourceRole`,
`targetRole`, `fitAnalysis`). Verdict nodes added: `analyzeStrongMatch`, `analyzeNarrativeGap`,
`analyzeSkepticalReconciliation`.

### `score` renamed to `fitScore` (2026-04-05)
`MatchResult.score` and `MatchResponse.score` renamed to `fitScore`. Any client reading
`score` from the SSE stream will receive `undefined` after this change.
