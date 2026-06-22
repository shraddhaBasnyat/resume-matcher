import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildNarrativeGapRunnable } from "../../../llm-wrappers/analyze-narrative-gap.wrapper.js";
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

export function makeAnalyzeNarrativeGapNode(model: BaseChatModel) {
  const chain = buildNarrativeGapRunnable(model);

  return async function analyzeNarrativeGap(state: GraphStateType) {
    if (state.scenarioId !== "narrative_gap") {
      throw new Error(
        `analyzeNarrativeGap: expected scenarioId "narrative_gap", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }
    if (!state.fitAnalysis) {
      throw new Error("analyzeNarrativeGap: fitAnalysis is missing from graph state");
    }
    if (!state.jdArchetype) {
      throw new Error("analyzeNarrativeGap: jdArchetype is missing from graph state");
    }

    const careerArcNote = state.careerArcNote
      ? JSON.stringify(state.careerArcNote, null, 2)
      : "(none)";

    const llmOutput = await chain.invoke({
      fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
      battle_card_bullets: JSON.stringify(state.battleCardBullets ?? []),
      candidate_archetype: state.candidateArchetype ?? "",
      jd_archetype_ideal: state.jdArchetype.ideal,
      jd_archetype_could_work: state.jdArchetype.couldWork,
      real_ask: state.realAsk!,
      career_arc_note: careerArcNote,
      demonstrated_vs_claimed: formatDemonstratedVsClaimed(state.demonstratedVsClaimed ?? []),
    });

    const { verdictAha, ...fitAdviceFields } = llmOutput;

    return {
      fitAdvice: {
        scenarioId: "narrative_gap" as const,
        ...fitAdviceFields,
      },
      verdictAha,
    };
  };
}
