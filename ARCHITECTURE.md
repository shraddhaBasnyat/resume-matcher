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