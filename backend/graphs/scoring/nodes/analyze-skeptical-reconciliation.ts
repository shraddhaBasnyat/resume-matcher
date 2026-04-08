import { interrupt, Command } from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildHonestVerdictChain } from "../../../chains/analyze-skeptical-reconciliation-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeSkepticalReconciliationNode(model: BaseChatModel) {
  const chain = buildHonestVerdictChain(model);

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
    if (state.scenarioId !== "honest_verdict") {
      throw new Error(
        `analyzeSkepticalReconciliation: expected scenarioId "honest_verdict", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }

    // Strip resumeAdvice — stale scoreMatch output, excluded from all verdict node prompts.
    const { resumeAdvice: _, ...matchResultForChain } = state.matchResult;

    const humanContextBlock = state.humanContext
      ? `Additional Context from Candidate:\n${state.humanContext}\n\n`
      : "";

    if (!state.hitlFired) {
      const { contextPrompt } = state.matchResult;

      if (contextPrompt != null) {
        // scoreMatch saw a plausible path to a better score — ask the candidate.
        const humanContext = interrupt(contextPrompt);
        return new Command({
          update: { humanContext: humanContext as string, hitlFired: true },
          goto: "scoreMatch",
        });
      }

      // contextPrompt is null — scoreMatch judged no context would help. Gap is real.
      // Run the verdict chain immediately without waiting for human input.
    }

    // Reached on two paths:
    // 1. First pass, contextPrompt null — gap is real, no HITL.
    // 2. Second pass, hitlFired true — rescore ran with humanContext, fitScore still < 50.
    const llmOutput = await chain.invoke(
      {
        resume_data: JSON.stringify(state.resumeData, null, 2),
        job_data: JSON.stringify(state.jobData, null, 2),
        match_result: JSON.stringify(matchResultForChain, null, 2),
        human_context: humanContextBlock,
      },
      { runName: "analyze-skeptical-reconciliation" },
    );

    const hasHumanContext = (state.humanContext ?? "").trim().length > 0;

    if (hasHumanContext && llmOutput.acknowledgement === null) {
      throw new Error(
        "analyzeSkepticalReconciliation: human context was provided but " +
        "LLM returned null acknowledgement — prompt or model failure"
      );
    }

    if (!hasHumanContext && llmOutput.acknowledgement !== null) {
      throw new Error(
        "analyzeSkepticalReconciliation: no human context but LLM returned " +
        "non-null acknowledgement — prompt or model failure"
      );
    }

    return {
      fitAdvice: {
        scenarioId: "honest_verdict" as const,
        ...llmOutput,
      },
    };
  };
}
