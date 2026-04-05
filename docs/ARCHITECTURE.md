# Architecture decisions & known limitations

## Breaking changes

### `score` renamed to `fitScore` (2026-04-05)
`MatchResult.score` and `MatchResponse.score` renamed to `fitScore` across backend and frontend.
`atsScore: number | undefined` added alongside it — set to `undefined` until the `atsAnalysis` node lands in Phase 1.
Any client reading the `score` field from the `/api/match/run` SSE stream will receive `undefined` after this change.
The field is now `fitScore` in the `completed` event payload.

---

## Why this exists
This is a learning project built to understand LangChain and LangGraph
by building something real. Decisions here prioritize clarity over
production readiness.

## LangGraph state management
- No access control between nodes — any node can read/write any key
- TypeScript is a guardrail, not a gate — it catches mistakes at dev time 
  but does not prevent nodes from accessing keys they shouldn't at runtime.
- No visible subscriptions — no built-in way to see which nodes own which keys
- Overwrite reducers used throughout — merge reducers would be better 
  for granular nodes
- MemorySaver is ephemeral — paused HITL graphs lost on server restart.
  Moving off localhost requires a persistent checkpointer (PostgresSaver,
  RedisSaver) — without it, HITL sessions are dropped silently on restart.

## Node data flow

`parseResume` and `parseJob` run **in parallel** from `__start__` — both edges are added
directly to `__start__` in the StateGraph, so they execute concurrently before `scoreMatch`.

| Node        | Reads                                      | Writes                              | Notes |
|-------------|--------------------------------------------|-------------------------------------|-------|
| parseResume | resumeText                                 | resumeData (incl. sourceRole)       | parallel with parseJob |
| parseJob    | jobText                                    | jobData (incl. targetRole)          | parallel with parseResume |
| scoreMatch  | resumeData, jobData, intent, intentContext | matchResult (fitScore, weakMatch derived) | weakMatch = fitScore < 60, not LLM output |
| awaitHuman  | —                                          | humanContext                        | LangGraph interrupt(); fitScore < 60 + confident_match only; pauses until /api/match/resume |
| rescore     | resumeData, jobData, humanContext          | matchResult                         | same function as scoreMatch, re-bound so humanContext is in state |
| gapAnalysis | matchResult, resumeData, jobData           | matchResult                         | being replaced by scenario nodes in Pass 2 |

### New graph state fields (Pass 1)

| Field | Type | Default | Source |
|-------|------|---------|--------|
| intent | "confident_match" \| "exploring_gap" | required | request body |
| intentContext | ConfidentMatchContext \| ExploringGapContext | required | request body |
| archetypeContext | ArchetypeContext \| null | null | detectArchetype node (Pass 2) |
| hitlFired | boolean | false | set by awaitHuman node (Pass 2) |
| userTier | "base" \| "paid" | "base" | auth middleware (Pass 2), hardcoded for now |
| atsScore | number \| undefined | undefined | atsAnalysis node (Phase 1 ATS pipeline) |

### Cancellation

#### activeRuns Map (current)
In-memory Map keyed by threadId.
Stores AbortController reference per active graph run.
Works on single Render instance — both /run and /cancel 
hit the same process, same Map.

AbortController is a Web standard — not LangGraph specific.
LangGraph respects the signal option in invoke config,
checking it between nodes.

#### Conventional alternatives at scale
Single instance: activeRuns Map (current approach) — sufficient
Multi-instance: Redis pub/sub for cross-instance abort signalling
Production traffic: Job queue (BullMQ, Inngest) — cancellation,
  retries, dead letter queues built in, workers scale independently

## Schema design

### withStructuredOutput() vs Zod validation
- withStructuredOutput(Schema) shapes LLM output into an object
  but does NOT run Zod validation or apply .default() values
- Manual Schema.safeParse(result) added after withStructuredOutput() in
  resume-chain, job-chain, scoring-chain, and gap-analysis-chain to apply
  defaults and catch invalid shapes
