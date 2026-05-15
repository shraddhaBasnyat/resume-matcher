# Backend — Claude Context (New Architecture)

This file describes the target architecture for the backend sprint.
Compare against the existing root-level CLAUDE.md to understand what has changed.

## Graph topology

```
raw resumeText + jobText
        ↓
atsAnalysis ──────────────────────── analyzeFit    (parallel, both read raw text directly)
        ↓                                  ↓
generateTerminologyFixes            routeVerdicts
(fans out from atsAnalysis,         (deriveScenario — pure function, no LLM)
 runs parallel to fit path)               ↓
        ↓                     one verdict node fires:
        └──────────────────── analyzeStrongMatch | analyzeNarrativeGap | analyzeSkepticalReconciliation
                                          ↓
                                         END
```

## What changed from the old graph

`parseResume` and `parseJob` nodes are deleted. Both nodes are removed from the graph entirely. `analyzeFit` and `atsAnalysis` read raw `resumeText` and `jobText` directly from graph state.

`scoreMatch` is renamed to `analyzeFit`. It now produces the battle card, scenario summary, and structured `fitAnalysis` for verdict nodes.

`atsAnalysis` output schema significantly expanded — now covers three layers (machine parsing, knockout questions, recruiter search) rather than a single score and keyword list.

`generateTerminologyFixes` is a new node. It fans out from `atsAnalysis` output and runs in parallel with the fit analysis path. It produces `terminologyDiffs[]` — exact before/after rewrites of resume sentences — automatically, without user prompt.

`contextPrompt` moves out of `analyzeFit` and into `analyzeSkepticalReconciliation`.

---

## Node responsibilities

### `analyzeFit`

Reads: `resumeText`, `jobText` (raw text)

Single LLM call. Cold, forensic assessment of the human match. No mechanical advice — keyword lists, formatting observations, and terminology gaps belong entirely to `atsAnalysis` and `generateTerminologyFixes`.

LLM output schema (all fields required):
```ts
{
  fitScore: number
  headline: string              // role-facing — encodes both match AND gap if one exists
                                // e.g. for 72: "Strong distributed systems background,
                                // domain gap from storefront to fulfillment"
                                // NOT a candidate summary or job title
  battleCardBullets: {          // structured bullets — each has:
    requirement: string         //   what the role requires (role-first)
    evidence: string            //   candidate's evidence against that requirement
    verdict: 'hard_gap'         //   hard_gap: genuinely missing qualification
           | 'framing_gap'      //   framing_gap: experience exists, framing misses the signal
           | 'terminology_gap'  //   terminology_gap: same skill, different vocabulary
           | 'strong_match'     //   strong_match: candidate meets or exceeds requirement
  }[]                           // Must collectively explain why score is not higher.
                                // If fitScore < 85, at least one bullet must be hard_gap,
                                // framing_gap, or terminology_gap.
  fitScenarioSummary: string    // human fit picture in isolation — factual paragraph,
                                // no ATS context, no scenario tone yet. Read by verdict
                                // nodes which synthesise this with atsScenarioSummary
                                // into the final closingSummary.
  sourceRole: string
  targetRole: string
  fitAnalysis: {
    careerTrajectory: string
    keyStrengths: string[]
    experienceGaps: string[]
    weakMatchReason: string     // REQUIRED — use "NONE" if fitScore >= 50
  }
  fitAha: string                // one sentence — sharpest human fit observation
                                // pure observation only, emitted in node_done payload
}
```

Node logic after LLM call:
```ts
matchResult.weakMatch = matchResult.fitScore < 50
matchResult.fitAnalysis.weakMatchReason =
  result.fitAnalysis.weakMatchReason === "NONE"
    ? null
    : result.fitAnalysis.weakMatchReason
```

Critical prompt instruction: `weakMatchReason` is always required. If `fitScore >= 50`, return the string "NONE". Do not omit the field. Conditional fields are unreliable and will be missed.

---

### `atsAnalysis`

Reads: `resumeText`, `jobText` (raw text)

Single LLM call. Mechanical and literal — no semantic inference. Covers three distinct layers of ATS evaluation.

Prompt framing: the LLM simultaneously plays a recruiter configuring knockout questions before posting the role, and a recruiter running a Boolean search to find candidates. This framing produces more realistic output than asking for "ATS analysis" abstractly.

