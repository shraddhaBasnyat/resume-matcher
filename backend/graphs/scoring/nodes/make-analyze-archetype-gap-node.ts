import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeArchetypeGapNode(model: BaseChatModel) {
  return async function analyzeArchetypeGap(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeArchetypeGap: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("analyzeArchetypeGap: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("analyzeArchetypeGap: jobData is missing from graph state");
    }
    if (!state.archetypeContext) {
      throw new Error("analyzeArchetypeGap: archetypeContext is missing from graph state");
    }
    // TODO: implement chain
    return { matchResult: state.matchResult };
  };
}
