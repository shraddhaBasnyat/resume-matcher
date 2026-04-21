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

    if (state.scenarioId === "confirmed_fit") {
      return {
        fitAdvice: {
          scenarioId: "confirmed_fit" as const,
          fitAdvice: [],
        },
      };
    }

    // invisible_expert
    if (!state.atsProfile) {
      throw new Error(
        "analyzeStrongMatch: atsProfile is missing from graph state — " +
          "required for invisible_expert scenario",
      );
    }
    if (!state.fitAnalysis) {
      throw new Error("analyzeStrongMatch: fitAnalysis is missing from graph state");
    }

    const llmOutput = await invisibleExpertChain.invoke(
      {
        fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
        ats_ranking: JSON.stringify(state.atsProfile.machineRanking, null, 2),
      },
      { runName: "analyze-strong-match-invisible-expert" },
    );

    return {
      fitAdvice: {
        scenarioId: "invisible_expert" as const,
        ...llmOutput,
      },
    };
  };
}