LLM output schema:
```ts
{
  atsScore: number              // 0–100, composite weighted 60% L3 / 25% L2 / 15% L1

  machineParsing: {             // Layer 1 — formatting
    likelyTwoColumn: boolean
    hasTablesOrGraphics: boolean
    contactInHeaderFooter: boolean
    inconsistentDateFormats: boolean
    nonStandardBullets: boolean
    missingSections: string[]
    flags: string[]             // human-readable summary of issues found
  }

  knockoutQuestions: {          // Layer 2 — hard filters
    question: string
    inferredFromJD: string
    candidatePasses: boolean | null
    riskLevel: "pass" | "at_risk" | "unknown"
  }[]

  recruiterSearch: {            // Layer 3 — keyword discoverability
    likelySearchQuery: string
    termsPresentInResume: string[]
    termsMissingFromResume: string[]
    terminologyMismatches: {
      resumeUses: string
      jdExpects: string
    }[]
  }

  machineRanking: string[]      // keyword gap summary strings for UI

  atsScenarioSummary: string    // machine picture in isolation — 2–3 sentences,
                                // plain-language synthesis of what the three layers
                                // found collectively. No fit context. No scenario tone.
                                // e.g. "Resume is parseable with minor formatting issues.
                                // One knockout risk around production deployment language.
                                // Missing 3 of 4 key search terms the recruiter would
                                // filter on." Read by verdict nodes for closingSummary.

  atsAha: string                // one sentence — most important ATS observation
                                // pure finding only — no fix language, no card content
                                // emitted in node_done SSE payload
}
```

Layer 1 limitation: the LLM infers formatting problems from text artifacts. It cannot detect two-column layout from plain linearized text. LLM inference is the Phase 1 approach; programmatic PDF/DOCX file analysis is the Phase 2 upgrade path.

---

### `generateTerminologyFixes`

Reads: `resumeText`, `atsAnalysis.recruiterSearch.terminologyMismatches[]`

New node. Single focused LLM call. Fires immediately after `atsAnalysis` completes. Finds the exact sentence in the resume for each terminology mismatch and rewrites only that sentence — no other content changes.

LLM output schema:
```ts
{
  terminologyDiffs: {
    location: string      // e.g. "Senior Engineer @ Acme — bullet 2"
    swapLabel: string     // e.g. "agent orchestration → agentic systems"
    before: string        // exact original sentence from resume
    after: string         // rewritten sentence with swap applied
  }[]
}
```

This node runs automatically — it does not require user input. The output is surfaced directly in Station 3 of the ATS panel as inline before/after diffs. For the invisible_expert scenario, seeing their own sentence with the fix already applied is the product's primary trust-building moment.

---

### `routeVerdicts`

Pure function. No LLM. Reads `fitScore` and `atsScore`. Writes `scenarioId`.

```ts
function deriveScenario(fitScore: number, atsScore: number | null): ScenarioId {
  if (fitScore >= 75 && (atsScore === null || atsScore >= 75)) return "confirmed_fit"
  if (fitScore >= 75 && atsScore !== null && atsScore < 75)   return "invisible_expert"
  if (fitScore >= 50)                                          return "narrative_gap"
  return "honest_verdict"
}
```

---

### `analyzeStrongMatch`

Fires for: `confirmed_fit` and `invisible_expert`
Reads: `fitScore`, `scenarioId`, `fitAnalysis`, `atsProfile`, `terminologyDiffs`, `fitScenarioSummary`, `atsScenarioSummary`

For `confirmed_fit`: the LLM call produces interview preparation advice — what to lead with, what questions to expect, where the interviewer may probe harder. Not ATS remediation. `watchOutFor` is honest — confirmed fit does not mean perfect fit, and naming the thinner areas is more useful than pretending they don't exist.

For `invisible_expert`: fit analysis confirms qualification. ATS panel and `terminologyDiffs` already contain the mechanical fix. The verdict node provides human framing only — it does not restate terminology gaps already shown in Station 3.

