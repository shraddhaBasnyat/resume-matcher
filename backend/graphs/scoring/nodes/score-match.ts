import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildScoringChain } from "../../../chains/scoring-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeScoreMatchNode(model: BaseChatModel) {
  const chain = buildScoringChain(model);
  return async function scoreMatch(state: GraphStateType) {
    if (!state.resumeData) {
      throw new Error("scoreMatch: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("scoreMatch: jobData is missing from graph state");
    }
    const runName = state.humanContext?.trim() ? "rescore-with-context" : "score-match";
    const matchResult = await chain.invoke(
      {
        resume_data: JSON.stringify(state.resumeData, null, 2),
        job_data: JSON.stringify(state.jobData, null, 2),
        human_context: state.humanContext,
      },
      { runName }
    );
    return { matchResult };
  };
}
