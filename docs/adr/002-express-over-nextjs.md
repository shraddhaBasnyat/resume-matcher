# ADR 002: HTTP server — Next.js built-in → Express

## Date
2026-03-31

## Status
Accepted

## Context
ADR 001 moves the backend to an independent Node.js process on Render.
Next.js is no longer the runtime — we need a standalone HTTP server.

## Decision
Use Express as the HTTP server.

## Consequences
Good:
- Lightweight — no React rendering overhead
- Full control over routing, middleware, CORS
- Standard choice for Node.js APIs

Bad:
- Manual routing setup vs file-based (more code, more explicit)
- Next.js route handler syntax replaced with Express req/res

## Links
- Driven by: ADR 001
- Drives: ADR 003 (SSE implementation change)