# PRD: Archetype System & Selective Scoring Injection

**Status:** Draft  
**Author:** sbasnyat  
**Last updated:** 2026-04-05  
**Related ADR:** `docs/architecture.md`  
**Related PRD:** `prd-match-scenarios.md` (score branching and graph architecture — read first)

---

## Problem

The scoring chain currently uses a generic prompt for every resume-to-job match. For users making a known career transition — where the gaps, strengths, and credibility signals are well-understood and consistent across candidates — generic scoring produces generic advice. It misses the transition-specific gaps that actually get candidates filtered out, and it fails to surface the hidden strengths that actually differentiate them from non-SWE applicants.

The archetype system encodes research about specific career transitions into the scoring chain so that analysis is informed by what actually matters for that transition, not just what the resume and job description say on their own.

---

## Goals

- Define a typed structure for encoding career transition archetypes in TypeScript
- Build a lookup system that derives the transition type from resume and job data with no LLM call
- Inject archetype context selectively into the graph nodes based on which analysis task is running
- Include `mentalModelShift` in `ArchetypeContext` for injection into gap analysis nodes
- Fail gracefully — if the transition is unknown, nodes fall back to generic behaviour with no error
- Ship one archetype (backend\_swe → ai\_agent\_dev) as the reference implementation

---

## Non-goals

- Fuzzy or LLM-assisted transition classification (exact match only for now)
- Multiple archetypes in v1 — extensibility is designed for, but only one ships
- Eval harness for classification accuracy (separate PRD)
- UI surface for archetype recognition — the extension does not tell the user which archetype was matched

---

## What an archetype encodes

An archetype represents a specific source-to-target role transition. It is built from manual research against real job postings and captures five things:

**Skill map** — the skills that actually matter for the target role, weighted by importance and grouped into three tiers: table stakes (must have), differentiators (separate good from great), and nice to have. Weights and notes are derived from real job posting language, not assumptions.

**Gap profile** — the gaps that reliably appear when someone from the source role attempts this transition, ordered by how often they cause failures. Each gap has a severity (critical, high, medium), a description of the failure mode, and a `howToClose` that is actionable rather than motivational.

**Hidden strengths** — where the source role background significantly outperforms other transition profiles. These are the things the candidate likely undersells because they don't know they're differentiating.

**Credibility signals** — what hiring managers and clients actually look for, ordered by priority. Distinct from skills — these are the signals that determine whether a candidate is taken seriously in interview or freelance contexts.

**Mental model shift** — the underlying change in how the candidate needs to think about building, not just what they need to learn. Gives gap analysis advice depth beyond a skill checklist. Included in `ArchetypeContext` and injected into gap analysis nodes.

---

## Transition detection

Transition type is derived from two fields added to existing parse node outputs:

- `sourceRole` added to `ResumeSchema` output by `parseResume`
- `targetRole` added to `JobSchema` output by `parseJob`

Extracted by the existing parse nodes as part of normal parsing — no additional LLM call. The LLM is instructed to use a controlled vocabulary of known values (e.g. "backend\_swe", "frontend\_swe", "ai\_agent\_dev"). The lookup key is `${sourceRole}__${targetRole}` (double underscore separator). Lookup is exact match only.

`deriveTransitionType(sourceRole, targetRole)` returns the registry key if found, null otherwise.

`buildContext(sourceRole, targetRole)` returns the full `ArchetypeContext` if found, null otherwise. Handles undefined and empty string inputs — returns null in both cases.

Null return means nodes fall back to generic prompt behaviour. The archetype system is an enhancement layer, not a dependency.

---

## Selective injection

The full archetype object is approximately 2,300 tokens. It is never injected wholesale. Each graph node receives only the sections relevant to its analysis task.

| Graph node | Injected sections | Approximate tokens |
|---|---|---|
| `scoreMatch` | `skillMap` (tier 1 only) + `gapProfile` (critical + high severity only) | 400–500 |
| `analyzeArchetypeGap` | `hiddenStrengths` + `credibilitySignals` + `mentalModelShift` | 500–600 |
| `analyzeNarrativeGap` | none (generic prompt) | — |
| `analyzeStrongMatch` | none (generic prompt) | — |
| `analyzeSkepticalReconciliation` | none (generic prompt) | — |

Tier 2 and tier 3 skills are not injected into `scoreMatch`. They are available in the archetype object for future use but keeping tier 1 only reduces token cost and focuses the model on what actually gates hiring decisions.

Archetype context is injected into the system prompt, not the human turn. It is scoring rubric information — instructions to the model about how to evaluate this transition — not candidate information.

### Why `analyzeArchetypeGap` gets `mentalModelShift`

