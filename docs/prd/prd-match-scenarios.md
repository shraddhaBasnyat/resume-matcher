# PRD: Match Scenarios, Score Branching & Contextual Prompting

**Status:** Draft  
**Author:** sbasnyat  
**Last updated:** 2026-04-05  
**Related ADR:** `docs/architecture.md`  
**Related PRD:** `prd-archetype-system.md` (archetype wiring — read alongside)

---

## Problem

The current scoring chain has one mode: score the resume against the job and produce advice. This produces poor results across the range of real user situations for two reasons.

First, it conflates two independent questions: can a machine read this resume, and does this candidate actually match this role. These require different parsing strategies and different analysis modes. Mixing them produces scores that are neither accurate ATS simulations nor accurate fit assessments.

Second, it treats all users as having the same intent. A user who thinks they are a strong match needs honest confirmation or correction. A user who already knows they are far off needs a roadmap, not a rejection. The same score means different things to different users and should produce different output.

---

## Goals

- Separate ATS analysis from fit analysis — two independent scoring dimensions
- Collect structured user intent before the first run so routing is informed from the start
- Match the LLM's analysis mode to the actual situation the user is in
- Give users a clear, honest signal across all scenarios
- Introduce `contextPrompt` as a new output field that tells the user specifically what information would change their score
- Derive `weakMatch` deterministically rather than asking the LLM to compute it
- Route to scenario-specific analysis nodes in the graph — not a single prompt trying to self-route
- Short-circuit expensive analysis when ATS reveals the resume is unreadable or critical fields are missing
- Gate archetype-specific analysis behind a paid tier — base product is two-dimensional scoring and generic scenario analysis

---

## Non-goals

- Archetype wiring and skill graph injection (covered in `prd-archetype-system.md`)
- Eval harness design (separate PRD, to follow)
- Multi-model routing by score branch (designed here, implemented with eval harness)
- Payment infrastructure and billing (Stripe integration, subscription management)

---

## Product tiers

The product ships in two tiers. The tier boundary is archetype detection — everything else is available to all users.

### Base tier (free / all users)
- Two-dimensional scoring — ATS score and fit score independently
- Intent-based routing — `confident_match` and `exploring_gap` flows
- All scenario nodes except `analyzeArchetypeGap`
- `analyzeRoadmap` with generic output (not archetype-powered)
- `contextPrompt`, `weakMatchReason`, `atsProfile` keyword gaps
- HITL for `confident_match` low-score runs

### Paid tier (archetype analysis)
- Everything in base tier
- Archetype detection — `buildContext` fires, transition is recognised
- `analyzeArchetypeGap` node — transition-specific gap analysis, named gaps from research, hidden strengths, credibility signals
- `analyzeRoadmap` powered by archetype data — specific milestones, timeline estimates, portfolio projects from archetype research rather than generic advice

### Tier gate implementation
`userTier` is derived server-side from the auth middleware — the client never sends it. The gate is: if `state.archetypeContext` is non-null AND `state.userTier` is `"paid"`, inject archetype context and route to `analyzeArchetypeGap`. If free tier, skip injection and route to `analyzeNarrativeGap` as fallback. One conditional, no separate code paths.

The upgrade moment is natural — a user gets a mid-range score and generic narrative advice, and the UI indicates that a known transition archetype exists for their profile. The specific gap analysis is behind the tier gate.

---

## Request body — new shape

The `/api/match/run` request body. `humanContext` is absent on first run — it only ever appears on HITL resume. Structured intent fields replace it.

```typescript
{
  resumeText: string
  jobText: string
  intent: "confident_match" | "exploring_gap"
  intentContext: ConfidentMatchContext | ExploringGapContext
  // humanContext is NOT in the first run request body
  // it only appears in /api/match/resume (HITL)
}

interface ConfidentMatchContext {
  basis: Array<
    | "direct_experience"   // I've done this job or something very close
    | "adjacent_role"       // coming from a related field
    | "side_projects"       // I've shipped relevant work independently
    | "self_taught"         // I've studied and built toward this deliberately
    | "career_pivot"        // I know it's a stretch, I have transferable skills
  >  // min 1 selection, multi-select
}

interface ExploringGapContext {
  timeline:
    | "applying_now"          // submitting applications now
    | "three_to_six_months"   // planning to apply soon
    | "one_year_plus"         // building toward this long term

  currentStatus: Array<
    | "side_projects"         // I've shipped relevant work
    | "self_taught"           // actively studying toward this
    | "transferable_skills"   // relevant skills from current role
    | "starting_from_scratch" // at the beginning
    | "already_retraining"    // in a course, bootcamp, or similar
  >  // min 1 selection, multi-select
}
```

