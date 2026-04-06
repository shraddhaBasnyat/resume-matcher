import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeAtsGapNode(model: BaseChatModel) {
  return async function analyzeAtsGap(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeAtsGap: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("analyzeAtsGap: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("analyzeAtsGap: jobData is missing from graph state");
    }
    // TODO: implement chain
    return { matchResult: state.matchResult };
  };
}
