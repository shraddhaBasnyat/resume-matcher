# PRD: Match Scenarios, Score Branching & Contextual Prompting

**Status:** Draft  
**Author:** sbasnyat  
**Last updated:** 2026-04-05  
**Related ADR:** `docs/architecture.md`  
**Related PRD:** `prd-archetype-system.md` (archetype wiring — separate doc)

---

## Problem

The current scoring chain has one mode: score the resume against the job and produce advice. This works for a straightforward match but produces poor results across the range of real user situations — it over-advises strong matches, under-explains weak ones, and has no way to distinguish "weak match because of a framing gap" from "weak match because the candidate is genuinely not suited."

Additionally, the current UI only collects human context after a low score triggers HITL. Users making career transitions — the primary target user — almost always have relevant context their resume doesn't show. They shouldn't have to wait for a weak score to provide it.

---

## Goals

- Match the LLM's analysis mode to the actual situation the user is in
- Give users a clear, honest signal in all five match scenarios
- Collect human context upfront so the first score is as informed as possible
- Introduce `contextPrompt` as a new output field that tells the user specifically what information would change their score
- Derive `weakMatch` deterministically rather than asking the LLM to compute it

---

## Non-goals

- Archetype wiring and skill graph injection (covered in `prd-archetype-system.md`)
- Eval harness design (separate PRD, to follow)
- Multi-model routing by score branch (designed here, implemented with eval harness)
- Subscription or usage limit changes

---

## Users & scenarios

The five scenarios below are the core design surface for this PRD. Every product and schema decision traces back to one of these.

---

### Scenario 1 — Strong match, resume already shows it
**Score range:** 75+  
**Human context:** present or absent — doesn't change the outcome  

The candidate fits the role and their resume demonstrates it clearly. The risk here is the LLM manufacturing advice because it was asked to produce some. The prompt must explicitly give the model permission to return sparse or empty `resumeAdvice`. Padding this case with generic suggestions erodes trust in the tool.

**What the user needs:** Confirmation. Brief summary of why they fit. Minimal or no resume advice.

---

### Scenario 2 — Narrative fit, resume doesn't show it
**Score range:** 60–75  
**Human context:** absent or insufficient  

The candidate's career trajectory fits the role but their resume is framed around their previous identity, not their target one. The gap isn't skills — it's presentation. The advice here isn't "go learn X," it's "rewrite your experience section to surface what you already did."

This is also the primary case where upfront human context changes the first score. A candidate who volunteers "I've been doing agent work for three months on a side project" before the first run gets a more accurate score immediately rather than waiting for HITL.

**What the user needs:** Reframing advice. If human context is absent or the model can't connect it to the role, a specific `contextPrompt` asking for the experience that would close the framing gap.

---

### Scenario 3 — Fits a known transition archetype, needs deliberate work
**Score range:** 50–70  
**Human context:** may or may not be present  

The candidate is making a recognisable career transition — for example, backend SWE to AI agent developer. The gaps are known and well-understood. Generic advice is less useful here than archetype-specific guidance: "your eval methodology section is missing, here's why that matters for this role specifically."

Note: this scenario depends on archetype injection being in place. See `prd-archetype-system.md`. When archetype context is unavailable, this case falls back to Scenario 2 behaviour.

**What the user needs:** Structured, transition-specific gap analysis. Clear path forward with known milestones. Honest about the work required.

---

### Scenario 4 — Weak match, human context suggests a path
**Score range:** < 60  
**Human context:** present, but model not yet convinced  

The candidate scored low on resume alone but provided human context that suggests a plausible match. The model has weighed the context and isn't yet convinced — not because the context is irrelevant but because it lacks specificity. The candidate may genuinely have the background, they just haven't given the model enough to verify it.

This is distinct from Scenario 5. The path is unclear but not closed.

**What the user needs:** A specific `contextPrompt` — not "tell us more" generically, but "you mentioned X, we'd need to know specifically A and B to factor that in." The user either has that answer or they don't, and both outcomes are informative.

---

### Scenario 5 — Genuine weak match, no plausible path from context
**Score range:** < 60  
**Human context:** absent, or present but doesn't close the gap  