`/api/match/resume` (HITL) accepts `{ threadId: string, humanContext: string }`. `humanContext` must be non-empty — validated by Zod `z.string().min(1)` at the route handler before the graph resumes. This is the only point in the flow where free text is accepted.

### Why structured selections, not free text upfront

Structured selections are unambiguous — the graph routes on them deterministically before any LLM call. Free text upfront is noise — users don't know what's relevant until they've seen the analysis. Reserving free text for HITL means it arrives as high-signal reactive context, not speculative pre-context.

### Why intent changes the analysis

`confident_match` users expect a high score. A low score is a surprise that needs explaining. The tool's job is honest confirmation or correction.

`exploring_gap` users have already accepted the gap. A low score is expected. The tool's job is a structured roadmap, not a rejection verdict. The same score of 45 is a failure signal for `confident_match` and a useful starting point for `exploring_gap`.

---

## Two-dimensional scoring

Every routing decision uses two independent scores:

**ATS score (`atsScore`)** — can a machine read this resume and surface it for this role? Keyword density, exact title matching, layout parseability, section headers, date formats. Mechanical, literal, no inference. No benefit of the doubt.

**Fit score (`fitScore`)** — does this candidate actually match this role? Career narrative, transferable skills, trajectory, intent signals. Semantic, inferential, generous. Human context and archetype detection only affect this dimension.

These are orthogonal. A candidate can score high on one and low on the other. Routing is always a function of both. Both scores are returned in the API response — the frontend decides how to display them (badge colour, threshold, etc.). No `atsWarning` field — the scenario node advice explains ATS problems in natural language.

### Intent as a fit score modifier

`intent` and `intentContext` feed into the fit scoring as benefit-of-the-doubt modifiers. They do not change the ATS score. Examples:

- `confident_match` + `side_projects` + `adjacent_role` → extend significant benefit of the doubt on fit score
- `confident_match` + `career_pivot` alone → extend less benefit of the doubt
- `exploring_gap` + `already_retraining` + `side_projects` → extend moderate benefit of the doubt, prioritise roadmap output
- `exploring_gap` + `starting_from_scratch` → minimal benefit of the doubt, honest gap assessment

### Archetypes as a fit dimension modifier

Archetypes are purely a fit-layer concern. An ATS parser doesn't know or care about career transition archetypes — it scans for keywords. Archetype detection runs as a dedicated node (`detectArchetype`) after fit parsing and before scoring. It puts the result in state for all downstream nodes to read. See `prd-archetype-system.md`.

---

## Graph pipeline

### Full node structure

```
parseResumeATS ──┐
                 ├──► atsAnalysis ──► [conditional] ──► parseResumeFit ──┐
parseJobATS    ──┘         │          (ATS passes)      parseJobFit    ──┴──► detectArchetype ──► scoreMatch ──► [2D conditional] ──► scenario nodes
                           │
                           └──► END (short circuit — format error or critical fields missing)
                           └──► END (short circuit — confident_match + catastrophic keyword gap)

analyzeSkepticalReconciliation ──► [hitlFired check] ──► awaitHuman ──► rescore ──► analyzeSkepticalReconciliation ──► END
                                                     └──► END (hitlFired is true — second pass)

All other scenario nodes ──► END
```

### ATS parse nodes — `parseResumeATS`, `parseJobATS`

Run in parallel. Mechanical, literal extraction — no semantic inference. Small model, fast, cheap.

**Resume ATS parse extracts:**
- `contactInfo` — name, email, phone. Critical fields. If missing, hard stop.
- `jobTitle` — exact current title as written
- `workExperienceDates` — validates parseability, flags inconsistent formats
- `skillsVerbatim` — keywords exactly as written in the resume, no inference
- `sectionHeaders` — standard or non-standard, flags unclassified sections
- `layoutParseability` — single column, multi-column, graphics-heavy. Flags layouts that scramble text extraction.
- `parsingErrors` — special characters, emojis, encoding issues

