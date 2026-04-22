import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildAnalyzeFitChain } from "../../../chains/analyze-fit-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeFitNode(model: BaseChatModel) {
  const chain = buildAnalyzeFitChain(model);

  return async function analyzeFit(state: GraphStateType) {
    const result = await chain.invoke(
      { resume_text: state.resumeText, job_text: state.jobText },
      { runName: "analyze-fit" },
    );

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
      scenarioSummary: result.scenarioSummary,
      sourceRole: result.sourceRole,
      targetRole: result.targetRole,
      fitAnalysis,
      weakMatch,
      weakMatchReason,
    };
  };
}
