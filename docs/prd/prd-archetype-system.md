# PRD: Archetype System & Selective Scoring Injection

**Status:** Draft  
**Author:** sbasnyat  
**Last updated:** 2026-04-05  
**Related ADR:** `docs/architecture.md`  
**Related PRD:** `prd-match-scenarios.md` (score branching, graph architecture, product tiers, and auth middleware — read first)

---

## Problem

The scoring chain currently uses a generic prompt for every resume-to-job match. For users making a known career transition — where the gaps, strengths, and credibility signals are well-understood and consistent across candidates — generic scoring produces generic advice. It misses the transition-specific gaps that actually get candidates filtered out, and it fails to surface the hidden strengths that actually differentiate them from non-SWE applicants.

The archetype system encodes research about specific career transitions into the scoring chain so that analysis is informed by what actually matters for that transition, not just what the resume and job description say on their own.

---

## Goals

- Define a typed structure for encoding career transition archetypes in TypeScript
- Build a dedicated `detectArchetype` node that derives transition type with no LLM call and writes to graph state once
- Inject archetype context selectively into graph nodes based on which analysis task is running and the user's tier
- Include `mentalModelShift` in `ArchetypeContext` for injection into gap analysis nodes
- Fail gracefully — if the transition is unknown or user is free tier, nodes fall back to generic behaviour with no error
- Ship one archetype (backend\_swe → ai\_agent\_dev) as the reference implementation
- Gate archetype-specific analysis behind the paid tier — see `prd-match-scenarios.md` product tiers section

---

## Non-goals

- Fuzzy or LLM-assisted transition classification (exact match only for now)
- Multiple archetypes in v1 — extensibility is designed for, but only one ships
- Eval harness for classification accuracy (separate PRD)
- Revealing archetype analysis content to free tier users — the UI surfaces that an archetype exists as an upgrade prompt, but does not show the analysis itself until the user is on the paid tier

---

## What an archetype encodes

An archetype represents a specific source-to-target role transition. It is built from manual research against real job postings and captures five things:

**Skill map** — the skills that actually matter for the target role, weighted by importance and grouped into three tiers: table stakes (must have), differentiators (separate good from great), and nice to have. Weights and notes are derived from real job posting language, not assumptions.

**Gap profile** — the gaps that reliably appear when someone from the source role attempts this transition, ordered by how often they cause failures. Each gap has a severity (critical, high, medium), a description of the failure mode, and a `howToClose` that is actionable rather than motivational.

**Hidden strengths** — where the source role background significantly outperforms other transition profiles. These are the things the candidate likely undersells because they don't know they're differentiating.

**Credibility signals** — what hiring managers and clients actually look for, ordered by priority. Distinct from skills — these are the signals that determine whether a candidate is taken seriously in interview or freelance contexts.

**Mental model shift** — the underlying change in how the candidate needs to think about building, not just what they need to learn. Gives gap analysis advice depth beyond a skill checklist.

---

## detectArchetype node

Archetype detection is a dedicated graph node — not computed inside `scoreMatch` or any other node.

**Position in graph:** Runs after `parseResumeFit` and `parseJobFit` complete, before `scoreMatch`. Sequential — `scoreMatch` needs `archetypeContext` in state to calibrate scoring.

**Behaviour:**
- Reads `state.resumeData.sourceRole` and `state.jobData.targetRole`
- Calls `buildContext(sourceRole, targetRole)`
- Writes result to `state.archetypeContext` — either the full `ArchetypeContext` object or null
- Logs when both roles are known controlled vocabulary values but no archetype matched — unmatched transitions tracked for future research prioritisation
- Null is a valid, expected result — no error thrown, no degraded state

**Why dedicated:** Archetype detection is pure and cheap — a dictionary lookup that takes milliseconds. Putting it in a dedicated node means the result is in state for every downstream node without recomputing. `scoreMatch`, `analyzeArchetypeGap`, and `analyzeRoadmap` all read `state.archetypeContext` — none of them call `buildContext` themselves.

---

## Transition detection

`sourceRole` and `targetRole` are extracted by the fit parse nodes — not the ATS parse nodes. ATS parsing is mechanical and literal; role inference requires semantic understanding of career trajectory, which belongs in the fit parse layer.

- `sourceRole` added to `ResumeSchema` output by `parseResumeFit`
- `targetRole` added to `JobSchema` output by `parseJobFit`

The LLM is instructed to use a controlled vocabulary of known values. The lookup key is `${sourceRole}__${targetRole}` (double underscore separator). Lookup is exact match only.

`deriveTransitionType(sourceRole, targetRole)` returns the registry key if found, null otherwise.

`buildContext(sourceRole, targetRole)` returns the full `ArchetypeContext` if found, null otherwise. Handles undefined and empty string inputs — returns null in both cases.

### Controlled vocabulary

The complete list of known `sourceRole` and `targetRole` values must be defined and shared between `parseResumeFit`, `parseJobFit`, and the archetype registry. Both parse prompts must use the same list. Adding a new archetype requires adding its `sourceRole` and `targetRole` values to the vocabulary if not already present.

