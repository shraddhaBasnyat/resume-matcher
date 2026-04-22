import { interrupt, Command } from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildHonestVerdictChain } from "../../../chains/analyze-skeptical-reconciliation-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeSkepticalReconciliationNode(model: BaseChatModel) {
  const chain = buildHonestVerdictChain(model);

  return async function analyzeSkepticalReconciliation(state: GraphStateType) {
    if (state.scenarioId !== "honest_verdict") {
      throw new Error(
        `analyzeSkepticalReconciliation: expected scenarioId "honest_verdict", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }
    if (!state.fitAnalysis) {
      throw new Error("analyzeSkepticalReconciliation: fitAnalysis is missing from graph state");
    }

    const humanContextBlock = state.humanContext
      ? `Additional Context from Candidate:\n${state.humanContext}\n\n`
      : "";

    const llmOutput = await chain.invoke(
      {
        fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
        weak_match_reason: state.weakMatchReason ?? "Not provided",
        human_context: humanContextBlock,
      },
      { runName: "analyze-skeptical-reconciliation" },
    );

    if (!state.hitlFired && llmOutput.contextPrompt != null) {
      const humanContext = interrupt(llmOutput.contextPrompt);
      return new Command({
        update: { humanContext: humanContext as string, hitlFired: true },
        goto: "analyzeSkepticalReconciliation",
      });
    }

    const { contextPrompt: _cp, ...fitAdviceFields } = llmOutput;

    return {
      fitAdvice: {
        scenarioId: "honest_verdict" as const,
        hitlFired: state.hitlFired,
        ...fitAdviceFields,
      },
    };
  };
}
