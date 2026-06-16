import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildAtsAnalysisRunnable } from "../../../llm-wrappers/ats-analysis.wrapper.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAtsAnalysisNode(model: BaseChatModel) {
  const chain = buildAtsAnalysisRunnable(model);

  return async function atsAnalysis(state: GraphStateType) {
    const result = await chain.invoke({ resume_text: state.resumeText, job_text: state.jobText });
    return {
      atsProfile: {
        atsScore: result.atsScore,
        machineParsing: result.machineParsing,
        machineRanking: result.machineRanking,
      },
      atsScore: result.atsScore,
      atsScenarioSummary: result.atsScenarioSummary,
      atsAha: result.atsAha,
    };
  };
}