**Job ATS parse extracts:**
- `requiredKeywords` — exact terms from requirements section
- `preferredKeywords` — exact terms from nice-to-have section
- `titleExact` — the exact job title string
- `requiredYOE` — years of experience if stated

### `atsAnalysis` node

Produces `atsScore` (0–100) and `atsProfile` from both ATS parse outputs. Owns all critical field validation. Gates whether fit parse runs at all.

**Short circuit conditions:**

Always short circuit, regardless of intent:
- Resume is unreadable — multi-column, garbled extraction, no parseable text. Return format error to client. No further analysis.
- Critical fields missing — `contactInfo` not extractable. Return critical field error.

Short circuit only for `confident_match`:
- Catastrophic keyword gap — near-zero overlap between `skillsVerbatim` and `requiredKeywords`. Return ATS reality check. Spending tokens on fit analysis is misleading here.

Never short circuit for `exploring_gap`:
- Low ATS score is expected and informative. The `atsProfile` is the most valuable output — it tells them exactly what keywords to build toward. Route through full pipeline regardless of ATS score.

### Fit parse nodes — `parseResumeFit`, `parseJobFit`

Run in parallel after ATS conditional passes. Semantic, inferential, generous. Do not extract critical fields — ATS parse owns those.

**Resume fit parse extracts:**
- Career narrative — the arc of the candidate's work history and trajectory
- Transferable experience — what their experience means beyond the literal title
- `sourceRole` — semantic inference using controlled vocabulary
- Strength signals — what this person is unusually good at based on trajectory
- Hidden experience — work that exists but isn't foregrounded in the resume

**Job fit parse extracts:**
- Role narrative — what kind of person succeeds in this role beyond the keyword list
- `targetRole` — semantic inference using controlled vocabulary
- Implicit requirements — what the role needs that isn't stated explicitly

### `detectArchetype` node

Runs after fit parse nodes complete, before `scoreMatch`. Pure dictionary lookup — no LLM call.

- Reads `state.resumeData.sourceRole` and `state.jobData.targetRole`
- Calls `buildContext(sourceRole, targetRole)`
- Writes result to `state.archetypeContext` — either the full `ArchetypeContext` object or null
- Logs when both roles are known controlled vocabulary values but no archetype matched — unmatched transitions tracked for future research prioritisation
- Null is a valid, expected result — no error thrown

All downstream nodes read `state.archetypeContext` without recomputing. Archetype detection happens once per run.

### `scoreMatch` node

Receives `atsProfile`, fit parse outputs, `intent`, `intentContext`, `archetypeContext`, and `userTier` from state. Produces `fitScore` (0–100). `atsScore` is carried from `atsAnalysis` state. Derives `weakMatch = fitScore < 60` deterministically — LLM does not compute this.

When `state.archetypeContext` is non-null and `state.userTier` is `"paid"`, passes tier 1 `skillMap` + critical/high `gapProfile` to the scoring chain for calibration. When null or free tier, generic scoring prompt.

`intentContext` informs how much benefit of the doubt the model extends. `atsProfile` informs the model of the machine-readability surface.

### Two-dimensional routing table

```
                      fitScore
                   Low (<50)        Mid (50–75)              High (75+)
              ┌──────────────┬──────────────────────┬───────────────────────┐
atsScore      │              │ S2: narrativeGap     │ S1a: strongMatch      │
High (75+)    │ S5/S4:       │ S3: archetypeGap     │ (strong fit,          │
              │ skeptical    │ (paid, archetype      │ ATS ready)            │
              │              │ known)               │                       │
              ├──────────────┼──────────────────────┼───────────────────────┤
atsScore      │              │ S2/S3 + ATS problem  │ S1b: ATSGap           │
Low (<50)     │ Short        │ (archetype still     │ (urgent — good        │
              │ circuit*     │ applies if paid)     │ candidate, invisible) │
              └──────────────┴──────────────────────┴───────────────────────┘

* Short circuit from atsAnalysis, before scoreMatch runs
exploring_gap intent overrides all mid/low fit cells → analyzeRoadmap
```

### Conditional edge logic

