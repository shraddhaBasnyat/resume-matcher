import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MatchSchema } from "../schemas/match-schema.js";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

const SYSTEM_PROMPT = `You are a resume-to-job-description matcher. Score the candidate's fit for the role from 0 to 100.

Rules:
- matchedSkills: skills the candidate has that appear in requiredSkills or niceToHaveSkills.
- missingSkills: skills in requiredSkills that the candidate lacks.
- narrativeAlignment: one paragraph on how the candidate's career story aligns with this role.
- gaps: specific mismatches in experience level, domain, or skills.
- resumeAdvice: 3-5 actionable suggestions to strengthen the resume for this role.
- weakMatch: true if score < 60.
- weakMatchReason: required when weakMatch is true — explain specifically what is missing.
- If humanContext is provided, weigh it alongside the resume when scoring.`;

const HUMAN_PROMPT = `Resume Data:
{resume_data}

Job Description Data:
{job_data}

Additional Context from Candidate:
{human_context}

Score this candidate's fit for the role.`;

export function buildScoringChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const structuredModel = model.withStructuredOutput(MatchSchema);

  return {
    invoke: async (
      input: { resume_data: string; job_data: string; human_context: string },
      config?: { runName?: string }
    ) => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture((id) => {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = MatchSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "score-match",
          errors: validated.error,
          rawOutput: result,
        });
        return MatchSchema.parse({ ...result });
      }

      return validated.data;
    },
  };
}
