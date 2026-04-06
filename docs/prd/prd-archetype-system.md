# PRD: Archetype System & Prompt Enrichment

**Status:** Draft  
**Author:** sbasnyat  
**Last updated:** 2026-04-06  
**Supersedes:** previous version dated 2026-04-05  
**Related PRD:** `prd-match-scenarios.md` — read first

---

## Problem

The verdict nodes currently use a generic prompt for every resume-to-job match. For users making a known career transition — where the gaps, strengths, and credibility signals are well-understood and consistent across candidates — generic prompts produce generic advice. They miss the transition-specific gaps that actually get candidates filtered out, and they fail to surface the hidden strengths that actually differentiate them.

The archetype system encodes research about specific career transitions so that verdict node prompts can be enriched with what actually matters for that transition, not just what the resume and job description say on their own.

---

## Goals

- Define a typed structure for encoding career transition archetypes in TypeScript
- Build a dedicated `detectArchetype` node that derives transition type with no LLM call and writes to graph state once
- Inject archetype context selectively into verdict node prompts based on the analysis task and user tier
- Fail gracefully — unknown transition or free tier falls back to generic behaviour with no error
- Ship one archetype (`backend_swe → ai_agent_dev`) as the reference implementation
- Gate archetype enrichment behind the paid tier

---

## Non-goals

- Fuzzy or LLM-assisted transition classification — exact match only
- Multiple archetypes in v1 — extensibility is designed for, only one ships
- Eval harness for classification accuracy — separate PRD
- Archetype enrichment changing routing logic — routing is always `deriveScenario(fitScore, atsScore)` regardless of tier or archetype

---

## How archetype enrichment works

Archetype is **prompt injection**, not routing. The four scenarios and which verdict node fires are determined entirely by `fitScore` and `atsScore`. Archetype context is additional material injected into the verdict node system prompt on paid tier when a known transition is detected.

The routing logic does not change between tiers. Only the prompt richness changes.

Which sections of the archetype are injected into which verdict nodes, and at what token budget, will be determined after eval harness results. The injection table will be specified here once we have evidence for what actually improves advice specificity.

---

## What an archetype encodes

An archetype represents a specific source-to-target role transition. It is built from manual research against real job postings and captures five things:

**Skill map** — the skills that actually matter for the target role, weighted by importance and grouped into three tiers: table stakes (must have), differentiators (separate good from great), and nice to have. Weights and notes are derived from real job posting language, not assumptions.

**Gap profile** — the gaps that reliably appear when someone from the source role attempts this transition, ordered by how often they cause failures. Each gap has a severity (critical, high, medium), a description of the failure mode, and a `howToClose` that is actionable rather than motivational.

**Hidden strengths** — where the source role background significantly outperforms other transition profiles. These are the things the candidate likely undersells because they don't know they're differentiating.

**Credibility signals** — what hiring managers and clients actually look for, ordered by priority. Distinct from skills — these are the signals that determine whether a candidate is taken seriously in interview or freelance contexts.

**Mental model shift** — the underlying change in how the candidate needs to think about building, not just what they need to learn. Gives advice depth beyond a skill checklist. Structured as `{ from: string; to: string; practicalImplication: string }`.

---

## detectArchetype node

Dedicated graph node. No LLM call. Pure dictionary lookup.

**Position in graph:** Runs after `parseResumeFit` and `parseJobFit` complete, before `scoreMatch`.

**Behaviour:**
- Reads `state.resumeData.sourceRole` and `state.jobData.targetRole`
- Calls `buildContext(sourceRole, targetRole)`
- Writes result to `state.archetypeContext` — either the full `ArchetypeContext` object or null
- Logs when both roles are known controlled vocabulary values but no archetype matched — unmatched transitions tracked for future research prioritisation
- Null is a valid, expected result — no error thrown, no degraded state

All downstream nodes read `state.archetypeContext` — none call `buildContext` themselves.

---

## Transition detection

`sourceRole` and `targetRole` are extracted by the fit parse nodes. Role inference requires semantic understanding of career trajectory — it belongs in the fit parse layer, not ATS parse.