Output schema:
```ts
// confirmed_fit
{
  scenarioId: "confirmed_fit"
  fitAdvice: {
    leadWithThese: string[]         // 2-3 specific experiences to open the interview with
    expectTheseQuestions: string[]  // likely questions based on this JD + this candidate
    watchOutFor: string[]           // 1-2 areas where interviewer may probe harder
  }
  verdictAha: string
  closingSummary: string            // brief and validating
}

// invisible_expert
{
  scenarioId: "invisible_expert"
  fitAdvice: {
    standoutStrengths: string[]
    atsRealityCheck: string[]
    terminologySwaps: string[]
    keywordsToAdd: string[]
  }
  verdictAha: string
  closingSummary: string        // names the two-signal contrast explicitly
                                // e.g. "Strong human match, invisible to filters —
                                // the terminology fixes in Station 3 close the gap
                                // without changing a single qualification."
}
```

---

### `analyzeNarrativeGap`

Fires for: `narrative_gap`
Reads: `fitScore`, `scenarioId`, `fitAnalysis`, `fitScenarioSummary`, `atsScenarioSummary`

The ATS panel may be entirely clean for this scenario. The problem is the career story doesn't obviously point at this role. This node owns the scenario entirely — no overlap with ATS findings.

Output schema:
```ts
{
  scenarioId: "narrative_gap"
  fitAdvice: {
    transferableStrengths: string[]
    reframingSuggestions: string[]
    missingSkills: string[]
  }
  verdictAha: string
  closingSummary: string        // closes with the reframe opportunity
                                // names the experience-is-right-framing-is-wrong insight
                                // explicitly. If ATS is also clean, notes it: "the machine
                                // can read you fine — the human reader needs a different
                                // story."
}
```

---

### `analyzeSkepticalReconciliation`

Fires for: `honest_verdict`
Reads: `fitScore`, `scenarioId`, `fitAnalysis`, `hitlFired`, `fitScenarioSummary`, `atsScenarioSummary`

Owns `contextPrompt`. First pass: if context would change assessment, generate question → `interrupt()` → set `hitlFired: true`. If no context would help, produce `fitAdvice` directly. Second pass: produce `fitAdvice` with `acknowledgement` if context shifted the assessment. No second interrupt.

Output schema:
```ts
{
  scenarioId: "honest_verdict"
  fitAdvice: {
    honestAssessment: string[]
    closingSteps: string[]
    acknowledgement: string[] | null
  }
  verdictAha: string            // first pass: explains why HITL is needed
                                // second pass: reflects whether context shifted assessment
  closingSummary: string        // the most emotionally important piece of writing in the
                                // output — direct and respectful, mentor not rejection
                                // machine. Tone: clarity over comfort, never cruelty.
                                // If HITL fired and context shifted: acknowledges it here.
                                // This is the last thing a user with a hard verdict reads.
}
```

---

## Internal graph state — field ownership

| Field | Written by | Read by |
|---|---|---|
| `resumeText` | request body | `analyzeFit`, `atsAnalysis`, `generateTerminologyFixes` |
| `jobText` | request body | `analyzeFit`, `atsAnalysis` |
| `fitScore` | `analyzeFit` | `routeVerdicts`, all verdict nodes |
| `weakMatch` | `analyzeFit` (derived) | `routeVerdicts` |
| `headline` | `analyzeFit` | runner |
| `battleCardBullets` | `analyzeFit` | runner |
| `fitScenarioSummary` | `analyzeFit` | verdict nodes |
| `sourceRole` | `analyzeFit` | `detectArchetype` (future) |
| `targetRole` | `analyzeFit` | `detectArchetype` (future) |
| `fitAnalysis` | `analyzeFit` | all verdict nodes |
| `fitAnalysis.weakMatchReason` | `analyzeFit` (normalised) | `analyzeSkepticalReconciliation`, runner |
| `fitAha` | `analyzeFit` | runner (emitted in `node_done`) |
| `atsScore` | `atsAnalysis` | `routeVerdicts` |
| `atsProfile` | `atsAnalysis` | `analyzeStrongMatch`, runner |
| `atsScenarioSummary` | `atsAnalysis` | verdict nodes |
| `atsAha` | `atsAnalysis` | runner (emitted in `node_done`) |
| `terminologyDiffs` | `generateTerminologyFixes` | runner, `analyzeStrongMatch` |
| `verdictAha` | verdict nodes | runner (emitted in `node_done`) |
| `closingSummary` | verdict nodes | runner (remapped to `scenarioSummary.text`) |
| `scenarioId` | `routeVerdicts` | all verdict nodes, runner |
| `fitAdvice` | verdict nodes | runner |
| `hitlFired` | `analyzeSkepticalReconciliation` | `analyzeSkepticalReconciliation` |
| `humanContext` | HITL resume endpoint | `analyzeSkepticalReconciliation` |
| `contextPrompt` | `analyzeSkepticalReconciliation` | runner |