```
// intent takes priority — checked first
if intent is "exploring_gap":
  → analyzeRoadmap

// strong fit cases
elif fitScore >= 75 and atsScore >= 75:
  → analyzeStrongMatch (Scenario 1a)

elif fitScore >= 75 and atsScore < 75:
  → analyzeATSGap (Scenario 1b — urgent) [Phase 1]

// archetype check — before narrativeGap to win the 50–70 overlap
elif archetypeContext is not null and userTier is "paid" and fitScore >= 50:
  → analyzeArchetypeGap (Scenario 3)

elif fitScore >= 60:
  → analyzeNarrativeGap (Scenario 2)

// low fit, confident_match — always runs analyzeSkepticalReconciliation first
else:
  → analyzeSkepticalReconciliation (Scenario 4/5)
```

**Notes:**
- `analyzeATSGap` is Phase 1 work — not in scope for current implementation. Until Phase 1 ships, `fitScore >= 75 and atsScore < 75` falls through to `analyzeStrongMatch`.
- After HITL, `state.hitlFired` is true. `routeAfterScore` checks `hitlFired` first — if true, always routes to `analyzeSkepticalReconciliation` regardless of new score. The conversation context after HITL is different from a fresh run.
- `atsScore` is `number | undefined` until Phase 1 `atsAnalysis` node is built. Routing conditions that check `atsScore` treat `undefined` as passing (no ATS gate applied).

### HITL — scoped to `analyzeSkepticalReconciliation` only

HITL does not fire from `scoreMatch`. It fires from inside the `analyzeSkepticalReconciliation` path only, after analysis has run and `contextPrompt` exists.

**HITL fires when:**
- `intent` is `confident_match` AND
- `fitScore < 60` AND
- `state.hitlFired` is false (first pass only)

**Flow:**
```
analyzeSkepticalReconciliation runs → produces contextPrompt, weakMatchReason
    ↓
[check state.hitlFired]
    ↓ false (first pass)          ↓ true (second pass)
awaitHuman                        END
    ↓
sets hitlFired: true in state
interrupts graph
    ↓
user provides humanContext via /api/match/resume (free text, min 1 char)
    ↓
rescore runs
    ↓
routeAfterScore sees hitlFired: true → always routes to analyzeSkepticalReconciliation
    ↓
analyzeSkepticalReconciliation runs with humanContext in state
    ↓
[check state.hitlFired] → true → END
```

Loop is capped at one exchange. `hitlFired: true` prevents a second interrupt regardless of new score.

**`exploring_gap` users never hit HITL** — they route to `analyzeRoadmap` before reaching `analyzeSkepticalReconciliation`.

**Interrupted SSE event payload:** `{ fitScore, contextPrompt, threadId }` — `contextPrompt` is always present because `analyzeSkepticalReconciliation` runs before the interrupt fires.

---

## Scenarios

### Scenario 1a — Strong fit, ATS ready
**fitScore:** 75+  
**atsScore:** 75+  
**Graph node:** `analyzeStrongMatch`

The candidate fits the role and their resume surfaces correctly to the machine. `resumeAdvice` may be empty — this is correct behaviour, not a failure. The model should not manufacture advice.

**What the user needs:** Confirmation they are a strong fit on both dimensions. Minimal or no resume advice.

---

### Scenario 1b — Strong fit, ATS exposure *(Phase 1)*
**fitScore:** 75+  
**atsScore:** < 75  
**Graph node:** `analyzeATSGap`

The candidate genuinely fits the role but their resume won't survive automated filtering. Highest urgency advice case — the candidate is good but invisible. Advice is surgical terminology swaps, not "do more work."

**What the user needs:** Urgent, precise ATS alignment advice. Confirmation the underlying fit is strong.

---

### Scenario 2 — Narrative fit, resume doesn't show it
**fitScore:** 60–75  
**atsScore:** high or low  
**Graph node:** `analyzeNarrativeGap`

Career trajectory fits the role but resume is framed around previous identity. Gap is presentation, not skills. If `atsScore` is low, node receives `atsProfile` and includes ATS-specific reframing advice.

**What the user needs:** Reframing advice. Specific `contextPrompt` if model can't connect context to role.

---

### Scenario 3 — Fits a known transition archetype, needs deliberate work *(paid tier)*
**fitScore:** 50–70  
**atsScore:** high or low  
**Graph node:** `analyzeArchetypeGap`

Recognisable career transition. Archetype-specific coaching injected — hidden strengths, credibility signals, mental model shift. If `atsScore` is low, node surfaces which archetype-specific keywords are absent from the resume. Falls back silently to `analyzeNarrativeGap` when archetype unavailable or free tier.

