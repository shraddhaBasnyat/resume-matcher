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
The gate is a single conditional: if `buildContext` returns non-null AND the user is on the paid tier, inject archetype context and route to `analyzeArchetypeGap`. If free tier, skip injection and route to `analyzeNarrativeGap` as fallback. One conditional, no separate code paths.

The upgrade moment is natural — a user gets a mid-range score and generic narrative advice, and the UI indicates that a known transition archetype exists for their profile. The specific gap analysis is behind the tier gate.

---

## Request body — new shape

The `/api/match/run` request body changes significantly. `humanContext` is removed from the first run entirely. Structured intent fields replace it.

```typescript
{
  resumeText: string
  jobText: string
  intent: "confident_match" | "exploring_gap"
  intentContext: ConfidentMatchContext | ExploringGapContext
  humanContext?: string  // absent on first run — HITL only
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

`/api/match/resume` (HITL) is unchanged except that `humanContext` now only ever appears here — it is the free-text field reserved for when a user has seen their score and wants to disagree with it.

### Why structured selections, not free text upfront

Structured selections are unambiguous — the graph routes on them deterministically before any LLM call. Free text upfront is noise — users don't know what's relevant until they've seen the analysis. Reserving free text for HITL means it arrives as high-signal reactive context, not speculative pre-context.

### Why intent changes the analysis

`confident_match` users expect a high score. A low score is a surprise that needs explaining. The tool's job is honest confirmation or correction.

`exploring_gap` users have already accepted the gap. A low score is expected. The tool's job is a structured roadmap, not a rejection verdict. The same score of 45 is a failure signal for `confident_match` and a useful starting point for `exploring_gap`.

---

## Two-dimensional scoring

Every routing decision uses two independent scores:

**ATS score** — can a machine read this resume and surface it for this role? Keyword density, exact title matching, layout parseability, section headers, date formats. Mechanical, literal, no inference. No benefit of the doubt.

**Fit score** — does this candidate actually match this role? Career narrative, transferable skills, trajectory, intent signals. Semantic, inferential, generous. Human context and archetype detection only affect this dimension.

These are orthogonal. A candidate can score high on one and low on the other. Routing is always a function of both.

### Intent as a fit score modifier

`intent` and `intentContext` feed into the fit scoring as benefit-of-the-doubt modifiers. They do not change the ATS score. Examples:

- `confident_match` + `side_projects` + `adjacent_role` → extend significant benefit of the doubt on fit score
- `confident_match` + `career_pivot` alone → extend less benefit of the doubt
- `exploring_gap` + `already_retraining` + `side_projects` → extend moderate benefit of the doubt, prioritise roadmap output
- `exploring_gap` + `starting_from_scratch` → minimal benefit of the doubt, honest gap assessment

### Archetypes as a fit dimension modifier

Archetypes are purely a fit-layer concern. An ATS parser doesn't know or care about career transition archetypes — it scans for keywords. Archetype detection only fires after the fit score is computed and changes what the fit analysis node does, not the score itself. See `prd-archetype-system.md`.

---

## Graph pipeline

### Full node structure

```
parseResumeATS ──┐
                 ├──► atsAnalysis ──► [conditional] ──► parseResumeFit ──┐
parseJobATS    ──┘         │          (ATS passes)      parseJobFit    ──┴──► scoreMatch ──► [2D conditional] ──► scenario nodes
                           │
                           └──► END (short circuit — format error or critical fields missing)
                           └──► END (short circuit — confident_match + catastrophic keyword gap)

awaitHuman ──► rescore ──► analyzeSkepticalReconciliation ──► END

All scenario nodes ──► END
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
- Catastrophic keyword gap — near-zero overlap between `skillsVerbatim` and `requiredKeywords`. Return ATS reality check — the user thinks they match but the machine sees nothing. Spending tokens on fit analysis is misleading here.

Never short circuit for `exploring_gap`:
- Low ATS score is expected and informative for this user. The `atsProfile` is the most valuable output they receive — it tells them exactly what keywords and terminology they need to build toward. Route through the full pipeline regardless of ATS score.

### Fit parse nodes — `parseResumeFit`, `parseJobFit`

Run in parallel after ATS conditional passes. Semantic, inferential, generous. These nodes explicitly do not extract critical fields — ATS parse owns those.

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