---

## Public API — PublicMatchResponse

Emitted by `runner.ts` on the `completed` SSE event under `result`. Validated by `PublicMatchResponseSchema` (Zod) before emission. Internal fields never leave the server.

```ts
{
  scenarioId: ScenarioId

  fitScore: number

  battleCard: {
    headline: string
    bullets: {
      requirement: string
      evidence: string
      verdict: 'hard_gap' | 'framing_gap' | 'terminology_gap' | 'strong_match'
    }[]
  }

  fitAdvice: {
    key: string
    bulletPoints: string[]
  }[]

  atsProfile: {
    atsScore: number | null

    machineParsing: {
      flags: string[]
      likelyTwoColumn: boolean
      hasTablesOrGraphics: boolean
      contactInHeaderFooter: boolean
      inconsistentDateFormats: boolean
      nonStandardBullets: boolean
      missingSections: string[]
    }

    knockoutQuestions: {
      question: string
      inferredFromJD: string
      riskLevel: "pass" | "at_risk" | "unknown"
    }[]

    recruiterSearch: {
      likelySearchQuery: string
      termsPresentInResume: string[]
      termsMissingFromResume: string[]
    }

    machineRanking: string[]
  }

  terminologyDiffs: {
    location: string
    swapLabel: string
    before: string
    after: string
  }[]

  scenarioSummary: {
    text: string              // populated from closingSummary (verdict node output)
                              // scenario-aware synthesis of fitScenarioSummary +
                              // atsScenarioSummary — the closing statement the user
                              // reads at the bottom of the report
  }

  threadId: string
  _meta: { durationMs: number }
}
```

`scenarioSummary.text` is remapped from `closingSummary` (verdict node). Internal draft
fields `fitScenarioSummary` and `atsScenarioSummary` are never emitted.

---

## `mapFitAdvice` — discriminated union to flat array

Lives in `runner.ts`. Produces `{ key, items }` objects — `bulletPoints` is gone. Three primitive item types defined in `backend/src/types/fit-advice.ts`:

- `EvidenceItem`: `{ label, detail, confidence: "high" | "medium" }` — `confidence` is deterministic (index 0 = "high", rest = "medium"), NOT LLM-generated
- `ReframingItem`: `{ before, after, reason }` — fully LLM-generated
- `TaggedItem`: `{ severity: "material" | "notable", text }` — `severity` is deterministic (first half = "material", second half = "notable"), NOT LLM-generated

Two helper functions in `runner.ts`:
- `toEvidenceItem(text, index)` — splits on ` — `, derives `confidence` from index
- `toTaggedItem(text, index, total)` — derives `severity` from position relative to `Math.ceil(total / 2)`

Mappings:
```ts
// confirmed_fit — all EvidenceItem
{ key: "lead_with_these",        items: fitAdvice.leadWithThese.map(toEvidenceItem)        }
{ key: "expect_these_questions", items: fitAdvice.expectTheseQuestions.map(toEvidenceItem) }
{ key: "watch_out_for",          items: fitAdvice.watchOutFor.map(toEvidenceItem)          }

// invisible_expert
{ key: "standout_strengths", items: fitAdvice.standoutStrengths.map(toEvidenceItem) }  // EvidenceItem
{ key: "ats_reality_check",  items: fitAdvice.atsRealityCheck.map(toEvidenceItem)   }  // EvidenceItem
{ key: "terminology_swaps",  items: fitAdvice.terminologySwaps                      }  // ReframingItem — pass through
{ key: "keywords_to_add",    items: fitAdvice.keywordsToAdd.map(toTaggedItem)       }  // TaggedItem

// narrative_gap
{ key: "transferable_strengths", items: fitAdvice.transferableStrengths.map(toEvidenceItem) }  // EvidenceItem
{ key: "reframing_suggestions",  items: fitAdvice.reframingSuggestions                      }  // ReframingItem — pass through
{ key: "missing_skills",         items: fitAdvice.missingSkills.map(toTaggedItem)           }  // TaggedItem

// honest_verdict
{ key: "honest_assessment", items: fitAdvice.honestAssessment.map(toEvidenceItem)  }  // EvidenceItem
{ key: "closing_steps",     items: fitAdvice.closingSteps.map(toTaggedItem)        }  // TaggedItem
{ key: "acknowledgement",   items: fitAdvice.acknowledgement.map(toEvidenceItem)   }  // EvidenceItem (optional)
```

