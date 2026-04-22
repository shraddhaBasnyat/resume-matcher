Backend — Claude Context (New Architecture)
This file describes the target architecture for the backend sprint.
Compare against the existing root-level CLAUDE.md to understand what has changed.

Graph topology
raw resumeText + jobText
        ↓
atsAnalysis ──────────── analyzeFit    (parallel, both read raw text directly)
        ↓                      ↓
        └──── routeVerdicts ───┘
              (deriveScenario — pure function, no LLM)
                    ↓
            one verdict node fires:
            analyzeStrongMatch | analyzeNarrativeGap | analyzeSkepticalReconciliation
                    ↓
                   END
What changed from the old graph

parseResume and parseJob nodes are deleted. Both nodes are removed from the
graph entirely. analyzeFit and atsAnalysis read raw resumeText and jobText
directly from graph state.
scoreMatch is renamed to analyzeFit. It now also produces the battle card,
scenario summary, and structured fitAnalysis for verdict nodes.
atsAnalysis remains but its output schema changes — see below.
contextPrompt moves out of analyzeFit and into analyzeSkepticalReconciliation.


Node responsibilities
analyzeFit
Reads: resumeText, jobText (raw text — no parsed objects)
Single LLM call. Cold, forensic assessment. No advice — facts only.
LLM output schema (all fields required — no optional fields):
ts{
  fitScore: number              // 0–100
  headline: string              // battle card headline — who this person is relative to this role
  battleCardBullets: string[]   // 3–5 supporting bullets for the battle card
  scenarioSummary: string       // user-facing prose summary of the fit assessment
  sourceRole: string            // candidate's current/most recent role
  targetRole: string            // role they are applying for

  fitAnalysis: {
    careerTrajectory: string    // where they've been and where they're heading
    keyStrengths: string[]      // specific strengths relative to this role
    experienceGaps: string[]    // specific gaps relative to this role
    weakMatchReason: string     // REQUIRED — use "NONE" if fitScore >= 50
  }
}
Node logic after LLM call:
ts// weakMatch derived deterministically — not LLM output
matchResult.weakMatch = matchResult.fitScore < 50

// normalise sentinel value
matchResult.fitAnalysis.weakMatchReason =
  result.fitAnalysis.weakMatchReason === "NONE"
    ? null
    : result.fitAnalysis.weakMatchReason
Critical prompt instruction:
weakMatchReason is always required. If fitScore >= 50, return the string "NONE".
Do not omit the field. The LLM must always populate it — conditional fields are
unreliable and will be missed.

atsAnalysis
Reads: resumeText, jobText (raw text)
Single LLM call. Mechanical, literal. Keyword and terminology analysis only.
machineParsing is a TODO — populated with placeholder data for now.
LLM output schema:
ts{
  atsScore: number              // 0–100
  machineRanking: string[]      // keyword gaps, terminology mismatches vs job description
}
Node logic after LLM call:
ts// machineParsing is TODO — hardcoded placeholder, replace with programmatic analysis
atsResult.machineParsing = [
  "// TODO: replace with programmatic resume parsing analysis"
]

routeVerdicts
Pure function. No LLM. Reads fitScore and atsScore. Writes scenarioId.
tsfunction deriveScenario(fitScore: number, atsScore: number | null): ScenarioId {
  if (fitScore >= 75 && (atsScore === null || atsScore >= 75)) return "confirmed_fit"
  if (fitScore >= 75 && atsScore !== null && atsScore < 75)   return "invisible_expert"
  if (fitScore >= 50)                                          return "narrative_gap"
  return "honest_verdict"
}

analyzeStrongMatch
Fires for: confirmed_fit and invisible_expert
Reads: fitScore, scenarioId, fitAnalysis, atsProfile
No temperature override.
Output schema:
ts// confirmed_fit — empty fitAdvice, sparse is correct
{
  scenarioId: "confirmed_fit"
  fitAdvice: []
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
}

analyzeNarrativeGap
Fires for: narrative_gap
Reads: fitScore, scenarioId, fitAnalysis
No temperature override.
Output schema:
ts{
  scenarioId: "narrative_gap"
  fitAdvice: {
    transferableStrengths: string[]
    reframingSuggestions: string[]
    missingSkills: string[]
  }
}

