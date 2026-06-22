import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildAnalyzeFitRunnable } from "../../../llm-wrappers/analyze-fit.wrapper.js";
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

export function makeAnalyzeFitNode(model: BaseChatModel) {
  const chain = buildAnalyzeFitRunnable(model);

  return async function analyzeFit(state: GraphStateType) {
    const result = await chain.invoke({
      candidate_archetype: state.candidateArchetype!,
      jd_archetype_ideal: state.jdArchetype!.ideal,
      jd_archetype_could_work: state.jdArchetype!.couldWork,
      real_ask: state.realAsk!,
      demonstrated_vs_claimed: formatDemonstratedVsClaimed(state.demonstratedVsClaimed!),
      rubric_kb: "",
    });

    const weakMatch = result.fitScore < 60;
    const weakMatchReason =
      result.fitAnalysis.weakMatchReason === "NONE"
        ? null
        : result.fitAnalysis.weakMatchReason;

    const { weakMatchReason: _wr, ...fitAnalysis } = result.fitAnalysis;

    return {
      fitScore: result.fitScore,
      headline: result.headline,
      battleCardBullets: result.battleCardBullets,
      fitAha: result.fitAha,
      fitAnalysis,
      weakMatch,
      weakMatchReason,
    };
  };
}