---

## Runner whitelist — internal fields never emitted

`fitAnalysis`, `fitScenarioSummary`, `atsScenarioSummary`, `closingSummary` (remapped to
`scenarioSummary.text`), `headline` (remapped to `battleCard.headline`), `battleCardBullets`
(remapped to `battleCard.bullets`), `atsAha`, `fitAha`, `verdictAha`, `sourceRole`,
`targetRole`, `weakMatch`, `humanContext`, `hitlFired`, `contextPrompt`

`PublicMatchResponseSchema.safeParse()` runs on the mapped result before emission. If validation fails → emit error event, never emit malformed data.

---

## Scenarios reference

| scenarioId | fitScore | atsScore | Verdict node |
|---|---|---|---|
| `confirmed_fit` | >= 75 | >= 75 or null | `analyzeStrongMatch` |
| `invisible_expert` | >= 75 | < 75 | `analyzeStrongMatch` |
| `narrative_gap` | 50–74 | any | `analyzeNarrativeGap` |
| `honest_verdict` | < 50 | any | `analyzeSkepticalReconciliation` |

---

## SSE events

| Event | Payload |
|---|---|
| `meta` | `threadId`, `rootRunId`, `runStartTime` |
| `node_start` | `node`, `timestamp` |
| `node_done` | `node`, `durationMs`, `timestamp` |
| `completed` | `result: PublicMatchResponse` |
| `interrupted` | `fitScore`, `threadId`, `contextPrompt` |
| `error` | `error`, `message` |

---

## Auth

Middleware lives at `src/middleware/requireAuth.ts`. Uses `jose` (`createRemoteJWKSet` +
`jwtVerify`) for RS256 JWKS verification — no shared secret. The JWKS endpoint is derived
from `SUPABASE_URL`: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Only `SUPABASE_URL`
is required; `SUPABASE_JWT_SECRET` is not used.

Applied inline at registration in `src/index.ts` to all routes except `/api/health`:

```ts
app.use("/api/match/run",    requireAuth, matchRunRouter);
app.use("/api/match/resume", requireAuth, matchResumeRouter);
app.use("/api/match/accept", requireAuth, matchAcceptRouter);
app.use("/api/match/cancel", requireAuth, matchCancelRouter);
app.use("/api/parse-resume", requireAuth, parseResumeRouter);
app.use("/api/health", healthRouter);  // intentionally public — do not add requireAuth
```

On success `requireAuth` attaches the decoded payload to `req.user` (typed as `JWTPayload`
from `jose`). `req.user.sub` contains the user's UUID and is available in every protected
route handler.

**Future:** `requireRunLimit` middleware for `match/run` only — checks
`profiles.run_limit` in Supabase, returns 429 if exceeded. Separate from auth concern;
sits after `requireAuth` in the chain.

---

## Schema conventions (unchanged)

`safeParse` → `logValidationFailure` → `throw validated.error` on every chain output. Never use `Schema.parse({ ...result })` — spreading null/undefined throws TypeError that masks the real Zod error. Nullable string fields: `z.string().min(1).nullable()` not `z.string().nullable()`. `weakMatch` and `weakMatchReason` (after normalisation) are derived in the node — not LLM output fields.

---

## Testing conventions (unchanged)