analyzeSkepticalReconciliation
Fires for: honest_verdict
Reads: fitScore, scenarioId, fitAnalysis, hitlFired
No temperature override.
Owns contextPrompt — generates it here, not inherited from analyzeFit.
First pass (hitlFired === false):

If the gap is real and more context would change the assessment:
generate contextPrompt (the specific question) → call interrupt() → set hitlFired: true
If no context would help: produce fitAdvice directly, no interrupt

Second pass (hitlFired === true):

humanContext is in state from HITL resume
Produce fitAdvice with acknowledgement if context changed the assessment
No second interrupt regardless of score

Output schema:
ts{
  scenarioId: "honest_verdict"
  fitAdvice: {
    honestAssessment: string[]
    closingSteps: string[]
    acknowledgement: string[] | null    // populated if HITL fired and context was useful
  }
}

Internal graph state — field ownership
FieldWritten byRead byresumeTextrequest bodyanalyzeFit, atsAnalysisjobTextrequest bodyanalyzeFit, atsAnalysisfitScoreanalyzeFitrouteVerdicts, all verdict nodesweakMatchanalyzeFit (derived)routeVerdictsheadlineanalyzeFitrunnerbattleCardBulletsanalyzeFitrunnerscenarioSummaryanalyzeFitrunnersourceRoleanalyzeFitdetectArchetype (future)targetRoleanalyzeFitdetectArchetype (future)fitAnalysisanalyzeFitall verdict nodesfitAnalysis.weakMatchReasonanalyzeFit (normalised in node)analyzeSkepticalReconciliation, runneratsScoreatsAnalysisrouteVerdictsatsProfileatsAnalysisanalyzeStrongMatch, runnerscenarioIdrouteVerdictsall verdict nodes, runnerfitAdviceverdict nodesrunnerhitlFiredanalyzeSkepticalReconciliationanalyzeSkepticalReconciliationhumanContextHITL resume endpointanalyzeSkepticalReconciliation

Public API — PublicMatchResponse
Emitted by runner.ts on the completed SSE event under result.
Validated by PublicMatchResponseSchema (Zod) before emission.
Internal fields never leave the server.
ts{
  scenarioId: ScenarioId

  fitScore: number

  battleCard: {
    headline: string
    bulletPoints: string[]
  }

  fitAdvice: {
    key: string
    bulletPoints: string[]
  }[]                           // empty array for confirmed_fit

  atsProfile: {
    atsScore: number | null
    machineParsing: string[]    // TODO: programmatic analysis — placeholder for now
    machineRanking: string[]    // real data from atsAnalysis LLM call
  }

  scenarioSummary: {
    text: string
  }

  threadId: string
  _meta: { durationMs: number }
}
mapFitAdvice — discriminated union → flat array
Lives in runner.ts. The one place where verdict node output maps to public shape.
ts// confirmed_fit
[]

// invisible_expert
[
  { key: "standout_strengths",  bulletPoints: fitAdvice.standoutStrengths },
  { key: "ats_reality_check",   bulletPoints: fitAdvice.atsRealityCheck   },
  { key: "terminology_swaps",   bulletPoints: fitAdvice.terminologySwaps  },
  { key: "keywords_to_add",     bulletPoints: fitAdvice.keywordsToAdd     },
]

// narrative_gap
[
  { key: "transferable_strengths", bulletPoints: fitAdvice.transferableStrengths },
  { key: "reframing_suggestions",  bulletPoints: fitAdvice.reframingSuggestions  },
  { key: "missing_skills",         bulletPoints: fitAdvice.missingSkills         },
]

// honest_verdict
[
  { key: "honest_assessment", bulletPoints: fitAdvice.honestAssessment },
  { key: "closing_steps",     bulletPoints: fitAdvice.closingSteps     },
  ...(fitAdvice.acknowledgement
    ? [{ key: "acknowledgement", bulletPoints: fitAdvice.acknowledgement }]
    : []),
]
Runner whitelist — internal fields never emitted
The following fields exist in graph state but are never included in PublicMatchResponse:
fitAnalysis, headline (remapped to battleCard.headline),
battleCardBullets (remapped to battleCard.bulletPoints),
scenarioSummary (remapped to scenarioSummary.text),
sourceRole, targetRole, weakMatch, weakMatchReason,
matchedSkills, missingSkills, narrativeAlignment, humanContext,
hitlFired, contextPrompt
PublicMatchResponseSchema.safeParse() runs on the mapped result before emission.
If validation fails → emit error event, never emit malformed data.

