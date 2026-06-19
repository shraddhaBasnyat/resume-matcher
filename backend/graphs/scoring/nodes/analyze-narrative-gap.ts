import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildNarrativeGapRunnable } from "../../../llm-wrappers/analyze-narrative-gap.wrapper.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeNarrativeGapNode(model: BaseChatModel) {
  const chain = buildNarrativeGapRunnable(model);

  return async function analyzeNarrativeGap(state: GraphStateType) {
    if (state.scenarioId !== "narrative_gap") {
      throw new Error(
        `analyzeNarrativeGap: expected scenarioId "narrative_gap", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }
    if (!state.fitAnalysis) {
      throw new Error("analyzeNarrativeGap: fitAnalysis is missing from graph state");
    }
    if (!state.fitScenarioSummary) {
      throw new Error("analyzeNarrativeGap: fitScenarioSummary is missing from graph state");
    }
    const llmOutput = await chain.invoke({
      fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
      fit_scenario_summary: state.fitScenarioSummary,
      ats_scenario_summary: state.atsScenarioSummary,
    });

    const { closingSummary, verdictAha, ...fitAdviceFields } = llmOutput;

    return {
      fitAdvice: {
        scenarioId: "narrative_gap" as const,
        ...fitAdviceFields,
      },
      closingSummary,
      verdictAha,
    };
  };
}