Top-level `vi.mock()` only. All model mocks must include `bind: vi.fn().mockReturnThis()`. `RootRunCapture` must be a regular function declaration, not an arrow function. Every chain must have a validation failure test asserting `ZodError` + `logValidationFailure` called with `rawOutput` and `nodeName`. `buildMockModel` in `scoring-graph.test.ts` must include LLM schema for every verdict node. Use `expect.objectContaining({ nodeName: "...", rawOutput: invalidOutput })` on validation failure assertions.

---

## Temperature per node

No `.bind({ temperature: 0 })` on any node currently — removed due to TypeScript issues. All nodes run at model default temperature until revisited.

---

## What to delete

- `backend/src/graphs/scoring/nodes/parseResume.ts`
- `backend/src/graphs/scoring/nodes/parseJob.ts`
- All imports and graph edges referencing `parseResume` and `parseJob`
- `scoreMatch` node file — replaced by `analyzeFit`
- Any chain files for `scoreMatch`
- `MatchResult` fields that no longer exist: `matchedSkills`, `missingSkills`, `narrativeAlignment`, `contextPrompt` (top-level), `weakMatchReason` (top-level — moved into `fitAnalysis`)

## What to add

- `backend/src/graphs/scoring/nodes/analyzeFit.ts`
- `backend/src/graphs/scoring/nodes/generateTerminologyFixes.ts`
- Updated `atsAnalysis` node with three-layer output schema
- `PublicMatchResponseSchema` Zod schema — `backend/src/types/public-response.ts`
- `mapFitAdvice` function in `runner.ts`
- `buildPublicResponse` function in `runner.ts`

## What to update

- `frontend/lib/types/api.ts` — replace `MatchResponse` with `PublicMatchResponse` shape including `terminologyDiffs` and full `atsProfile`
- `frontend/components/resume-init/accordion-config.ts` — update keys per scenario
- `frontend/components/resume-init/MainResultsStage.tsx` — wire to live data, surface ATS three-layer panel and `terminologyDiffs` diffs in Station 3
- `frontend/hooks/useMatchRunner.ts` — result type updates
- Delete `frontend/components/resume-init/dummy-data.ts`
- Delete `frontend/app/page.tsx` (legacy)
- Delete `frontend/components/match/` (legacy, entire directory)

## Type Contract Architecture

Three-layer pattern for LLM-backed products:

Chain Zod schema (internal, prompt-coupled)
↓ mapped in runner.ts
PublicMatchResponseSchema (contract — source of truth)
↓ manually mirrored
frontend/lib/types/api.ts (frontend types)

### Shared primitive types

Defined in `backend/src/types/fit-advice.ts`, mirrored in `frontend/lib/types/api.ts`. If either changes, both must be updated. `PublicMatchResponseSchema.safeParse()` is the runtime enforcer.

| Type | Shape | Used by |
|---|---|---|
| `EvidenceItem` | `{ label, detail, confidence: 'high' \| 'medium' }` | `EvidenceListBody` |
| `ReframingItem` | `{ before, after, reason }` | `BeforeAfterBody` |
| `TaggedItem` | `{ severity: 'material' \| 'notable', text }` | `TaggedListBody` |

### View-model transform rule

`mapFitAdvice` in `runner.ts` is the view-model mapper — it converts internal graph state into the public API shape. Deterministic UI concerns belong here, not in chain schemas and not in the frontend.

Current deterministic derivations in `mapFitAdvice`:
- `EvidenceItem.confidence` — derived from array index: `index === 0 ? 'high' : 'medium'`
- `TaggedItem.severity` — derived from position: first half of array = `'material'`, second half = `'notable'`

**Rule:** If a field's value can be derived without LLM reasoning, derive it in `mapFitAdvice`. Never ask the LLM to produce enum values that are purely presentational. Never move this derivation to the frontend — `PublicMatchResponseSchema.safeParse()` must be able to validate the final shape.

### Why not a shared package?

Backend and frontend are separate packages. A shared types package is the long-term upgrade path. For now, `PublicMatchResponseSchema.safeParse()` in `runner.ts` acts as the runtime enforcer — if the backend produces a shape the frontend doesn't expect, validation fails before emission and an error event is sent instead of malformed data.

### Rule

Never inline these shapes in chain files. Always import from `backend/src/types/fit-advice.ts`. Never declare them independently — if a shape needs to change, change it in `fit-advice.ts` and update `frontend/lib/types/api.ts` to match.