# PRD: Match Scenarios, Score Branching & Contextual Prompting

**Status:** Draft  
**Author:** sbasnyat  
**Last updated:** 2026-04-05  
**Related ADR:** `docs/architecture.md`  
**Related PRD:** `prd-archetype-system.md` (archetype wiring — read alongside)

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
- Route to scenario-specific analysis nodes in the graph — not a single prompt trying to self-route

---

## Non-goals

- Archetype wiring and skill graph injection (covered in `prd-archetype-system.md`)
- Eval harness design (separate PRD, to follow)
- Multi-model routing by score branch (designed here, implemented with eval harness)
- Subscription or usage limit changes

---

## Users & scenarios

The five scenarios below are the core design surface for this PRD. Every product, schema, and graph routing decision traces back to one of these.

---

### Scenario 1 — Strong match, resume already shows it
**Score range:** 75+  
**Human context:** present or absent — doesn't change the outcome  
**Graph node:** `analyzeStrongMatch`

The candidate fits the role and their resume demonstrates it clearly. The risk here is the LLM manufacturing advice because it was asked to produce some. The prompt must explicitly give the model permission to return sparse or empty `resumeAdvice`. Padding this case with generic suggestions erodes trust in the tool.

**What the user needs:** Confirmation. Brief summary of why they fit. Minimal or no resume advice.

---

### Scenario 2 — Narrative fit, resume doesn't show it
**Score range:** 60–75  
**Human context:** absent or insufficient  
**Graph node:** `analyzeNarrativeGap`

The candidate's career trajectory fits the role but their resume is framed around their previous identity, not their target one. The gap isn't skills — it's presentation. The advice here isn't "go learn X," it's "rewrite your experience section to surface what you already did."

This is also the primary case where upfront human context changes the first score. A candidate who volunteers "I've been doing agent work for three months on a side project" before the first run gets a more accurate score immediately rather than waiting for HITL.

**What the user needs:** Reframing advice. If human context is absent or the model can't connect it to the role, a specific `contextPrompt` asking for the experience that would close the framing gap.

---

### Scenario 3 — Fits a known transition archetype, needs deliberate work
**Score range:** 50–70  
**Human context:** may or may not be present  
**Graph node:** `analyzeArchetypeGap`

The candidate is making a recognisable career transition — for example, backend SWE to AI agent developer. The gaps are known and well-understood. Generic advice is less useful here than archetype-specific guidance: "your eval methodology section is missing, here's why that matters for this role specifically."

When archetype context is unavailable (transition not in registry), this node is not invoked — the conditional edge falls through to `analyzeNarrativeGap` silently. No UI indication.

**What the user needs:** Structured, transition-specific gap analysis. Clear path forward with known milestones. Honest about the work required.

---

### Scenario 4 — Weak match, human context suggests a path
**Score range:** < 60  
**Human context:** present, but model not yet convinced  
**Graph node:** `analyzeSkepticalReconciliation`

The candidate scored low on resume alone but provided human context that suggests a plausible match. The model has weighed the context and isn't yet convinced — not because the context is irrelevant but because it lacks specificity. The candidate may genuinely have the background, they just haven't given the model enough to verify it.

This is distinct from Scenario 5. The path is unclear but not closed.

**What the user needs:** A specific `contextPrompt` — not "tell us more" generically, but "you mentioned X, we'd need to know specifically A and B to factor that in." The user either has that answer or they don't, and both outcomes are informative.

---

### Scenario 5 — Genuine weak match, no plausible path from context
**Score range:** < 60  
**Human context:** absent, or present but doesn't close the gap  
**Graph node:** `analyzeSkepticalReconciliation` (humanContext present) or `awaitHuman` then `analyzeSkepticalReconciliation` (humanContext absent)

The candidate is not suited for this role at this time, or would need a significant period of deliberate work to get there. No amount of reframing changes this. The model cannot formulate a question that would change its assessment.

The current prompt pushes toward advice in this case, which means it manufactures a path that doesn't exist. This erodes trust more than an honest assessment would.

**What the user needs:** A direct, honest `weakMatchReason`. No false optimism. `contextPrompt` is null — its absence on a low score is itself a signal that the gap is real.

---

## Graph architecture

Score branching is implemented as conditional edges in the LangGraph, not as a single prompt that self-routes. The score is deterministic once `scoreMatch` returns it — routing on that score is a graph responsibility, not an LLM responsibility.

### Node structure

```
parseResume ──┐
              ├──► scoreMatch ──► [conditional edge] ──► analyzeStrongMatch             (75+)
parseJob    ──┘                                      ──► analyzeNarrativeGap            (60–75)
                                                     ──► analyzeArchetypeGap            (50–70, archetype known)
                                                     ──► awaitHuman                     (< 60, no humanContext)
                                                     ──► analyzeSkepticalReconciliation (< 60, humanContext present)

awaitHuman ──► rescore ──► analyzeSkepticalReconciliation

All analysis nodes ──► END
```

