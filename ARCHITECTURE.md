# Architecture decisions & known limitations

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
| Node        | Reads                             | Writes      |
|-------------|-----------------------------------|-------------|
| parseResume | resumeText                        | resumeData  |
| parseJob    | jobText                           | jobData     |
| scoreMatch  | resumeData, jobData, humanContext | matchResult |
| gapAnalysis | matchResult, resumeData, jobData  | matchResult |

## Schema design

### withStructuredOutput() vs Zod validation
- withStructuredOutput(Schema) shapes LLM output into an object 
  but does NOT run Zod validation or apply .default() values
- Manual ResumeSchema.safeParse(result) added after every 
  withStructuredOutput() call to apply defaults and catch invalid shapes
- Current gap: critical field failures (name, email) not yet routed 
  differently from non-critical — lands with the planned retry work

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

### /api/match — SSE streaming
_to document after reading app/api/match/route.ts_

### /api/parse-resume — standalone debug utility
_to document after reading app/api/parse-resume/route.ts_

## Resilience strategies

### Implemented
- safeParse + logValidationFailure on every chain output
- HITL interrupt for low confidence scores
- AbortController for user-initiated cancellation
- LangSmith tagging for failure classification

### Planned (schema and graph retry are coupled — implement together)
- Critical vs non-critical field distinction in schemas
  (name, email: no default → fail fast)
- retryCount in GraphState + max retry conditional edge
- On retry exhausted → route to HITL, not silent error
- Input validation before graph starts (fail fast, save tokens)
- maxRetries + timeout on model constructor (transient failures only)

## Production migration

### Model swap (simple — one line change)
- Swap ChatOllama for ChatAnthropic or ChatGoogleGenerativeAI
- buildScoringGraph(model) factory pattern makes this isolated

### Persistent server requirements (needed for HITL + cancel)
- Persistent checkpointer (PostgresSaver, RedisSaver) for HITL
- activeRuns Map → Redis for cross-instance cancel support
- SIGTERM handler to abort in-flight runs cleanly
- Layered timeouts per node and per graph
- Circuit breaker for LLM provider
- Dead letter logging for exhausted retries

## Dual HITL pattern

Same /api/match endpoint supports two interaction patterns:

Stateful (web app, localhost):
  → graph runs → interrupt fires → threadId returned
  → user adds context → POST with threadId → graph resumes
  → requires persistent server + MemorySaver

Stateless (Chrome extension, serverless):
  → graph runs → low score returned to client
  → user adds context → POST with humanContext, no threadId
  → fresh graph run with humanContext in initial state
  → works anywhere, no server-side state required

Caller chooses the pattern. API supports both.

### Why two patterns
Chrome Extension popup closes on outside click — threadId lost,
paused graph orphaned in memory. Stateless pattern avoids this.
Stateless also works on Vercel serverless where process memory
resets between requests.
Tradeoff: stateless re-runs parseResume + parseJob (~2-3s on cloud
models, ~90s on local Ollama — only acceptable with cloud models).

## Product model - Chrome Extension
API key bring-your-own — user provides their own OpenAI/Anthropic key.
Zero inference costs. License validation via Gumroad.
See Chrome Extension HITL concern for stateless HITL pattern.
