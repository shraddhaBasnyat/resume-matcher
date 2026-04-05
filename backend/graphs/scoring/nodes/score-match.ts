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
    const result = await chain.invoke(
      {
        resume_data: JSON.stringify(state.resumeData, null, 2),
        job_data: JSON.stringify(state.jobData, null, 2),
        human_context: state.humanContext,
      },
      { runName }
    );

    // weakMatch is derived deterministically — the LLM does not output it.
    const weakMatch = result.fitScore < 60;

    if (weakMatch) {
      if (!result.weakMatchReason?.trim()) {
        throw new Error(
          `scoreMatch: fitScore is ${result.fitScore} (< 60) but weakMatchReason is missing or empty. ` +
          "The model must provide weakMatchReason when the score is below 60."
        );
      }
    }

    return {
      matchResult: {
        ...result,
        weakMatch,
      },
    };
  };
}