### `scoreMatch` node

Receives `atsProfile`, fit parse outputs, `intent`, and `intentContext`. Produces `fitScore` (0–100) and `atsScore` (carried from `atsAnalysis`). Derives `weakMatch = fitScore < 60` deterministically — LLM does not compute this.

`intentContext` informs how much benefit of the doubt the model extends on the fit score. `atsProfile` informs the model of the machine-readability surface so the fit score reflects realistic hiring outcomes, not just semantic alignment.

### Two-dimensional routing table

Routing after `scoreMatch` uses both `atsScore` and `fitScore`:

```
                      fitScore
                   Low (<50)        Mid (50–75)              High (75+)
              ┌──────────────┬──────────────────────┬───────────────────────┐
atsScore      │              │ S2: narrativeGap     │ S1b: ATSGap           │
High (75+)    │ S5: honest   │ S3: archetypeGap     │ (strong fit,          │
              │ misfit       │ (archetype if known) │ ATS exposure)         │
              ├──────────────┼──────────────────────┼───────────────────────┤
atsScore      │              │ S2/S3 + ATS problem  │ S1b: ATSGap           │
Low (<50)     │ Short        │ (archetype still     │ (urgent — good        │
              │ circuit*     │ applies if known)    │ candidate, invisible) │
              └──────────────┴──────────────────────┴───────────────────────┘

* Short circuit from atsAnalysis, before scoreMatch runs
```

Intent modifies routing in the mid/low fit cells:
- `exploring_gap` + low fitScore → always route to roadmap analysis, never to skeptical reconciliation
- `confident_match` + low fitScore → route to skeptical reconciliation or honest misfit
- `exploring_gap` + `applying_now` + low fitScore → honest assessment with immediate actionable gaps
- `exploring_gap` + `one_year_plus` + low fitScore → roadmap with timeline-appropriate milestones

### Conditional edge logic

```
atsScore and fitScore both known
weakMatch = fitScore < 60  (derived, not LLM output)

// ATS short circuits already handled before this point

if fitScore >= 75 and atsScore >= 75:
  → analyzeStrongMatch (Scenario 1a)

if fitScore >= 75 and atsScore < 75:
  → analyzeATSGap (Scenario 1b — urgent)

elif fitScore >= 50 and archetypeContext is not null:
  → analyzeArchetypeGap (Scenario 3)
  // atsScore low: node receives atsProfile, includes ATS advice alongside archetype advice

elif fitScore >= 60:
  → analyzeNarrativeGap (Scenario 2)
  // atsScore low: node receives atsProfile, includes ATS advice

elif intent is "exploring_gap":
  → analyzeRoadmap (exploring_gap variant of Scenario 3/4)

elif humanContext is absent:
  → awaitHuman

else:
  → analyzeSkepticalReconciliation (Scenario 4/5)
```

Archetype check is evaluated before `fitScore >= 60` branch — archetype takes priority in the 50–70 overlap range. The prose description is authoritative; code must follow this order.

---

## Scenarios

### Scenario 1a — Strong fit, ATS ready
**fitScore:** 75+  
**atsScore:** 75+  
**Graph node:** `analyzeStrongMatch`

The candidate fits the role and their resume surfaces correctly to the machine. The rarest case. `resumeAdvice` may be empty — this is correct behaviour, not a failure. The model should not manufacture advice.

**What the user needs:** Confirmation they are a strong fit on both dimensions. Minimal or no resume advice.

---

### Scenario 1b — Strong fit, ATS exposure
**fitScore:** 75+  
**atsScore:** < 75  
**Graph node:** `analyzeATSGap`

The candidate genuinely fits the role but their resume won't survive automated filtering before a human sees them. This is the highest urgency advice case — the candidate is good but invisible. The advice is not "do more work," it is "describe your existing work differently."

The model looks for:
- Bullet points where the candidate's language describes the same thing the JD describes but uses different terminology — flag the JD term and where to swap it in
- Keywords present in the JD that are absent from the resume even though the underlying experience exists
- Section ordering — if the JD leads with something the candidate buries, flag the reorder
- Layout issues flagged by `atsProfile` — multi-column, graphics, non-standard headers

Advice must be specific and surgical. "Change 'built internal tooling' to 'developed developer productivity tooling' to match the JD's exact framing" is correct. "Strengthen your experience section" is not.

