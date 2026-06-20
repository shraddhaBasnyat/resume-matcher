import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildHonestVerdictRunnable } from "../../../llm-wrappers/analyze-skeptical-reconciliation.wrapper.js";
import { ARCHETYPE_CONFIG } from "../archetype-config.js";
import { formatTerminologyMismatches } from "./format-helpers.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeSkepticalReconciliationNode(model: BaseChatModel) {
  const chain = buildHonestVerdictRunnable(model);

  return async function analyzeSkepticalReconciliation(state: GraphStateType) {
    if (state.scenarioId !== "honest_verdict") {
      throw new Error(
        `analyzeSkepticalReconciliation: expected scenarioId "honest_verdict", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }
    if (!state.fitAnalysis) {
      throw new Error("analyzeSkepticalReconciliation: fitAnalysis is missing from graph state");
    }
    if (!state.fitScenarioSummary) {
      throw new Error("analyzeSkepticalReconciliation: fitScenarioSummary is missing from graph state");
    }
    if (!state.jdArchetype) {
      throw new Error("analyzeSkepticalReconciliation: jdArchetype is missing from graph state");
    }

    const archetypeConfig = ARCHETYPE_CONFIG[state.jdArchetype.ideal];
    const archetypeContext = state.userTier === "paid"
      ? `Archetype scan pattern: ${archetypeConfig.scanPattern}\nInterview probe pattern: ${archetypeConfig.interviewProbePattern}`
      : "";

    const scopeAmbiguity = state.scopeAmbiguity
      ? JSON.stringify(state.scopeAmbiguity, null, 2)
      : "(none)";

    const humanContextBlock = state.humanContext
      ? `Additional Context from Candidate:\n${state.humanContext}\n\n`
      : "";

    const llmOutput = await chain.invoke({
      fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
      weak_match_reason: state.weakMatchReason ?? "Not provided",
      fit_scenario_summary: state.fitScenarioSummary,
      ats_scenario_summary: state.atsScenarioSummary ?? "",
      human_context: humanContextBlock,
      scope_ambiguity: scopeAmbiguity,
      terminology_mismatches: formatTerminologyMismatches(state.terminologyMismatches),
      resume_text: state.resumeText,
      archetype_context: archetypeContext,
    });

    const { contextPrompt, closingSummary, verdictAha, terminologyDiffs, ...fitAdviceFields } = llmOutput;

    return {
      contextPrompt: contextPrompt ?? null,
      fitAdvice: {
        scenarioId: "honest_verdict" as const,
        hitlFired: state.hitlFired,
        ...fitAdviceFields,
      },
      closingSummary,
      verdictAha,
      terminologyDiffs,
    };
  };
}
