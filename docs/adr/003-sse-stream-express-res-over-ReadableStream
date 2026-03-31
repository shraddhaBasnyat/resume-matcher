# ADR 003: Rewrite stream.ts for Express res instead of ReadableStream

## Date
2026-03-31

## Status
Accepted

## Context
The previous implementation of SSE with NextJS uses the Web Streams API (Readable stream + controller). Since deployment decision moved to stateful Render for backend and consequesntly backend moved to lighweight Express over NextJS, the SSE implementation changes since Express uses Node.js Response and it is a stream in itself.

## Decision
SSE stream factory function accepts a Express Response object and writes straight to it instead of ReadableStream controller.

## Consequences

Good:
- Simpler implementation — res is directly available, no controller capture
- res.flushHeaders() gives explicit control over when stream opens
- req.on("close") cleanly handles client disconnect → abort graph
- NodeProgressEmitter and runMatchGraph unchanged — interface is stable

Bad:
- createSSEStream() now coupled to Express Response type
    -> previously was also coupled to NextJS the Web Streams API, decoupled approach discussed in Alternatives section
- If plan to revert to using NextJS/Vercel: Can't run API routes without rewriting stream.ts again

## Alternatives considered
1. Streaming library (e.g. eventsource-parser)
   → Rejected: adds a dependency to solve a portability problem we don't currently have — over-engineering for our deployment target

## Links
- Driven by: ADR 002