import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeNarrativeGapNode(model: BaseChatModel) {
  return async function analyzeNarrativeGap(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeNarrativeGap: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("analyzeNarrativeGap: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("analyzeNarrativeGap: jobData is missing from graph state");
    }
    // TODO: implement chain
    return { fitAdvice: {} };
  };
}