### Why this structure

Each analysis node calls `buildGapAnalysisChain` with a different prompt template. The deterministic routing lives in the graph. The prompt specialisation lives in the chain. Each node is independently testable and becomes its own eval target in the eval harness. This is why a single prompt with conditional instruction blocks was rejected — it asks the model to self-route on a score it is also computing, which is circular.

### Conditional edge logic

```
weakMatch = score < 60  (derived here, not from LLM)

if score >= 75:
  → analyzeStrongMatch

elif score >= 50 and archetypeContext is not null:
  → analyzeArchetypeGap

elif score >= 60:
  → analyzeNarrativeGap

elif humanContext is absent:
  → awaitHuman

else:
  → analyzeSkepticalReconciliation
```

Score ranges overlap (50–70 for Scenario 3, 60–75 for Scenario 2). The archetype check is evaluated before the `score >= 60` branch — if an archetype is known and score is 50–70, `analyzeArchetypeGap` takes priority over `analyzeNarrativeGap`. The prose description is authoritative; the code must follow this order.

### rescore node

The existing `rescore` node routes to `analyzeSkepticalReconciliation` after HITL resume. humanContext is in state at that point, so the skeptical reconciliation path is always correct after a human interrupt.

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
- `contextPrompt` is a response payload field only — it does not trigger a second HITL interrupt in any flow

### `weakMatch` (changed — now derived)
Previously an LLM output field. Now derived deterministically as `score < 60` in the `scoreMatch` node after parsing. The LLM is not asked to compute this. The `superRefine` cross-field validation in `MatchSchema` is removed — `weakMatchReason` presence validation moves to the node layer.

### `weakMatchReason` (unchanged in position, clarified in intent)
Remains an LLM output field. Only meaningful when `score < 60`. Should be honest and direct in Scenario 5, and explain the specific context gap in Scenario 4. Not motivational copy.

### `resumeAdvice` (behaviour change)
In Scenario 1, the model is explicitly permitted to return an empty array. Sparse advice on a strong match is correct behaviour, not a failure.

---

## Upfront human context — UI change

### Current behaviour
The Chrome extension popup collects resume text and job description only. Human context is only collected after a low score triggers HITL.

### Proposed behaviour
Add an optional free-text field to the extension popup before the first run:

> "Anything about your background this resume doesn't show? (optional)"

Maps to the existing `humanContext` field in `/api/match/run` — no backend schema change required.

### HITL path after this change
HITL fires only when `score < 60` AND `humanContext` is absent. This changes from the current behaviour where HITL fires on `score < 60` unconditionally.

If `humanContext` was provided upfront and score is still low, the graph routes directly to `analyzeSkepticalReconciliation`. `contextPrompt` in the result tells the user what specific follow-up is needed — no interrupt.

---

## Resolved decisions

**contextPrompt and HITL:** `contextPrompt` is a payload field only. No second interrupt in any flow. Surfaces in UI inline with result.

**contextPrompt in interrupted SSE event:** Included in the interrupted event payload when HITL fires. The scoring chain runs before routing — `contextPrompt` may already be in state when the interrupt fires. Including it lets the frontend show the user specifically what to provide rather than a generic prompt. The runner interrupted event emits `{ score, threadId, contextPrompt }` rather than `{ score, threadId }` only.

**Score branching implementation:** Separate graph nodes per scenario. Not a single prompt with conditional instruction blocks. Routing is a graph responsibility — the score is known before routing happens.

**Scenario 3 fallback:** When archetype context is unavailable, the conditional edge skips `analyzeArchetypeGap` and routes to `analyzeNarrativeGap`. Silent fallback, no UI indication.

**sourceRole/targetRole vocabulary:** Free text extracted by parse nodes with LLM instructed to use a controlled vocabulary of known values. Exact-match lookup against registry. Mismatches return null from `buildContext` and degrade gracefully. See `prd-archetype-system.md`.

---

## Open questions

- Is there a minimum score threshold (e.g. < 20) below which we skip all analysis nodes and return early with just `weakMatchReason`?
- Multi-model routing per node is a future concern — each analysis node is a candidate for a different model. `analyzeStrongMatch` is a small/fast model candidate. `analyzeSkepticalReconciliation` is a stronger model candidate. Implemented with eval harness PRD.

---

## Out of scope for this PRD

- Specific prompt copy for each analysis node (owned by implementation, validated by eval harness)
- Model selection per node (designed here, implemented with eval harness PRD)
- Archetype injection details (see `prd-archetype-system.md`)