Current known values: `"backend_swe"`, `"frontend_swe"`, `"fullstack_swe"`, `"ai_agent_dev"`, `"ml_engineer"`, `"data_scientist"`, `"devops_engineer"`, `"product_manager"`. If no value fits, LLM returns `"unknown"` — which never matches a registry key and degrades gracefully.

---

## Selective injection

The full archetype object is approximately 2,300 tokens. It is never injected wholesale. Each graph node receives only the sections relevant to its analysis task. Archetype injection only fires when `state.archetypeContext` is non-null AND `state.userTier` is `"paid"`.

| Graph node | Injected sections | Approximate tokens | Tier |
|---|---|---|---|
| `scoreMatch` | `skillMap` (tier 1 only) + `gapProfile` (critical + high severity only) | 400–500 | Paid |
| `analyzeArchetypeGap` | `hiddenStrengths` + `credibilitySignals` + `mentalModelShift` | 500–600 | Paid |
| `analyzeRoadmap` | `skillMap` (all tiers) + `gapProfile` (all severities) | 600–800 | Paid |
| `analyzeNarrativeGap` | none (generic prompt) | — | Base |
| `analyzeStrongMatch` | none (generic prompt) | — | Base |
| `analyzeSkepticalReconciliation` | none (generic prompt) | — | Base |

### scoreMatch receives skillMap and gapProfile — analyzeArchetypeGap does not

`scoreMatch` receives tier 1 `skillMap` + critical/high `gapProfile` because it is producing a score — it needs to know what skills gate hiring decisions and what gaps are most likely to cause failures. This is scoring calibration.

`analyzeArchetypeGap` receives `hiddenStrengths` + `credibilitySignals` + `mentalModelShift` because it is producing coaching advice — it needs to surface what the candidate already has that differentiates them, and how they need to think differently. This is coaching, not scoring. Injecting `skillMap` and `gapProfile` into `analyzeArchetypeGap` would duplicate scoring context into a coaching node, which is noise.

### Why analyzeArchetypeGap gets mentalModelShift

The mental model shift is the underlying change in how the candidate needs to think, not just what they need to learn. It is specific to Scenario 3 — structured guidance for a known transition. It is excluded from `scoreMatch` because it is coaching content, not scoring criteria.

### Why analyzeRoadmap gets all tiers and severities

A roadmap needs the full picture. Tier 2 and tier 3 skills are the differentiators and nice-to-haves that matter for the timeline. Medium severity gaps surface in interviews even if they don't cause immediate filtering. `scoreMatch` only needs the critical signal; `analyzeRoadmap` needs the complete transition map.

Archetype context is injected into the system prompt, not the human turn. It is scoring rubric and coaching information — not candidate information.

---

## Fallback behaviour

**Archetype unknown:** `buildContext` returns null — `sourceRole` or `targetRole` is unknown, missing, or combination has no registered archetype. `state.archetypeContext` is null. Conditional edge does not route to `analyzeArchetypeGap`. Falls through to `analyzeNarrativeGap`. `analyzeRoadmap` produces generic output. No error thrown.

**Free tier with known archetype:** `buildContext` returns non-null but `state.userTier` is `"base"`. Archetype is detected but not injected. UI surfaces upgrade prompt — "we recognise this transition" — but analysis nodes run without archetype context. Same analysis behaviour as unknown transition, different UI message.

In both cases the fallback is silent to the analysis pipeline. No degraded state, no error.

---

## Reference implementation — backend\_swe → ai\_agent\_dev

The first and only archetype in v1. Research source: real 2026 job postings from Cresta, Superblocks, New York Times, LaunchDarkly, Applied Intuition, and Loop. Research date: 2026-04-04.

**Why this archetype first:** It is the primary target user of the extension in beta. The gaps are well-understood, the hidden strengths are specific and undersold, and the credibility signals are concrete enough to be actionable in both full-time and freelance contexts.

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

**Research ownership:** Manual, by the project author, from job posting analysis. New archetypes require the same research process before being added to the registry. No automated or LLM-assisted research pipeline in v1.

---

## Adding a new archetype (process)

1. Research at least 5 real job postings for the target role
2. Derive skill map with weights from actual posting language
3. Document gaps from candidate failure patterns, not assumptions
4. Identify hidden strengths specific to the source role background
5. Write the mental model shift — from/to framing, practical implication
6. Add the archetype object to `archetypes.ts` following the existing structure
7. Register the key in the `ARCHETYPES` record as `${sourceRole}__${targetRole}`
8. Add the new `sourceRole` and `targetRole` values to the controlled vocabulary if not already present — both `parseResumeFit` and `parseJobFit` prompts must be updated
9. Write eval cases for the new transition before using it in production

No archetype ships without eval cases. See eval harness PRD (to follow).

---

## Schema fields affected

### `ResumeSchema` (modified)
Adds `sourceRole: string` — extracted by `parseResumeFit` using controlled vocabulary. Not extracted by `parseResumeATS` — role inference is semantic, not mechanical.