The lookup key is `${sourceRole}__${targetRole}` (double underscore). Exact match only.

`buildContext(sourceRole, targetRole)` returns the full `ArchetypeContext` if found, null otherwise. Handles undefined and empty string inputs — returns null in both cases.

### Controlled vocabulary

Current known values: `"backend_swe"`, `"frontend_swe"`, `"fullstack_swe"`, `"ai_agent_dev"`, `"ml_engineer"`, `"data_scientist"`, `"devops_engineer"`, `"product_manager"`. If no value fits, LLM returns `"unknown"` — which never matches a registry key and degrades gracefully.

Both `parseResumeFit` and `parseJobFit` prompts must use the same vocabulary list. Adding a new archetype requires adding its values to the vocabulary if not already present.

---

## Fallback behaviour

**Archetype unknown:** `state.archetypeContext` is null. Verdict nodes run with generic prompts. No error thrown.

**Free tier with known archetype:** Archetype is detected but not injected. UI surfaces an upgrade prompt — "we recognise this transition" — but verdict nodes run with generic prompts. Same analysis behaviour as unknown transition, different UI message.

Both fallbacks are silent to the analysis pipeline. No degraded state, no error.

---

## Reference implementation — backend\_swe → ai\_agent\_dev

The first and only archetype in v1. Research source: real 2026 job postings from Cresta, Superblocks, New York Times, LaunchDarkly, Applied Intuition, and Loop. Research date: 2026-04-04.

**Why this archetype first:** It is the primary target user of the extension in beta. The gaps are well-understood, the hidden strengths are specific and undersold, and the credibility signals are concrete enough to be actionable.

**Key gaps encoded (critical severity):**
- Deterministic → probabilistic mental model shift
- No eval methodology
- No production agent shipping history

**Key hidden strengths encoded:**
- Production reliability instincts (retries, timeouts, idempotency) transfer directly to agent reliability
- Tool schema design is native — it is fundamentally API design
- Testing culture ports to eval culture with minimal adaptation

**Mental model shift encoded:**
- From: engineer as builder — output is clean, correct, predictable code; goal is to eliminate variance
- To: engineer as experimentalist — output is information about how the system behaves; goal is to harness variance productively

**Research ownership:** Manual, by the project author, from job posting analysis. New archetypes require the same research process. No automated or LLM-assisted research pipeline in v1.

---

## Adding a new archetype (process)

1. Research at least 5 real job postings for the target role
2. Derive skill map with weights from actual posting language
3. Document gaps from candidate failure patterns, not assumptions
4. Identify hidden strengths specific to the source role background
5. Write the mental model shift — from/to framing, practical implication
6. Add the archetype object to `archetypes.ts` following the existing structure
7. Register the key in the `ARCHETYPES` record as `${sourceRole}__${targetRole}`
8. Add new `sourceRole` and `targetRole` values to the controlled vocabulary if not already present — both `parseResumeFit` and `parseJobFit` prompts must be updated
9. Write eval cases for the new transition before using it in production

No archetype ships without eval cases.

---

## ArchetypeContext type

The object written to `state.archetypeContext` by `detectArchetype` and read by verdict nodes. The full object is written to state — filtering to relevant sections happens at injection time per node.

Fields:
- `archetypeId` — registry key
- `label` — human-readable transition label
- `skillMap` — all three tiers
- `gapProfile` — all severities
- `hiddenStrengths`
- `credibilitySignals`
- `mentalModelShift` — `{ from: string; to: string; practicalImplication: string }`

---

## Open questions

- Which archetype sections inject into which verdict nodes, at what token budget? To be determined after eval harness results.
- Should unmatched `sourceRole` / `targetRole` values be logged to Supabase for frequency analysis, or is a structured console log sufficient for now?
- Should the UI upgrade prompt name the specific archetype ("we recognise the backend SWE → AI agent dev transition") or keep it generic ("we recognise this transition")?

---

## Out of scope for this PRD

- Injection table per verdict node — specified after eval results
- Eval harness design for classification accuracy
- Archetype research for any transition other than `backend_swe → ai_agent_dev`
- Payment infrastructure and billing