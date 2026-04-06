import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeStrongMatchNode(model: BaseChatModel) {
  return async function analyzeStrongMatch(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeStrongMatch: matchResult is missing from graph state");
    }
    // TODO: implement chain
    return { fitAdvice: {} };
  };
}
