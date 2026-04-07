import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  buildConfirmedFitChain,
  buildInvisibleExpertChain,
} from "../../../chains/analyze-strong-match-chain.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeStrongMatchNode(model: BaseChatModel) {
  const confirmedFitChain = buildConfirmedFitChain(model);
  const invisibleExpertChain = buildInvisibleExpertChain(model);

  return async function analyzeStrongMatch(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("analyzeStrongMatch: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("analyzeStrongMatch: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("analyzeStrongMatch: jobData is missing from graph state");
    }
    if (state.scenarioId !== "confirmed_fit" && state.scenarioId !== "invisible_expert") {
      throw new Error(
        `analyzeStrongMatch: expected scenarioId "confirmed_fit" or "invisible_expert", ` +
          `got "${state.scenarioId}" — check routing in routeVerdicts`,
      );
    }

    const sharedInput = {
      resume_data: JSON.stringify(state.resumeData, null, 2),
      job_data: JSON.stringify(state.jobData, null, 2),
      match_result: JSON.stringify(state.matchResult, null, 2),
    };

    if (state.scenarioId === "invisible_expert") {
      if (!state.atsProfile) {
        throw new Error(
          "analyzeStrongMatch: atsProfile is missing from graph state — " +
            "required for invisible_expert scenario",
        );
      }

      const llmOutput = await invisibleExpertChain.invoke(
        {
          ...sharedInput,
          terminology_gaps: JSON.stringify(state.atsProfile.terminologyGaps),
          missing_keywords: JSON.stringify(state.atsProfile.missingKeywords),
          layout_flags: JSON.stringify(state.atsProfile.layoutFlags),
        },
        { runName: "analyze-strong-match-invisible-expert" },
      );

      return {
        fitAdvice: {
          scenarioId: "invisible_expert" as const,
          ...llmOutput,
          terminologySwaps: state.atsProfile.terminologyGaps,
          keywordsToAdd: state.atsProfile.missingKeywords,
          layoutAdvice: state.atsProfile.layoutFlags,
        },
      };
    }

    // confirmed_fit
    const llmOutput = await confirmedFitChain.invoke(sharedInput, {
      runName: "analyze-strong-match-confirmed-fit",
    });

    return {
      fitAdvice: {
        scenarioId: "confirmed_fit" as const,
        ...llmOutput,
      },
    };
  };
}
