import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildInvisibleExpertRunnable } from "../../../llm-wrappers/analyze-strong-match.wrapper.js";
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
    if (!state.fitScenarioSummary) {
      throw new Error("analyzeStrongMatch: fitScenarioSummary is missing from graph state");
    }
    const isInvisibleExpert = state.scenarioId === "invisible_expert";

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
      fit_scenario_summary: state.fitScenarioSummary,
      ats_scenario_summary: state.atsScenarioSummary ?? "",
    });

    const { closingSummary, verdictAha, ...fitAdviceFields } = llmOutput;

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
      closingSummary,
      verdictAha,
    };
  };
}