The mental model shift is the underlying change in how the candidate needs to think, not just what they need to learn. It is specific to Scenario 3 — a candidate who fits a known transition archetype and needs structured guidance. Injecting it into other analysis nodes would be noise. It is excluded from `scoreMatch` because it is coaching content, not scoring criteria.

---

## Fallback behaviour

If `buildContext` returns null — because `sourceRole` or `targetRole` is unknown, missing, or the combination has no registered archetype — the conditional edge in `scoring-graph.ts` does not route to `analyzeArchetypeGap`. It falls through to `analyzeNarrativeGap` instead. No error is thrown, no degraded state is surfaced to the user.

This means the archetype system can be added to the graph with zero risk to existing behaviour for unrecognised transitions.

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

**Research ownership:** Manual, by the project author, from job posting analysis. New archetypes require the same research process — real postings, weighted skills, failure mode documentation — before they are added to the registry. There is no automated or LLM-assisted research pipeline in v1.

---

## Adding a new archetype (process)

When a new transition is ready to encode:

1. Research at least 5 real job postings for the target role
2. Derive skill map with weights from actual posting language
3. Document gaps from candidate failure patterns, not assumptions
4. Identify hidden strengths specific to the source role background
5. Write the mental model shift — from/to framing, practical implication
6. Add the archetype object to `archetypes.ts` following the existing structure
7. Register the key in the `ARCHETYPES` record as `${sourceRole}__${targetRole}`
8. Add the new `sourceRole` and `targetRole` values to the parse prompt controlled vocabulary
9. Write eval cases for the new transition before using it in production

No archetype ships without eval cases. See eval harness PRD (to follow).

---

## Schema fields affected

### `ResumeSchema` (modified)
Adds `sourceRole: string` — the candidate's current or most recent role category, extracted by `parseResume` using controlled vocabulary.

### `JobSchema` (modified)
Adds `targetRole: string` — the role category being hired for, extracted by `parseJob` using controlled vocabulary.

### `ArchetypeContext` (new)
The selectively-injected object passed into graph nodes. Contains:
- `archetypeId` — registry key
- `label` — human-readable transition label
- `skillMap` — tier 1 only (filtered at build time)
- `gapProfile` — critical and high severity only (filtered at build time)
- `hiddenStrengths`
- `credibilitySignals`
- `mentalModelShift` — from/to framing + practical implication

The full archetype object (all tiers, all severities) lives in the registry. `ArchetypeContext` is the filtered projection used for injection.

### `scoreMatch` node (modified)
Computes `buildContext(state.resumeData.sourceRole, state.jobData.targetRole)` and passes `skillMap` + `gapProfile` sections to `buildScoringChain` when non-null.

### `analyzeArchetypeGap` node (new)
Calls `buildGapAnalysisChain` with `hiddenStrengths` + `credibilitySignals` + `mentalModelShift` injected. Only reached when `buildContext` returns non-null and score is 50–70.

### `buildScoringChain` (modified)
Accepts optional `archetypeContext?: ArchetypeContext`. When present, appends tier 1 skill map and critical/high gap profile to system prompt. When absent, behaviour is identical to current.

### `buildGapAnalysisChain` (modified)
Accepts optional `archetypeContext?: ArchetypeContext` and optional `promptVariant` indicating which analysis node is calling it. When archetype context is present and variant is `analyzeArchetypeGap`, appends hidden strengths, credibility signals, and mental model shift. When absent, behaviour is identical to current.

---

## Resolved decisions

**sourceRole/targetRole as free text vs enum:** Free text extracted by parse nodes, with the LLM instructed to use a controlled vocabulary. No TypeScript enum — that would require a code change for every new archetype. Mismatches return null from `buildContext` and degrade gracefully. If `sourceRole` or `targetRole` doesn't match any known registry key, the value should be logged (not thrown) so unmatched transitions can be prioritised for future archetype research.

**mentalModelShift in ArchetypeContext:** Included. It is specific enough to be useful in `analyzeArchetypeGap` and already encoded in the research JSON. Excluding it would mean adding it back when the eval harness reveals the gap analysis is shallow for archetype transitions.

**Registry as static TypeScript file:** Stays a static file in v1. Moving to a database table is a v2 concern — it only becomes necessary when archetypes need to be added without a code deploy, or when the registry grows large enough that a file is unwieldy. Neither applies in v1.

---

## Open questions

- Should unmatched `sourceRole` / `targetRole` values be logged to Supabase for frequency analysis, or is a structured console log sufficient for now?

---

## Out of scope for this PRD

- Fuzzy matching or LLM-assisted transition classification
- UI indication that an archetype was matched
- Archetype research for any transition other than backend\_swe → ai\_agent\_dev
- Eval harness design for classification accuracy (separate PRD)
- Multi-model routing based on archetype match (designed in `prd-match-scenarios.md`, implemented with eval harness)