- weakMatch is no longer an LLM output field — derived deterministically
  as fitScore < 60 in the scoreMatch node after chain returns
- contextPrompt is stripped from gap-analysis-chain output schema and
  reattached programmatically from input — model never regenerates it
- sourceRole and targetRole validated as z.enum(SOURCE_ROLE_VOCABULARY).catch("unknown")
  — invalid model output coerces to "unknown" transparently, which returns
  null from buildContext and degrades gracefully

### resumeAdvice type
- Defined in lib/schemas/match-schema.ts as z.array(z.string()) — string[],
  not a single string. Each element is one actionable resume suggestion.
  gapAnalysis rewrites this array with section-level advice referencing
  actual resume content.

## LangSmith observability

### Run ID capture (RootRunCapture)
- BaseCallbackHandler that captures the root run ID from a LangChain invocation
- Only fires on the first chain start with no parentRunId
- Instantiated inside the invoke closure, not the chain factory — lives on 
  the stack frame of each call so concurrent requests get independent instances
- Pattern: new RootRunCapture((id) => { capturedRunId = id }) passed in 
  callbacks array on every structuredModel.invoke()

### Validation failure logging (logValidationFailure)
- Attaches schema validation failures to the LangSmith trace via client.updateRun()
- Tags the run with ["validation-failed", nodeName] for filtering
- Short-circuits if tracing is disabled or runId is undefined — safe no-op in tests

## API design

### Match API — three routes, all SSE streaming

| Route | Request body | Response |
|---|---|---|
| `POST /api/match/run` | `{ resumeText, jobText, intent, intentContext }` | SSE stream |
| `POST /api/match/resume` | `{ threadId: string, humanContext: string }` | SSE stream |
| `POST /api/match/cancel` | `{ threadId: string, rootRunId?: string, runStartTime?: number }` | `{ cancelled: true }` JSON |

`/run` starts a fresh graph run. `humanContext` is no longer accepted on first run — structured
`intent` and `intentContext` replace it. Free text context is only accepted via `/resume` (HITL).

`/resume` resumes a HITL-interrupted run via LangGraph `Command({ resume })`. `humanContext`
must be a non-empty string — validated by Zod `z.string().min(1)` before the graph resumes.

`/cancel` aborts the in-flight run via `activeRuns` and optionally tags the LangSmith trace
as user-cancelled.

All three routes validate their request bodies with Zod schemas before touching the graph.

### /api/match/run — request body shape
```typescript
{
  resumeText: string
  jobText: string
  intent: "confident_match" | "exploring_gap"
  intentContext: ConfidentMatchContext | ExploringGapContext
}

// confident_match — user believes they are a strong fit
interface ConfidentMatchContext {
  basis: Array<"direct_experience" | "adjacent_role" | "side_projects" | 
               "self_taught" | "career_pivot">  // min 1
}

// exploring_gap — user wants to see how far off they are
interface ExploringGapContext {
  timeline: "applying_now" | "three_to_six_months" | "one_year_plus"
  currentStatus: Array<"side_projects" | "self_taught" | "transferable_skills" | 
                       "starting_from_scratch" | "already_retraining">  // min 1
}
```

### /api/match/run — completed SSE event payload
```typescript
{
  fitScore: number         // semantic fit score 0–100
  atsScore: number | undefined  // ATS surface score — undefined until Phase 1
  matchedSkills: string[]
  missingSkills: string[]
  narrativeAlignment: string
  gaps: string[]
  resumeAdvice: string[]
  contextPrompt: string | null
  weakMatch: boolean       // derived: fitScore < 60, not LLM output
  weakMatchReason?: string
}
```

Note: `resumeData` and `jobData` are no longer included in the completed event — internal
graph state only, not surfaced to the client.

## Resilience strategies

