import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MatchSchema } from "../schemas/match-schema.js";

const SYSTEM_PROMPT = `You are a senior career coach who specialises in resume tailoring.
Given a resume, job description, and match result between them, produce specific, actionable resume advice.
Each item in resumeAdvice must name a concrete resume section or bullet point to change,
referencing actual content from the resume where possible.
Return the full match result with resumeAdvice updated to contain these targeted, section-level suggestions.`;

const HUMAN_PROMPT = `Resume Data:
{resume_data}

Job Data:
{job_data}

Match Result:
{match_result}

Rewrite the resumeAdvice in the match result with specific, section-level suggestions referencing actual resume content above.`;

export function buildGapAnalysisChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const structuredModel = model.withStructuredOutput(MatchSchema);

  return {
    invoke: async (input: { resume_data: string; job_data: string; match_result: string }) => {
      const messages = await prompt.invoke(input);
      return structuredModel.invoke(messages, { runName: "gap-analysis" });
    },
  };
}
