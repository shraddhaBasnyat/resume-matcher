import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildGapAnalysisChain } from "../../../chains/gap-analysis-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeGapAnalysisNode(model: BaseChatModel) {
  const chain = buildGapAnalysisChain(model);
  return async function gapAnalysis(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("gapAnalysis: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("gapAnalysis: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("gapAnalysis: jobData is missing from graph state");
    }
    const updated = await chain.invoke({
      resume_data: JSON.stringify(state.resumeData, null, 2),
      job_data: JSON.stringify(state.jobData, null, 2),
      match_result: JSON.stringify(state.matchResult, null, 2),
    });
    return { matchResult: updated };
  };
}
