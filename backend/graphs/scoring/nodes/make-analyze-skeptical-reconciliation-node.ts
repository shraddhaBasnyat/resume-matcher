import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeSkepticalReconciliationNode(model: BaseChatModel) {
  return async function analyzeSkepticalReconciliation(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeSkepticalReconciliation: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("analyzeSkepticalReconciliation: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("analyzeSkepticalReconciliation: jobData is missing from graph state");
    }
    // TODO: implement chain
    return { matchResult: state.matchResult };
  };
}
