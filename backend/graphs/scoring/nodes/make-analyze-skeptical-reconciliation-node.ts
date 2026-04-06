import { interrupt, Command } from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeSkepticalReconciliationNode(_model: BaseChatModel) {
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

    if (!state.hitlFired) {
      const contextPrompt = state.matchResult.contextPrompt;

      if (contextPrompt) {
        // First pass (scenario 4a): interrupt only when scoring determined that
        // additional human context may help. On resume, LangGraph re-runs this
        // node from the top; interrupt() returns the human-provided string. We
        // then route back to scoreMatch so that humanContext influences the fit
        // score before second-pass analysis (4b).
        const humanContext = interrupt(contextPrompt);
        return new Command({
          update: { humanContext: humanContext as string, hitlFired: true },
          goto: "scoreMatch",
        });
      }

      // First pass with no follow-up requested (scenario 5): do not interrupt.
      // Proceed/terminate without requesting human input.
      return { scenarioId: "5", fitAdvice: {} };
    }

    // Second pass (scenario 4b): hitlFired is true, human context already incorporated
    // into the rescore. Proceed to write fitAdvice (chain TBD).
    // TODO: implement chain
    return { fitAdvice: {} };
  };
}
