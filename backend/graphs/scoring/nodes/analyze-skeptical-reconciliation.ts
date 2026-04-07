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
      // Always interrupt on first pass — this node is only reached when fitScore < WEAK_FIT_THRESHOLD.
      // Generate the contextPrompt question here, not in scoreMatch.
      // TODO: replace hardcoded string when we implement this nodes chain
      const humanContext = interrupt(
        "Your fit score is low. Please describe any relevant experience your resume doesn't capture."
      );
      return new Command({
        update: { humanContext: humanContext as string, hitlFired: true },
        goto: "scoreMatch",
      });
    }
    
    // Second pass (honest_verdict, hitlFired true) — human context already incorporated into rescore.
    // TODO: implement chain
    return { fitAdvice: {} };
  };
}
