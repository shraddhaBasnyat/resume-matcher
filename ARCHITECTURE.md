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
- MemorySaver is ephemeral — paused HITL graphs lost on server restart

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