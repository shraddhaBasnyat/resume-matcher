# ADR 004: Graph architecture redesign — analyzeJD / analyzeResume as primary inference layer

## Date
2026-06-02

## Status
Implemented — Phase 1 (analyzeJD + analyzeResume upstream nodes) and Phase 2 (deterministic atsGapAnalysis, archetype-enriched verdict nodes) complete

## Context
The current graph (`ARCHITECTURE.md`) runs `atsAnalysis` and `analyzeFit` in parallel against raw resume and JD text. Both nodes independently infer signal from the same documents — `atsAnalysis` infers knockout gates and recruiter search terms from the JD, `analyzeFit` infers career trajectory and vocabulary gaps from both texts. This means every node is doing its own JD and resume reading, producing redundant and often generic output because no node has a deep structured read of either document to work from.

Three specific failure modes drove this decision:

1. The ATS path asks an LLM to detect formatting problems from already-extracted text — the structural information is destroyed before it arrives. It also infers knockout questions that a recruiter configured internally — information that cannot be reliably derived from the public JD text.

2. `analyzeFit` conflates comparison (does this candidate match this role) with inference (what kind of role is this, what kind of worker is this candidate). Doing both in one pass produces fit scores that are not grounded in a structured read of either document.

3. Terminology diffs are generated without legitimacy assessment — vocabulary washing is surfaced as actionable advice when the underlying analogy doesn't hold.

A design session (2026-06-02) produced a target architecture that addresses all three. The session also produced updated and new PRDs that specify the target design.

## Decision
Redesign the graph around two upstream inference nodes that each read one document deeply and produce structured output everything downstream consumes:

**`analyzeResume`** (inside a cacheable resume subgraph with `parseResume`) reads the resume only and produces: `candidateArchetype`, `demonstratedVsClaimed` per bullet, `scopeAmbiguity` per bullet, `careerArcNote` transitions, `resumeAha`.

**`analyzeJD`** reads the JD only and produces: `jdArchetype` (with `ideal` and `couldWork[]`), `realAsk`, `recruiterFilter`.

Everything downstream reads from these structured outputs — not from raw text:

- `atsGapAnalysis` becomes fully deterministic — string matching `recruiterFilter` against resume terms, gap severity computed from `demonstratedVsClaimed`, score arithmetic. No LLM call.
- `analyzeFit` becomes a cold semantic comparison of the two structured reads. No career narrative. No trajectory language.
- Verdict nodes own all narrative, advice generation, terminology diffs, and interview prep. Terminology diffs are only produced where legitimacy is confirmed — illegitimate translations are dropped silently.
- Archetype config (`scanPattern`, `interviewProbePattern`) is a typed runtime lookup inlined into verdict node functions — not an LLM output and not a graph node.
- `knockoutQuestions` removed entirely — not reliably inferable from public JD text.

The target design is specified across three PRDs:
- `prd-graph-architecture.md` — node responsibilities, topology, deterministic vs LLM breakdown, field ownership
- `prd-what-good-looks-like.md` — output quality standard, four dimensions, specificity test, banned phrases
- `prd-archetype-system.md` — archetype taxonomy, `ideal`/`couldWork` classification, `careerArcNote` structure, config runtime pattern

## Consequences

Good:
- ATS path is fully deterministic and cold — computes facts, never speculates. Matches how real ATS systems actually work (NER + Boolean search, not semantic matching)
- `analyzeFit` has structured inputs in addition to raw text — comparison quality improves because the primary inference work is already done upstream
- Resume subgraph output is cacheable by `hash(resumeFile)` — same resume against multiple JDs skips the subgraph entirely
- Terminology diffs only surface where legitimate — vocabulary washing is no longer an output of the system
- `jdArchetype.couldWork[]` models market reality — hybrid roles (e.g. `specialist_depth` ideal / `scale_operator` couldWork) produce honest narrative gap routing instead of false honest verdict
- `demonstratedVsClaimed` and `scopeAmbiguity` are resume-only reads produced once and consumed by both the ATS path and fit path — no redundant inference
- `evidence_gap` as a fifth battle card verdict distinguishes "claimed without proof" from "genuinely absent" — different advice, different fix

Bad:
- Two new LLM nodes (`analyzeJD`, `analyzeResume`) added to the critical path before `analyzeFit` — latency increases unless parallelism is maximised
- Resume subgraph caching adds operational complexity — cache invalidation when resume is updated, TTL strategy TBD
- `atsAha` moves from `atsGapAnalysis` (now deterministic) to `analyzeResume` (LLM) — the ATS observation is now a resume-only read, which means it doesn't reflect JD-specific gap findings

## Alternatives considered
1. Enrich existing `atsAnalysis` and `analyzeFit` prompts without restructuring the graph
   → Rejected: the root problem is structural — nodes doing inference from raw text when structured reads are available. Better prompts on the wrong architecture produces marginal improvement at best.

2. Single `analyzeDocument` node that reads both JD and resume together before comparison
   → Rejected: collapses the clean separation between JD-only signal and resume-only signal. Resume subgraph caching requires the resume read to be independent of the JD.

3. Keep `knockoutQuestions` with a tighter prompt constraining inference
   → Rejected: the signal is not reliably derivable from public JD text regardless of prompt quality. Surfacing plausible-sounding gates as analysis is worse than omitting them.

## Links
- Target design session: 2026-06-02
- PRDs: `prd-graph-architecture.md`, `prd-what-good-looks-like.md`, `prd-archetype-system.md`
- Current production system: `ARCHITECTURE.md`
- Implementation gate: Promptfoo eval suite must pass before new graph ships