Schema conventions (unchanged from existing CLAUDE.md)

safeParse → logValidationFailure → throw validated.error on every chain output
Never use Schema.parse({ ...result }) — spreading null/undefined throws TypeError
that masks the real Zod error
Nullable string fields: z.string().min(1).nullable() not z.string().nullable()
weakMatch and weakMatchReason (after normalisation) are derived in the node —
not LLM output fields


Testing conventions (unchanged from existing CLAUDE.md)

Top-level vi.mock() only — never vi.doMock()
All model mocks must include bind: vi.fn().mockReturnThis()
RootRunCapture must be a regular function declaration, not an arrow function
Every chain must have a validation failure test asserting ZodError +
logValidationFailure called with rawOutput and nodeName
buildMockModel in scoring-graph.test.ts must include LLM schema for every
verdict node — add new schemas there when adding new nodes
Use expect.objectContaining({ nodeName: "...", rawOutput: invalidOutput })
on validation failure assertions


Temperature per node (updated)
No .bind({ temperature: 0 }) on any node currently — removed due to TypeScript
issues. All nodes run at model default temperature until this is revisited.

What to delete

backend/src/graphs/scoring/nodes/parseResume.ts
backend/src/graphs/scoring/nodes/parseJob.ts
All imports and graph edges referencing parseResume and parseJob
scoreMatch node file — replaced by analyzeFit
Any chain files for scoreMatch
MatchResult fields that no longer exist:
matchedSkills, missingSkills, narrativeAlignment, contextPrompt (top-level),
weakMatchReason (top-level — moved into fitAnalysis)

What to add

backend/src/graphs/scoring/nodes/analyzeFit.ts
Updated atsAnalysis node with new output schema
PublicMatchResponseSchema Zod schema in a new file e.g.
backend/src/types/public-response.ts
mapFitAdvice function in runner.ts
buildPublicResponse function in runner.ts replacing current emitResult mapping

What to update

frontend/lib/types/api.ts — replace MatchResponse with PublicMatchResponse shape
frontend/components/resume-init/accordion-config.ts — update keys:

ts  // invisible_expert
  standout_strengths    → { question: "What makes you stand out?",        subtitle: "strengths" }
  ats_reality_check     → { question: "Why aren't you getting interviews?", subtitle: "signals" }
  terminology_swaps     → { question: "How should you reword your resume?", subtitle: "swaps" }
  keywords_to_add       → { question: "What keywords should you add?",      subtitle: "keywords" }

  // narrative_gap
  transferable_strengths → { question: "What experience transfers directly?", subtitle: "strengths" }
  reframing_suggestions  → { question: "How should you retell your story?",   subtitle: "suggestions" }
  missing_skills         → { question: "What gaps are genuinely there?",      subtitle: "gaps" }

  // honest_verdict
  honest_assessment → { question: "Why is the gap real?",             subtitle: "reasons" }
  closing_steps     → { question: "What would it actually take?",     subtitle: "steps" }
  acknowledgement   → { question: "What did your context change?",    subtitle: "updates" }

frontend/components/resume-init/MainResultsStage.tsx — wire to live data,
replace all DUMMY_* imports with props from useMatchRunner
frontend/hooks/useMatchRunner.ts — result type updates to new MatchResponse
Delete frontend/components/resume-init/dummy-data.ts
Delete frontend/app/page.tsx (legacy)
Delete frontend/components/match/ (legacy, entire directory)


Scenarios reference
scenarioIdfitScoreatsScoreVerdict nodeconfirmed_fit≥ 75≥ 75 or nullanalyzeStrongMatchinvisible_expert≥ 75< 75analyzeStrongMatchnarrative_gap50–74anyanalyzeNarrativeGaphonest_verdict< 50anyanalyzeSkepticalReconciliation

SSE events (unchanged)
EventPayloadmetathreadId, rootRunId, runStartTimenode_startnode, timestampnode_donenode, durationMs, timestampcompletedresult: PublicMatchResponseinterruptedfitScore, threadIderrorerror, message
Note: contextPrompt is no longer included in the interrupted event payload —
it was removed from analyzeFit output. The frontend HITL form collects free text
from the user without a pre-seeded prompt.