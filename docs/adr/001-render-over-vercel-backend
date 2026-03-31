# ADR 001: Render over Vercel for backend

## Date
2026-03-31

## Status
Accepted

## Context
Two operations require stateful server memory, Vercel serveless functions are stateless and will silently break the following:

Cancel: graph.invoke() runs as a background async function that returns immediately via SSE. We need to keep a reference for an inflight graph to be able to pass it to the abort controller for separate cancel post request. An active runs map keyed by thread id is used and needs to persist. 

HITL: LangGraph interrupt() pauses graph execution and persists state via a checkpointer. Resuming requires the same state to be available when the resume request arrives.

## Decision
Move the langgraph and API to a separate backend folder out of Next js path and deploy via Render free tier

## Consequences

Good:
- Render server is stateful, active runs map for cancel and checkpointer Memory Saver for HITL both work
- Free tier sufficient for personal use + early beta

Bad:
- Render free tier spins downs server after 15 mins of inactivity & restarts server for a new request after that
    -> mitigation: ping the server via via UptimeRobot pinger
- MemorySaver cleared on restart — HITL state lost
    -> mitigation: save in a Postgres via Supabase (see ADR 004)
- 512MB RAM limit rules out local Ollama on Render
    -> mitigation:: forces cloud LLM (ChatAnthropic or other) in production - one line change

## Alternatives considered
1. Vercel serverless + Redis for shared state
   → Rejected: adds Redis infrastructure cost and complexity
   → activeRuns would need pub/sub not just key/value
   
2. Vercel fluid compute (persistent functions)
   → Rejected: paid feature, adds cost
   
3. Fly.io or Railway instead of Render
   → viable — equivalent options
   → Render chosen for simpler free tier setup