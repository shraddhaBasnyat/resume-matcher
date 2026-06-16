import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildAnalyzeFitRunnable } from "../../../llm-wrappers/analyze-fit.wrapper.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeFitNode(model: BaseChatModel) {
  const chain = buildAnalyzeFitRunnable(model);

  return async function analyzeFit(state: GraphStateType) {
    const result = await chain.invoke({ resume_text: state.resumeText, job_text: state.jobText });

    const weakMatch = result.fitScore < 50;
    const weakMatchReason =
      result.fitAnalysis.weakMatchReason === "NONE"
        ? null
        : result.fitAnalysis.weakMatchReason;

    const { weakMatchReason: _wr, ...fitAnalysis } = result.fitAnalysis;

    return {
      fitScore: result.fitScore,
      headline: result.headline,
      battleCardBullets: result.battleCardBullets,
      fitScenarioSummary: result.fitScenarioSummary,
      fitAha: result.fitAha,
      sourceRole: result.sourceRole,
      targetRole: result.targetRole,
      fitAnalysis,
      weakMatch,
      weakMatchReason,
    };
  };
}
