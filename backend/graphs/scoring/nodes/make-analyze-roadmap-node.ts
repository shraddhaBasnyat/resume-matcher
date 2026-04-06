import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeRoadmapNode(model: BaseChatModel) {
  return async function analyzeRoadmap(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeRoadmap: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("analyzeRoadmap: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("analyzeRoadmap: jobData is missing from graph state");
    }
    // TODO: implement chain
    return { matchResult: state.matchResult };
  };
}