The candidate is not suited for this role at this time, or would need a significant period of deliberate work to get there. No amount of reframing changes this. The model cannot formulate a question that would change its assessment.

The current prompt pushes toward advice in this case, which means it manufactures a path that doesn't exist. This erodes trust more than an honest assessment would.

**What the user needs:** A direct, honest `weakMatchReason`. No false optimism. `contextPrompt` is null — its absence on a low score is itself a signal that the gap is real.

---

## New and changed fields

### `contextPrompt` (new)
A question or prompt generated by the model, surfaced in the UI, asking the user for specific information that would materially change their score.

- Present when: score is low or mid-range AND the model sees a plausible path to a better score
- Absent (null) when: the match is genuinely weak and no context would help (Scenario 5)
- Content varies by trigger:
  - No human context provided → open-ended, inviting ("your resume shows X, is there relevant experience not listed?")
  - Human context present but unconvincing → specific and skeptical ("you mentioned Z, we'd need to know A and B specifically")
- Null `contextPrompt` on a low score is meaningful — it means the model has considered the case and has no question worth asking

### `weakMatch` (changed — now derived)
Previously an LLM output field. Now derived deterministically as `score < 60` after parsing. The LLM is not asked to compute this. Removes a source of inconsistency where the model could return `score: 45, weakMatch: false`.

### `weakMatchReason` (unchanged in position, clarified in intent)
Remains an LLM output field. Only meaningful when `score < 60`. Should be honest and direct in Scenario 5, and should explain what the context gap is in Scenario 4. Not motivational copy.

### `resumeAdvice` (behaviour change)
In Scenario 1, the model is explicitly permitted to return an empty array. Sparse advice on a strong match is correct behaviour, not a failure.

---

## Upfront human context — UI change

### Current behaviour
The Chrome extension popup collects resume text and job description only. Human context is only collected after a low score triggers HITL interruption.

### Proposed behaviour
Add an optional free-text field to the extension popup before the first run:

> "Anything about your background this resume doesn't show? (optional)"

This field maps to the existing `humanContext` field in the `/api/match/run` request body — no backend schema change required. If left empty, behaviour is identical to today.

### Rationale
Career transition candidates — the primary target user — almost always have context their resume doesn't show. Collecting it upfront means:
- The first score is more accurate
- Scenario 2 and 4 users get better results without waiting for HITL
- HITL becomes a fallback for users who didn't provide context upfront, not the primary collection mechanism

### HITL path after this change
HITL remains in place. It fires when `score < 60` and `humanContext` is absent — same as today. If `humanContext` was provided upfront and the score is still low, the model uses `contextPrompt` to ask a specific follow-up rather than a generic "tell us more."

---

## Score branching

The scoring chain branches on score range. Each branch uses a different prompt variant. Multi-model routing (different LLMs per branch) is designed here but implemented as part of the eval harness work.

| Score range | Scenario | Prompt mode | `contextPrompt` | Notes |
|---|---|---|---|---|
| 75+ | 1 | Confirm and surface | null | Permission to return sparse advice |
| 60–75 | 2 | Reframe and surface gaps | Present if humanContext absent or unconvincing | Narrative gap, not skills gap |
| 50–70 | 3 | Archetype-aware gap analysis | Present if humanContext absent | Requires archetype injection |
| < 60, humanContext present | 4 | Skeptical reconciliation | Present — specific follow-up | Model explains what it needs to be convinced |
| < 60, humanContext absent | 4/5 | Honest assessment or HITL | Present if path plausible, null if not | Null = Scenario 5 signal |

Note: score ranges overlap by design. The branch selected depends on score + humanContext presence, not score alone.

---

## Open questions

- Should `contextPrompt` trigger a second HITL interrupt in the web app flow, or is it UI-only in the extension?
- When archetype context is unavailable and score is 50–70, does Scenario 3 silently fall back to Scenario 2, or does the UI indicate the archetype wasn't recognised?
- Is there a minimum score threshold below which we skip gap analysis entirely and return early?

---

## Out of scope for this PRD

- Specific prompt copy for each branch (owned by implementation, validated by eval harness)
- Model selection per branch (designed here, implemented with eval harness PRD)
- Archetype injection details (see `prd-archetype-system.md`)