**What the user needs:** Structured, transition-specific gap analysis. Clear path forward. Honest about work required.

---

### Scenario 4 — Weak fit, human context suggests a path
**fitScore:** < 60  
**intent:** `confident_match`  
**humanContext:** present (post-HITL), model not yet convinced  
**Graph node:** `analyzeSkepticalReconciliation`

Scored low, provided context via HITL, model not convinced — context lacks specificity.

**What the user needs:** Specific `contextPrompt` — "you mentioned X, we'd need to know A and B specifically."

---

### Scenario 5 — Genuine weak match
**fitScore:** < 60  
**intent:** `confident_match`  
**Graph node:** `analyzeSkepticalReconciliation` → `awaitHuman` → `analyzeSkepticalReconciliation`

Not suited for this role at this time. Model cannot formulate a question that would change assessment. `contextPrompt` is null — its absence on a low score signals the gap is real.

**What the user needs:** Direct, honest `weakMatchReason`. No false optimism.

---

### Scenario 6 — Exploring gap, roadmap mode *(archetype-powered roadmap is paid tier)*
**fitScore:** any  
**intent:** `exploring_gap`  
**Graph node:** `analyzeRoadmap`

User has declared they know they're off. Score is a starting point, not a verdict. HITL never fires for this intent. `atsProfile` surfaced as keyword target list.

**What the user needs:** Structured gap analysis with timeline-appropriate milestones. Honest about distance.

---

## Graph state — new and changed fields

### `fitScore` (renamed from `score`)
Primary fit score, 0–100. LLM output from `scoreMatch`. Replaces `score` everywhere — `MatchResult`, `MatchResponse`, graph state, routing conditions, SSE events, tests. Breaking change — noted in ADR.

### `atsScore` (new)
ATS surface score, 0–100. Produced by `atsAnalysis`. `number | undefined` until Phase 1 `atsAnalysis` node is built — routing treats `undefined` as passing. Both `fitScore` and `atsScore` returned in API response. Frontend handles display decisions (badge colour, threshold). No `atsWarning` field.

### `atsProfile` (new)
Structured output of `atsAnalysis`. Contains keyword overlap, missing required keywords, layout flags, parsing errors. Injected into scenario nodes that need it. Type definition owned by implementation.

### `archetypeContext` (new)
`ArchetypeContext | null`. Written by `detectArchetype` node. Read by `scoreMatch`, `analyzeArchetypeGap`, `analyzeRoadmap`. Never recomputed after `detectArchetype` runs.

### `intent` (new)
`"confident_match"` | `"exploring_gap"`. From request body. First routing condition checked — takes priority over all other conditions.

### `intentContext` (new)
`ConfidentMatchContext` | `ExploringGapContext`. From request body. Shapes benefit of the doubt on fit score.

### `userTier` (new)
`"base"` | `"paid"`. Derived server-side from auth middleware — never from request body. Set in initial graph state by route handler from `req.user.tier`. Default `"base"`. Used by routing and chain factories for tier gate.

### `hitlFired` (new)
`boolean`. Default `false`. Set to `true` by `awaitHuman` node before interrupting. Prevents HITL firing more than once per thread. `routeAfterScore` checks this first when `hitlFired` is true — always routes to `analyzeSkepticalReconciliation` regardless of new score.

### `humanContext` (changed)
No longer set on first run — only populated via `/api/match/resume` (HITL). Its presence in state indicates HITL has already fired once.

### `contextPrompt` (new — response field)
Generated by analysis nodes. Null when gap is real and no context would help. Always present in interrupted SSE event because `analyzeSkepticalReconciliation` runs before HITL fires.

### `weakMatch` (changed — now derived)
Derived deterministically as `fitScore < 60` in `scoreMatch` node. LLM does not compute this. `superRefine` removed from `MatchSchema`.

### `narrativeAlignment` (unchanged)
Remains in `MatchResult` and API response.

### Removed from API response
`resumeData` and `jobData` (parsed resume and job) are no longer included in the completed SSE event. Internal parsing outputs stay in graph state for node use only. Client receives analysis outputs only: `fitScore`, `atsScore`, `matchedSkills`, `missingSkills`, `gaps`, `resumeAdvice`, `contextPrompt`, `weakMatch`, `weakMatchReason`, `narrativeAlignment`.

