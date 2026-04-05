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

| Node        | Reads                             | Writes        | Notes |
|-------------|-----------------------------------|---------------|-------|
| parseResume | resumeText                        | resumeData    | parallel with parseJob |
| parseJob    | jobText                           | jobData       | parallel with parseResume |
| scoreMatch  | resumeData, jobData, humanContext | matchResult   | |
| awaitHuman  | —                                 | humanContext  | LangGraph `interrupt()` node; only reached when score < 60; pauses the graph until `/api/match/resume` is called |
| rescore     | resumeData, jobData, humanContext | matchResult   | same function as scoreMatch, re-bound as a separate node so humanContext is in state |
| gapAnalysis | matchResult, resumeData, jobData  | matchResult   | |

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
  resume-chain, job-chain, and scoring-chain to apply defaults and catch
  invalid shapes
- Known gap: gap-analysis-chain is missing the safeParse call — it returns
  the raw structuredModel result. Fix is coupled to the planned retry work
  (critical vs non-critical field distinction) so it will land there.
- Current gap: critical field failures (name, email) not yet routed
  differently from non-critical — lands with the planned retry work

### resumeAdvice type
- Defined in lib/schemas/match-schema.ts as z.array(z.string()) — string[],
  not a single string. Each element is one actionable resume suggestion.
  gapAnalysis rewrites this array with section-level advice referencing
  actual resume content.

### Future: granular schemas per node
Breaking ResumeSchema into smaller schemas per parsing strategy:
- ContactSchema → regex (deterministic, free)
- SkillsSchema → small LLM (fast, cheap)  
- NarrativeSchema → large LLM (slow, expensive, only when needed)
Each node validates its own schema before writing to state.
Self-healing: if primary strategy fails, fall back to next tier.

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
| `POST /api/match/run` | `{ resumeText: string, jobText: string, humanContext?: string }` | SSE stream |
| `POST /api/match/resume` | `{ threadId: string, humanContext: string }` | SSE stream |
| `POST /api/match/cancel` | `{ threadId: string, rootRunId?: string, runStartTime?: number }` | `{ cancelled: true }` JSON |

`/run` starts a fresh graph run. `/resume` resumes a HITL-interrupted run via
LangGraph `Command({ resume })`. `/cancel` aborts the in-flight run via
`activeRuns` and optionally tags the LangSmith trace as user-cancelled.

All three routes validate their request bodies with Zod schemas before touching the graph.
Note: `/run` and `/resume` use dedicated schema files (`run-schema.ts`, `resume-schema.ts`);
`/cancel`'s schema is defined inline in its route file.


### /api/parse-resume — standalone PDF extraction utility
Accepts `multipart/form-data` with a single `resume` field (PDF only).
Uses `pdf2json` to extract raw text, then applies light regex cleanup to fix common
PDF text-extraction artifacts (e.g. spaced-out characters like `S e n i o r → Senior`).
Returns `{ text: string }` on success or `{ error, message }` on failure.
Not connected to the LangGraph pipeline — useful for inspecting raw extracted text
before passing it to `/api/match/run`.

## Resilience strategies

### Implemented
- safeParse + logValidationFailure on every chain output (except gap-analysis-chain — see schema section)
- HITL interrupt for low confidence scores
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

## Dual HITL pattern

The same API supports two interaction patterns:

Stateful (web app, localhost + Render):
  → graph runs → interrupt fires → threadId returned
  → user adds context → POST /resume with threadId → graph resumes
  → works on Render because process is persistent
  → checkpointer: MemorySaver locally, PostgresSaver on Render

Stateless (Chrome extension):
  → graph runs → low score returned to client
  → user adds context → POST /run again with humanContext
  → fresh graph run with humanContext in initial state
  → chosen because extension popup closes on outside click
     — threadId would be lost, paused graph orphaned

Caller chooses the pattern. API supports both.

Tradeoff: stateless re-runs parseResume + parseJob.
Acceptable with Claude Haiku (~2-3s total).
Not acceptable with local Ollama (~90s).

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

### Auth flow per request
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