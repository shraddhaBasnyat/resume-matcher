import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildHonestVerdictRunnable } from "../../../llm-wrappers/analyze-skeptical-reconciliation.wrapper.js";
import type { AnalyzeResumeLLMOutput } from "../../../llm-wrappers/analyze-resume.wrapper.js";
import type { GraphStateType } from "../scoring-graph-state.js";

function formatDemonstratedVsClaimed(
  items: AnalyzeResumeLLMOutput["demonstratedVsClaimed"],
): string {
  return items
    .map(({ bullet, status, evidencePresent }) => {
      const detail = evidencePresent ? `evidence: "${evidencePresent}"` : "no evidence";
      return `- "${bullet}" [${status}] ${detail}`;
    })
    .join("\n");
}

export function makeAnalyzeSkepticalReconciliationNode(model: BaseChatModel) {
  const chain = buildHonestVerdictRunnable(model);

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
    if (!state.jdArchetype) {
      throw new Error("analyzeSkepticalReconciliation: jdArchetype is missing from graph state");
    }

    const humanContextBlock = state.humanContext
      ? `Additional Context from Candidate:\n${state.humanContext}\n\n`
      : "";

    const llmOutput = await chain.invoke({
      fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
      battle_card_bullets: JSON.stringify(state.battleCardBullets ?? []),
      jd_archetype_ideal: state.jdArchetype.ideal,
      real_ask: state.realAsk!,
      demonstrated_vs_claimed: formatDemonstratedVsClaimed(state.demonstratedVsClaimed ?? []),
      career_arc_note: state.careerArcNote ? JSON.stringify(state.careerArcNote) : "",
      human_context: humanContextBlock,
    });

    const { contextPrompt, verdictAha, ...fitAdviceFields } = llmOutput;

    return {
      contextPrompt: contextPrompt ?? null,
      fitAdvice: {
        scenarioId: "honest_verdict" as const,
        hitlFired: state.hitlFired,
        ...fitAdviceFields,
      },
      verdictAha,
    };
  };
}