---

## Auth and tier middleware

Two middleware layers run before route handlers on all match routes:

**Auth middleware** — verifies JWT, performs Supabase lookup, attaches `{ userId, tier, usage, resetAt }` to `req.user`. Uses `@supabase/supabase-js` admin SDK with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` environment variables. Separate from the raw Postgres connection used by the checkpointer.

**Usage middleware** — checks `req.user.usage` against tier limit. Returns 429 with reset date if over limit.

Route handler reads `req.user.tier` and passes `userTier` into initial graph state. Client never sends `userTier` — server always derives it from auth. `userTier` is a server-derived value, not a client claim.

**`/api/match/resume` (HITL resume):** Re-verifies JWT is valid. Reads `userTier` from checkpointed graph state, not a fresh Supabase lookup — the tier active when the run started is preserved across the HITL exchange.

---

## Resolved decisions

**detectArchetype as dedicated node:** Archetype detection is a pure dictionary lookup with no LLM call. It runs as its own node after fit parse, before `scoreMatch`, and writes `archetypeContext` to state once. All downstream nodes read from state without recomputing.

**analyzeArchetypeGap injection scope:** Receives coaching material only — `hiddenStrengths`, `credibilitySignals`, `mentalModelShift`. Does not receive `skillMap` or `gapProfile`. Those go to `scoreMatch` for scoring calibration. Scoring and coaching are separate concerns in separate nodes.

**Intent takes priority in routing:** `exploring_gap` is checked before archetype, before fitScore thresholds. A paid tier `exploring_gap` user with a known archetype routes to `analyzeRoadmap`, not `analyzeArchetypeGap`.

**HITL moved to after analyzeSkepticalReconciliation:** `contextPrompt` is always generated before HITL fires. Interrupted event always includes `contextPrompt`. `scoreMatch` does not gate HITL.

**hitlFired boolean:** Explicit state field. More readable than inferring first-pass from `humanContext` absence. `hitlFired: true` caps the loop regardless of what `humanContext` contains.

**userTier source:** Auth middleware, Supabase lookup, attached to `req.user`. Passed into initial graph state. Never from request body. HITL resume reads from checkpointed state.

**fitScore rename:** `score` renamed to `fitScore` everywhere. Breaking change recorded in ADR. `atsScore` added alongside as `number | undefined` until Phase 1.

**atsScore display:** Both scores returned in API response. No `atsWarning` field. Frontend handles display. Scenario node advice explains ATS problems in natural language.

**Parsed resume/job removed from response:** Internal to graph state only. Client receives analysis outputs only.

**contextPrompt and HITL:** Triggers a single HITL interrupt. Loop capped at one exchange by `hitlFired`. After HITL exchange, `rescore` always routes to `analyzeSkepticalReconciliation` regardless of new score.

**contextPrompt preservation in gap analysis:** Stripped from output schema, reattached programmatically from input. Model does not regenerate it.

**weakMatch derivation:** In `scoreMatch` node, not inside chain `invoke`.

**rescore after HITL:** `hitlFired: true` in state forces `analyzeSkepticalReconciliation` on second pass regardless of new score.

**narrativeAlignment:** Stays in API response — accidentally omitted from earlier field list.

**analyzeATSGap:** Phase 1 work. Until Phase 1 ships, `fitScore >= 75 and atsScore < 75` falls through to `analyzeStrongMatch`.

---

## Open questions

- Is there a minimum fitScore threshold (e.g. < 20) below which we skip all scenario analysis and return early with just `weakMatchReason`, even for `exploring_gap` users?
- Multi-model routing per node — `analyzeStrongMatch` and ATS parse nodes are small/fast model candidates. `analyzeSkepticalReconciliation` and `analyzeArchetypeGap` are stronger model candidates. Implemented with eval harness PRD.

---

## Out of scope for this PRD

- Specific prompt copy for each analysis node (owned by implementation, validated by eval harness)
- Model selection per node (designed here, implemented with eval harness PRD)
- Archetype injection details (see `prd-archetype-system.md`)
- Frontend UI implementation of intent selector and intentContext dropdowns
- Zod schema definitions for request body validation (owned by implementation)
- `atsProfile` TypeScript interface definition (owned by implementation)