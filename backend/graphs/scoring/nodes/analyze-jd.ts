import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildAnalyzeJDRunnable } from "../../../llm-wrappers/analyze-jd.wrapper.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeJDNode(model: BaseChatModel) {
  const chain = buildAnalyzeJDRunnable(model);

  return async function analyzeJD(state: GraphStateType) {
    const result = await chain.invoke({ job_text: state.jobText });
    return {
      jdArchetype: result.jdArchetype,
      realAsk: result.realAsk,
      recruiterFilter: result.recruiterFilter,
    };
  };
}
