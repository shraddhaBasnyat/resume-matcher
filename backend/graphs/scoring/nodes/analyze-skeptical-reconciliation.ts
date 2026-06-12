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
    if (!state.fitScenarioSummary) {
      throw new Error("analyzeSkepticalReconciliation: fitScenarioSummary is missing from graph state");
    }
    if (!state.atsScenarioSummary) {
      throw new Error("analyzeSkepticalReconciliation: atsScenarioSummary is missing from graph state");
    }

    const humanContextBlock = state.humanContext
      ? `Additional Context from Candidate:\n${state.humanContext}\n\n`
      : "";

    const llmOutput = await chain.invoke({
      fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
      weak_match_reason: state.weakMatchReason ?? "Not provided",
      fit_scenario_summary: state.fitScenarioSummary,
      ats_scenario_summary: state.atsScenarioSummary,
      human_context: humanContextBlock,
    });

    if (!state.hitlFired && llmOutput.contextPrompt != null) {
      const humanContext = interrupt(llmOutput.contextPrompt);
      // closingSummary and verdictAha are not written on first pass — node interrupts before this point
      return new Command({
        update: { humanContext: humanContext as string, hitlFired: true },
        goto: "analyzeSkepticalReconciliation",
      });
    }

    const { contextPrompt: _cp, closingSummary, verdictAha, ...fitAdviceFields } = llmOutput;

    return {
      fitAdvice: {
        scenarioId: "honest_verdict" as const,
        hitlFired: state.hitlFired,
        ...fitAdviceFields,
      },
      closingSummary,
      verdictAha,
    };
  };
}
