# PRD: Archetype System & Selective Scoring Injection

**Status:** Draft  
**Author:** sbasnyat  
**Last updated:** 2026-04-05  
**Related ADR:** `docs/architecture.md`  
**Related PRD:** `prd-match-scenarios.md` (score branching and contextPrompt — read first)

---

## Problem

The scoring chain currently uses a generic prompt for every resume-to-job match. For users making a known career transition — where the gaps, strengths, and credibility signals are well-understood and consistent across candidates — generic scoring produces generic advice. It misses the transition-specific gaps that actually get candidates filtered out, and it fails to surface the hidden strengths that actually differentiate them from non-SWE applicants.

The archetype system encodes research about specific career transitions into the scoring chain so that analysis is informed by what actually matters for that transition, not just what the resume and job description say on their own.

---

## Goals

- Define a typed structure for encoding career transition archetypes in TypeScript
- Build a lookup system that derives the transition type from resume and job data with no LLM call
- Inject archetype context selectively into the scoring chain based on which analysis task is running
- Fail gracefully — if the transition is unknown, the chain falls back to generic behaviour with no error
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

**Hidden strengths** — where the source role background significantly outperforms other transition profiles. These are the things the candidate likely undersells because they don't know they're differentiating. The scoring chain uses these to surface underrepresented value.

**Credibility signals** — what hiring managers and clients actually look for, ordered by priority. Distinct from skills — these are the signals that determine whether a candidate is taken seriously in interview or freelance contexts.

**Mental model shift** — the underlying change in how the candidate needs to think about building, not just what they need to learn. Injected into gap analysis prompts to give advice depth beyond a skill checklist.

---

## Transition detection

Transition type is derived from two fields added to existing parse node outputs:

- `sourceRole` added to `ResumeSchema` output by `parseResume`
- `targetRole` added to `JobSchema` output by `parseJob`

These are extracted by the existing parse nodes as part of normal parsing — no additional LLM call. The lookup key is `${sourceRole}__${targetRole}` (double underscore separator). Lookup is exact match only against the `ARCHETYPES` registry.

`deriveTransitionType(sourceRole, targetRole)` returns the registry key if found, null otherwise.

`buildContext(sourceRole, targetRole)` returns the full `ArchetypeContext` object if found, null otherwise. Handles undefined and empty string inputs — returns null in both cases.

Null return at any point means the chain falls back to generic prompt behaviour. The archetype system is an enhancement layer, not a dependency.

---

## Selective injection

The full archetype object is approximately 2,300 tokens. It is never injected wholesale. Each analysis task receives only the sections relevant to it.

| Analysis task | Injected sections | Approximate tokens |
|---|---|---|
| `scoreMatch` | `skillMap` (tier 1 only) + `gapProfile` (critical + high severity only) | 400–500 |
| `gapAnalysis` | `hiddenStrengths` + `credibilitySignals` | 400–500 |

Tier 2 and tier 3 skills are not injected into `scoreMatch`. They are available in the archetype object for future use but keeping tier 1 only reduces token cost and focuses the model on what actually gates hiring decisions.

The `mentalModelShift` section is reserved for `gapAnalysis` prompt enrichment. It is not injected into `scoreMatch`.

Archetype context is injected into the system prompt, not the human turn. It is scoring rubric information — instructions to the model about how to evaluate this transition — not candidate information.

---

## Fallback behaviour

If `buildContext` returns null — because `sourceRole` or `targetRole` is unknown, missing, or the combination has no registered archetype — `buildScoringChain` and `buildGapAnalysisChain` run with their existing generic prompts unchanged. No error is thrown, no degraded state is surfaced to the user.

This means the archetype system can be added to the chain with zero risk to existing behaviour for unrecognised transitions.

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

**Research ownership:** Manual, by the project author, from job posting analysis. New archetypes require the same research process — real postings, weighted skills, failure mode documentation — before they are added to the registry. There is no automated or LLM-assisted research pipeline in v1.

---

## Adding a new archetype (process)

When a new transition is ready to encode:

1. Research at least 5 real job postings for the target role
2. Derive skill map with weights from actual posting language
3. Document gaps from candidate failure patterns, not assumptions
4. Identify hidden strengths specific to the source role background
5. Add the archetype object to `archetypes.ts` following the existing structure
6. Register the key in the `ARCHETYPES` record as `${sourceRole}__${targetRole}`
7. Add `sourceRole` and `targetRole` values to the parse node extraction logic if not already present
8. Write eval cases for the new transition before using it in production

No archetype ships without eval cases. See eval harness PRD (to follow).

---

## Schema fields affected

### `ResumeSchema` (modified)
Adds `sourceRole: string` — the candidate's current or most recent role category, extracted by `parseResume`.

### `JobSchema` (modified)
Adds `targetRole: string` — the role category being hired for, extracted by `parseJob`.

### `ArchetypeContext` (new)
The selectively-injected object passed into scoring chain functions. Contains `archetypeId`, `label`, `skillMap`, `gapProfile`, `hiddenStrengths`, and `credibilitySignals`. Does not contain the full archetype — only the fields needed for injection.

### `buildScoringChain` (modified)
Accepts optional `archetypeContext?: ArchetypeContext` parameter. When present, appends skill map and gap profile to system prompt. When absent, behaviour is identical to current.

### `buildGapAnalysisChain` (modified)
Accepts optional `archetypeContext?: ArchetypeContext` parameter. When present, appends hidden strengths and credibility signals to system prompt. When absent, behaviour is identical to current.

---

## Open questions

- Should `sourceRole` and `targetRole` be extracted as controlled vocabulary (enum of known values) or free text? Controlled vocabulary makes lookup reliable but requires the parse node to map to a fixed set. Free text is more flexible but makes exact-match lookup fragile.
- If `sourceRole` is extracted as free text and doesn't match any known key, should the chain log the unmatched value somewhere so new archetypes can be prioritised by frequency?
- At what point does the archetype registry move from a static TypeScript file to a database table — is that a v2 concern or does it need to be designed for now?

---

## Out of scope for this PRD

- Fuzzy matching or LLM-assisted transition classification
- UI indication that an archetype was matched
- Archetype research for any transition other than backend\_swe → ai\_agent\_dev
- Eval harness design for classification accuracy (separate PRD)
- Multi-model routing based on archetype match (designed in `prd-match-scenarios.md`, implemented with eval harness)