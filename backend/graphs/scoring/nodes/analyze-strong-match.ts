import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildInvisibleExpertRunnable } from "../../../llm-wrappers/analyze-strong-match.wrapper.js";
import { ARCHETYPE_CONFIG } from "../archetype-config.js";
import { formatTerminologyMismatches } from "./format-helpers.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeStrongMatchNode(model: BaseChatModel) {
  const invisibleExpertChain = buildInvisibleExpertRunnable(model);

  return async function analyzeStrongMatch(state: GraphStateType) {
    if (state.scenarioId !== "confirmed_fit" && state.scenarioId !== "invisible_expert") {
      throw new Error(
        `analyzeStrongMatch: expected scenarioId "confirmed_fit" or "invisible_expert", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }

    if (!state.fitAnalysis) {
      throw new Error("analyzeStrongMatch: fitAnalysis is missing from graph state");
    }
    if (!state.jdArchetype) {
      throw new Error("analyzeStrongMatch: jdArchetype is missing from graph state");
    }

    const isInvisibleExpert = state.scenarioId === "invisible_expert";

    const archetypeConfig = ARCHETYPE_CONFIG[state.jdArchetype.ideal];
    const archetypeContext = state.userTier === "paid"
      ? `Archetype scan pattern: ${archetypeConfig.scanPattern}\nInterview probe pattern: ${archetypeConfig.interviewProbePattern}`
      : "";

    const atsRankingStrings = (state.termGaps ?? [])
      .filter((g) => g.status !== "present_demonstrated")
      .map((g) =>
        g.status === "missing"
          ? `missing keyword: "${g.term}"`
          : `"${g.term}" present but without demonstrated context`,
      );

    const llmOutput = await invisibleExpertChain.invoke({
      scenario: state.scenarioId,
      fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
      ats_ranking: isInvisibleExpert ? JSON.stringify(atsRankingStrings, null, 2) : "[]",
      ats_scenario_summary: state.atsScenarioSummary ?? "",
      candidate_archetype: state.candidateArchetype ?? "",
      jd_archetype_ideal: state.jdArchetype.ideal,
      jd_archetype_could_work: (state.jdArchetype.couldWork ?? []).join(", "),
      real_ask: state.realAsk ?? "",
      terminology_mismatches: formatTerminologyMismatches(state.terminologyMismatches),
      resume_text: state.resumeText,
      archetype_context: archetypeContext,
    });

    const { verdictAha, terminologyDiffs, ...fitAdviceFields } = llmOutput;

    return {
      fitAdvice: isInvisibleExpert
        ? {
            scenarioId: "invisible_expert" as const,
            standoutStrengths: fitAdviceFields.standoutStrengths,
            atsRealityCheck: fitAdviceFields.atsRealityCheck,
            terminologySwaps: fitAdviceFields.terminologySwaps,
            keywordsToAdd: fitAdviceFields.keywordsToAdd,
          }
        : {
            scenarioId: "confirmed_fit" as const,
            leadWithThese: fitAdviceFields.leadWithThese,
            expectTheseQuestions: fitAdviceFields.expectTheseQuestions,
            watchOutFor: fitAdviceFields.watchOutFor,
          },
      verdictAha,
      terminologyDiffs,
    };
  };
}