### `JobSchema` (modified)
Adds `targetRole: string` — extracted by `parseJobFit` using controlled vocabulary. Not extracted by `parseJobATS`.

### `ArchetypeContext` (new)
The object written to `state.archetypeContext` by `detectArchetype` and read by downstream nodes. Contains the full archetype data — filtering to relevant sections happens at injection time per node, not at build time.

Fields:
- `archetypeId` — registry key
- `label` — human-readable transition label
- `skillMap` — all three tiers (tier 1 injected into `scoreMatch`, all tiers injected into `analyzeRoadmap`)
- `gapProfile` — all severities (critical + high injected into `scoreMatch`, all injected into `analyzeRoadmap`)
- `hiddenStrengths` — injected into `analyzeArchetypeGap`
- `credibilitySignals` — injected into `analyzeArchetypeGap`
- `mentalModelShift` — structured object `{ from: string; to: string; practicalImplication: string }`, injected into `analyzeArchetypeGap`

### `detectArchetype` node (new)
Dedicated node. No model argument. Reads fit parse outputs, calls `buildContext`, writes `archetypeContext` to state. See detectArchetype node section above.

### `scoreMatch` node (modified)
Reads `state.archetypeContext` and `state.userTier`. When both conditions met (non-null + paid), passes tier 1 `skillMap` + critical/high `gapProfile` to `buildScoringChain`. Does not call `buildContext` — reads from state only.

### `analyzeArchetypeGap` node (new)
Reads `state.archetypeContext` and `state.userTier`. Calls `buildGapAnalysisChain` with `hiddenStrengths` + `credibilitySignals` + `mentalModelShift` injected. Only reached when `archetypeContext` is non-null, `userTier` is `"paid"`, and `fitScore` is 50–70.

### `analyzeRoadmap` node (new)
Reads `state.archetypeContext` and `state.userTier`. Calls `buildGapAnalysisChain` with full `skillMap` + full `gapProfile` when archetype is known and user is paid tier. Generic prompt when archetype is null or free tier.

### `buildScoringChain` (modified)
Accepts optional `archetypeContext?: ArchetypeContext` and `userTier: "base" | "paid"`. When both present and tier is paid, appends tier 1 skill map and critical/high gap profile to system prompt. When absent or free tier, behaviour is identical to current.

### `buildGapAnalysisChain` (modified)
Accepts optional `archetypeContext?: ArchetypeContext`, `promptVariant: AnalysisVariant`, and `userTier: "base" | "paid"`. Injection behaviour varies by variant and tier as described in the selective injection table.

---

## Resolved decisions

**detectArchetype as dedicated node:** Pure dictionary lookup, no LLM call, runs once per graph execution, writes to state. All downstream nodes read `state.archetypeContext` — none recompute it.

**analyzeArchetypeGap injection scope:** Coaching material only — `hiddenStrengths`, `credibilitySignals`, `mentalModelShift`. Does not receive `skillMap` or `gapProfile`. Scoring and coaching are separate concerns in separate nodes. `scoreMatch` owns scoring calibration; `analyzeArchetypeGap` owns transition-specific coaching.

**Intent takes priority over archetype in routing:** `exploring_gap` intent is checked first in `routeAfterScore`. A paid tier `exploring_gap` user with a known archetype routes to `analyzeRoadmap`, not `analyzeArchetypeGap`. Archetype enriches the roadmap output but does not change the routing destination.

**userTier source:** Auth middleware, Supabase lookup via `@supabase/supabase-js` admin SDK, attached to `req.user`. Passed into initial graph state as `userTier`. Never from request body. `/api/match/resume` reads `userTier` from checkpointed state, not a fresh lookup — tier active when run started is preserved across HITL exchange.

**sourceRole/targetRole as free text with controlled vocabulary:** No TypeScript enum — that would require a code change for every new archetype. LLM instructed to use known values. Mismatches return null from `buildContext` and degrade gracefully. Unmatched transitions logged for future research prioritisation.

**mentalModelShift type:** Structured object `{ from: string; to: string; practicalImplication: string }` — more injectable into a prompt than a text blob, more maintainable when adding new archetypes.

**ArchetypeContext filtering at injection time:** `buildContext` returns the full projection. Each node filters to what it needs at injection time. Filtering logic colocated with injection logic.

**Registry as static TypeScript file:** Stays static in v1. Moving to database is a v2 concern.

---

## Open questions

- Should unmatched `sourceRole` / `targetRole` values be logged to Supabase for frequency analysis, or is a structured console log sufficient for now?
- Should the UI upgrade prompt name the specific archetype ("we recognise the backend SWE → AI agent dev transition") or keep it generic ("we recognise this transition")? Naming it is more compelling but reveals which archetypes exist in the paid tier.

---

## Out of scope for this PRD

- Fuzzy matching or LLM-assisted transition classification
- Archetype research for any transition other than backend\_swe → ai\_agent\_dev
- Eval harness design for classification accuracy (separate PRD)
- Multi-model routing based on archetype match (designed in `prd-match-scenarios.md`, implemented with eval harness)
- Payment infrastructure and billing