**What the user needs:** Urgent, precise ATS alignment advice. Confirmation the underlying fit is strong. No roadmap — they don't need to do more work, they need to communicate existing work better.

---

### Scenario 2 — Narrative fit, resume doesn't show it
**fitScore:** 60–75  
**atsScore:** high or low  
**Graph node:** `analyzeNarrativeGap`

The candidate's career trajectory fits the role but their resume is framed around their previous identity, not their target one. The gap isn't skills — it's presentation. If `atsScore` is also low, the node receives `atsProfile` and includes ATS-specific reframing advice alongside narrative reframing.

**What the user needs:** Reframing advice. If human context is absent or the model can't connect it to the role, a specific `contextPrompt` asking for the experience that would close the framing gap.

---

### Scenario 3 — Fits a known transition archetype, needs deliberate work *(paid tier)*
**fitScore:** 50–70  
**atsScore:** high or low  
**Graph node:** `analyzeArchetypeGap`

The candidate is making a recognisable career transition. Archetype-specific gap analysis is injected — known gaps, hidden strengths, credibility signals. If `atsScore` is low, the node also surfaces which archetype-specific keywords are absent from the resume ("you have LangGraph experience but your resume calls it 'workflow automation' — the ATS will never surface you for agent dev roles").

When archetype context is unavailable, falls back silently to `analyzeNarrativeGap`.

**What the user needs:** Structured, transition-specific gap analysis. Clear path forward. Honest about the work required.

---

### Scenario 4 — Weak fit, human context suggests a path
**fitScore:** < 60  
**intent:** `confident_match`  
**humanContext:** present, model not yet convinced  
**Graph node:** `analyzeSkepticalReconciliation`

The candidate scored low but provided human context via HITL that suggests a plausible match. The model has weighed the context and isn't yet convinced — not because the context is irrelevant but because it lacks specificity.

**What the user needs:** A specific `contextPrompt` — "you mentioned X, we'd need to know specifically A and B to factor that in."

---

### Scenario 5 — Genuine weak match
**fitScore:** < 60  
**intent:** `confident_match`  
**humanContext:** absent or doesn't close the gap  
**Graph node:** `analyzeSkepticalReconciliation` or `awaitHuman`

The candidate is not suited for this role at this time. The model cannot formulate a question that would change its assessment. `contextPrompt` is null — its absence on a low score is a signal the gap is real.

**What the user needs:** A direct, honest `weakMatchReason`. No false optimism.

---

### Scenario 6 — Exploring gap, roadmap mode *(archetype-powered roadmap is paid tier)*
**fitScore:** any  
**intent:** `exploring_gap`  
**Graph node:** `analyzeRoadmap`

The user has declared they know they're off. The score is not a surprise — it's a starting point. The output is a structured roadmap calibrated to their `timeline` and `currentStatus`. `one_year_plus` + `starting_from_scratch` gets a different roadmap than `applying_now` + `side_projects` + `self_taught`.

HITL never fires for `exploring_gap` users regardless of fitScore — they came for the gap, interrupting them for context is the wrong interaction.

**What the user needs:** Structured gap analysis with timeline-appropriate milestones. Honest about distance. `atsProfile` surfaced as a keyword target list — "these are the terms you need to get into your resume."

---

## New and changed fields

### `atsScore` (new — graph state)
0–100. Produced by `atsAnalysis`. Independent of `fitScore`. Carried through state to all scenario nodes.

### `atsProfile` (new — graph state)
Structured output of `atsAnalysis`. Contains keyword overlap, missing required keywords, layout flags, parsing errors. Injected into scenario nodes that need it.

### `intent` (new — graph state)
`"confident_match"` | `"exploring_gap"`. From request body. Used for routing and as fit score modifier.

### `intentContext` (new — graph state)
`ConfidentMatchContext` | `ExploringGapContext`. From request body. Shapes benefit of the doubt on fit score and roadmap depth on `exploring_gap` runs.

### `contextPrompt` (new — response field)
A question generated by the model asking for specific information that would materially change the score. Present when the model sees a plausible path to a better score. Null when the gap is real and no context would help. Null `contextPrompt` on a low score is meaningful. Does not trigger a second HITL interrupt.

