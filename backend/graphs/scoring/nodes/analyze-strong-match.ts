import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildInvisibleExpertChain } from "../../../chains/analyze-strong-match-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeStrongMatchNode(model: BaseChatModel) {
  const invisibleExpertChain = buildInvisibleExpertChain(model);

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
    if (!state.atsScenarioSummary) {
      throw new Error("analyzeStrongMatch: atsScenarioSummary is missing from graph state");
    }

    const isInvisibleExpert = state.scenarioId === "invisible_expert";

    if (isInvisibleExpert && !state.atsProfile) {
      throw new Error(
        "analyzeStrongMatch: atsProfile is missing from graph state — " +
          "required for invisible_expert scenario",
      );
    }

    const llmOutput = await invisibleExpertChain.invoke(
      {
        scenario: state.scenarioId,
        fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
        ats_ranking: isInvisibleExpert
          ? JSON.stringify(state.atsProfile!.machineRanking, null, 2)
          : "[]",
        fit_scenario_summary: state.fitScenarioSummary,
        ats_scenario_summary: state.atsScenarioSummary,
      },
      { runName: `analyze-strong-match-${state.scenarioId}` },
    );

    const { closingSummary, verdictAha, ...fitAdviceFields } = llmOutput;

    return {
      fitAdvice: {
        scenarioId: state.scenarioId,
        ...(isInvisibleExpert ? fitAdviceFields : { fitAdvice: [] }),
      },
      closingSummary,
      verdictAha,
    };
  };
}
