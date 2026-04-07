import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildAtsAnalysisChain } from "../../../chains/ats-analysis-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAtsAnalysisNode(model: BaseChatModel) {
  const chain = buildAtsAnalysisChain(model);

  return async function atsAnalysis(state: GraphStateType) {
    const result = await chain.invoke(
      { resume_text: state.resumeText, job_text: state.jobText },
      { runName: "ats-analysis" }
    );
    return { atsProfile: result };
  };
}
