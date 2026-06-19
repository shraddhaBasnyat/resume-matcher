import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildAnalyzeResumeRunnable } from "../../../llm-wrappers/analyze-resume.wrapper.js";
import type { GraphStateType } from "../scoring-graph-state.js";

export function makeAnalyzeResumeNode(model: BaseChatModel) {
  const chain = buildAnalyzeResumeRunnable(model);

  return async function analyzeResume(state: GraphStateType) {
    const result = await chain.invoke({ resume_text: state.resumeText });
    return {
      candidateArchetype: result.candidateArchetype,
      demonstratedVsClaimed: result.demonstratedVsClaimed,
      scopeAmbiguity: result.scopeAmbiguity,
      careerArcNote: result.careerArcNote,
      resumeAha: result.resumeAha,
    };
  };
}
