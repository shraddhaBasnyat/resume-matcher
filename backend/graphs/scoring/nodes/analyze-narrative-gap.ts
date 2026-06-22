import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildNarrativeGapRunnable } from "../../../llm-wrappers/analyze-narrative-gap.wrapper.js";
import { ARCHETYPE_CONFIG } from "../archetype-config.js";
import { formatTerminologyMismatches } from "./format-helpers.js";
import type { GraphStateType } from "../scoring-graph-state.js";

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

    const archetypeConfig = ARCHETYPE_CONFIG[state.jdArchetype.ideal];
    const archetypeContext = state.userTier === "paid"
      ? `Archetype scan pattern: ${archetypeConfig.scanPattern}\nInterview probe pattern: ${archetypeConfig.interviewProbePattern}`
      : "";

    const careerArcNote = state.careerArcNote
      ? JSON.stringify(state.careerArcNote, null, 2)
      : "(none)";

    const llmOutput = await chain.invoke({
      fit_analysis: JSON.stringify(state.fitAnalysis, null, 2),
      ats_scenario_summary: state.atsScenarioSummary ?? "",
      candidate_archetype: state.candidateArchetype ?? "",
      career_arc_note: careerArcNote,
      terminology_mismatches: formatTerminologyMismatches(state.terminologyMismatches),
      resume_text: state.resumeText,
      archetype_context: archetypeContext,
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
