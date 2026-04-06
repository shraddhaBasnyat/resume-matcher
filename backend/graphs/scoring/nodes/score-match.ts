import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildScoringChain } from "../../../chains/scoring-chain.js";
import { WEAK_FIT_THRESHOLD } from "../scenario/derive-scenario.js";
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
    // Threshold aligns with WEAK_FIT_THRESHOLD (50) = the honest_verdict scenario boundary.
    const weakMatch = result.fitScore < WEAK_FIT_THRESHOLD;

    if (weakMatch) {
      if (!result.weakMatchReason?.trim()) {
        throw new Error(
          `scoreMatch: fitScore is ${result.fitScore} (< ${WEAK_FIT_THRESHOLD}) but weakMatchReason is missing or empty. ` +
          `The model must provide weakMatchReason when the score is below ${WEAK_FIT_THRESHOLD}.`
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