### `weakMatch` (changed — now derived)
Derived deterministically as `fitScore < 60` in the `scoreMatch` node. LLM does not compute this. `superRefine` cross-field validation removed from `MatchSchema` — validation moves to node layer.

### `weakMatchReason` (unchanged in position, clarified in intent)
LLM output field. Only meaningful when `fitScore < 60`. Honest and direct in Scenario 5. Explains the specific context gap in Scenario 4. Not motivational copy.

### `resumeAdvice` (behaviour change)
Empty array is correct in Scenario 1a. Scenario 1b advice is ATS-specific and surgical. Scenario 6 advice is roadmap-structured. The model is not permitted to pad advice to appear helpful.

### Critical fields (moved)
`contactInfo`, `jobTitle`, `workExperienceDates` move from `MatchSchema` to `atsProfile`. They are extracted by ATS parse nodes, not fit analysis. If critical fields are missing, the graph short-circuits before fit analysis runs.

---

## HITL — updated behaviour

HITL fires only when:
- `fitScore < 60` AND
- `humanContext` is absent AND
- `intent` is `confident_match`

`exploring_gap` users never hit HITL. They came for the gap — interrupting them is the wrong interaction.

After HITL, the user provides free-text `humanContext` via `/api/match/resume`. This is the only point in the flow where free text is accepted. `rescore` runs, then routes to `analyzeSkepticalReconciliation` regardless of new score — the conversation context is different from a fresh run.

`contextPrompt` is included in the interrupted SSE event payload — `{ score, threadId, contextPrompt }` — so the frontend can show the user specifically what to provide rather than a generic prompt.

---

## Resolved decisions

**Intent-aware short circuits:** Unreadable resume and missing critical fields always short-circuit. Catastrophic keyword gap short-circuits only for `confident_match`. `exploring_gap` users never short-circuit on low ATS — the gap is what they came to see.

**contextPrompt and HITL:** contextPrompt triggers a single HITL interrupt — the user sees the question, provides free-text context via /api/match/resume, and rescore runs. After that single exchange, no further contextPrompt is generated. The loop is capped at one round of clarification. rescore always routes to analyzeSkepticalReconciliation on the second pass regardless of new score.

**contextPrompt in interrupted SSE event:** Included. Lets frontend show specific follow-up prompt rather than generic HITL message.

**Score branching implementation:** Separate graph nodes per scenario. Not a single prompt with conditional instruction blocks. Routing is a graph responsibility — scores are known before routing happens.

**Scenario 3 fallback:** When archetype context unavailable, conditional edge routes to `analyzeNarrativeGap` silently. No UI indication.

**sourceRole/targetRole vocabulary:** Free text with LLM instructed to use controlled vocabulary. Exact-match lookup. Mismatches degrade gracefully to null. See `prd-archetype-system.md`.

**weakMatch derivation:** In `scoreMatch` node, not inside chain `invoke`. Chain returns LLM output, node derives deterministic fields before writing to state.

**mentalModelShift:** Included in `ArchetypeContext`, injected into `analyzeArchetypeGap` only. See `prd-archetype-system.md`.

**rescore after HITL:** Fixed edge to `analyzeSkepticalReconciliation` always, regardless of new score. Conversation context after HITL is different from a fresh run.

**contextPrompt preservation in gap analysis:** Strip from output schema, reattach programmatically from input. Trusting the model to echo it is a reliability risk.

**mentalModelShift type:** Structured object `{ from: string; to: string; practicalImplication: string }`.

---

## Open questions

- Is there a minimum fitScore threshold (e.g. < 20) below which we skip all scenario analysis and return early with just `weakMatchReason`, even for `exploring_gap` users?
- Should `atsScore` be surfaced in the UI as a separate visible number, or only used internally for routing and advice generation?
- Multi-model routing per node — `analyzeStrongMatch` and `parseResumeATS`/`parseJobATS` are small/fast model candidates. `analyzeSkepticalReconciliation` and `analyzeArchetypeGap` are stronger model candidates. Implemented with eval harness PRD.

---

## Out of scope for this PRD

- Specific prompt copy for each analysis node (owned by implementation, validated by eval harness)
- Model selection per node (designed here, implemented with eval harness PRD)
- Archetype injection details (see `prd-archetype-system.md`)
- Frontend UI implementation of intent selector and intentContext dropdowns
- Zod schema definitions for request body validation (owned by implementation)