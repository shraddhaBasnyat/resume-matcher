import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildNarrativeGapChain } from "../../../chains/analyze-narrative-gap-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeNarrativeGapNode(model: BaseChatModel) {
  const chain = buildNarrativeGapChain(model);

  return async function analyzeNarrativeGap(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeNarrativeGap: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("analyzeNarrativeGap: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("analyzeNarrativeGap: jobData is missing from graph state");
    }
    if (state.scenarioId !== "narrative_gap") {
      throw new Error(
        `analyzeNarrativeGap: expected scenarioId "narrative_gap", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }

    // Strip resumeAdvice before sending to the LLM — it is stale scoreMatch output scheduled
    // for removal (PRD TODO). Passing it risks the model anchoring to it instead of building
    // fresh reframing from narrativeAlignment.
    const { resumeAdvice: _, ...matchResultForChain } = state.matchResult;

    const atsContext =
      state.atsProfile && state.atsProfile.atsScore < 75
        ? `Note: ATS score is ${state.atsProfile.atsScore}/100 — the resume may not be surfaced by automated filters for this role.\n`
        : "";

    const llmOutput = await chain.invoke(
      {
        resume_data: JSON.stringify(state.resumeData, null, 2),
        job_data: JSON.stringify(state.jobData, null, 2),
        match_result: JSON.stringify(matchResultForChain, null, 2),
        ats_context: atsContext,
      },
      { runName: "analyze-narrative-gap" },
    );

    return {
      fitAdvice: {
        scenarioId: "narrative_gap" as const,
        ...llmOutput,
      },
    };
  };
}
