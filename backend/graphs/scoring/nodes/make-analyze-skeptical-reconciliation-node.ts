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
      // First pass (scenario 4a): interrupt and ask for human context.
      // On resume, LangGraph re-runs this node from the top; interrupt() returns
      // the human-provided string. We then route back to scoreMatch so that
      // humanContext influences the fit score before second-pass analysis (4b).
      const humanContext = interrupt(
        "Your fit score is low. Please share why you believe you're a strong candidate — " +
        "specific experience, projects, or context that may not be reflected in your resume."
      );
      return new Command({
        update: { humanContext: humanContext as string, hitlFired: true },
        goto: "scoreMatch",
      });
    }

    // Second pass (scenario 4b): hitlFired is true, human context already incorporated
    // into the rescore. Proceed to write fitAdvice (chain TBD).
    // TODO: implement chain
    return { fitAdvice: {} };
  };
}