### Implemented
- safeParse + logValidationFailure on every chain output including gap-analysis-chain
- weakMatch derived deterministically in scoreMatch node — removed from LLM schema
- contextPrompt reattached programmatically in gap-analysis-chain — not regenerated by model
- sourceRole/targetRole vocabulary enforced at schema level via z.enum().catch("unknown")
- HITL interrupt for low confidence scores (fitScore < 60, confident_match intent)
- AbortController for user-initiated cancellation
- activeRuns Map (lib/active-runs.ts) — in-process memory only; maps threadId
  to abort fn + runStartTime; used by /api/match/cancel to abort in-flight runs
- LangSmith tagging for failure classification

### Planned (schema and graph retry are coupled — implement together)
- Critical vs non-critical field distinction in schemas
  (name, email: no default → fail fast)
- retryCount in GraphState + max retry conditional edge
- On retry exhausted → route to HITL, not silent error
- Input validation before graph starts (fail fast, save tokens)
- maxRetries + timeout on model constructor (transient failures only)

## Deployment architecture

### Frontend: Vercel (free)
- Serves Next.js UI only
- /api/* requests proxied to Render via next.config.js rewrites
- No API routes run on Vercel — avoids serverless limitations

### Backend: Render (free tier, persistent server)
- Persistent Node.js process — MemorySaver and activeRuns work correctly
- Kept alive via UptimeRobot pinger every 10 minutes
- 512MB RAM limit — rules out local Ollama
- Requires cloud LLM: ChatOllama → ChatAnthropic (Claude Haiku)
- buildScoringGraph(model) factory pattern makes model swap one line

### State: Supabase (free tier)
- PostgresSaver replaces MemorySaver for persistent HITL checkpointing
- Survives Render restarts and deploys
- waitlist table for beta user management
- subscriptions table for usage tracking
- Self-cleaning cron for expired checkpointer rows:
  DELETE FROM checkpoints WHERE created_at < NOW() - INTERVAL '24 hours'
- One-time setup: checkpointer.setup() on first deploy

### What persistent server solves
Render gives us a persistent process — these work without Redis:
- activeRuns Map survives within a session
- MemorySaver → replaced by PostgresSaver (more robust anyway)
- HITL threadId survives between /run and /resume calls
- Cancel works — AbortController is in the same process

### Still needed at scale (not now)
- Redis: only if multiple Render instances needed (free tier = one instance)
- Circuit breaker: if Anthropic has outages at scale
- SIGTERM handler: worth adding for clean deploys on Render

### Product model - Chrome Extension

### Beta (current)
- Free for invited beta users
- You manually create Supabase accounts for waitlist signups
- Usage tracked per user_id in Supabase usage table
- Monthly limit enforced in backend (limit TBD)
- Resets monthly via Supabase cron

### Cost control
Layer 1: per-user monthly usage limit tracked in Supabase
Layer 2: global Anthropic spending limit as safety net

### Auth flow per request - Planned
1. User logs in via Chrome extension → Supabase returns JWT
2. JWT sent as Bearer token to Render backend
3. Backend verifies JWT via Supabase service role key
4. Check monthly usage for that user_id
5. If under limit: run agent, increment usage
6. If over limit: return 429 with reset date

### Monetization (post PMF)
TBD based on beta feedback — options include
subscription billing via Stripe, one-time purchase,
or usage-based pricing.

## Go-to-market

### Rollout sequence
1. Build + test locally
2. Publish to Chrome Web Store (unlisted first)
3. Share with 5-10 people via direct link
4. Collect feedback, fix issues
5. Publish publicly, enable waitlist
6. Add subscription billing when ready to charge

### Waitlist flow
Chrome Web Store listing → "Get early access" in extension popup
  → user enters email → stored in Supabase waitlist table
  → you create account in Supabase dashboard 
  → trigger invite email (magic link)
  → user clicks link, sets their own password
  → logs into Chrome extension with email/password

### Supabase waitlist table
  email, signed_up_at, invited, invited_at

### Supabase usage table
  user_id (references auth.users), matches_this_month, reset_at