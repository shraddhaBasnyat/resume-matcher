import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { MatchResult } from "../types/api.js";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

// The LLM output schema — weakMatch is excluded because it is derived
// deterministically in the scoreMatch node (fitScore < 50), not by the model.
// contextPrompt is included: the model generates a specific follow-up question
// when it sees a plausible path to a better score, or null when the gap is real.
export const MatchSchema = z.object({
  fitScore: z.number().min(0).max(100).describe("Semantic fit score from 0 to 100 — how well the candidate matches the role based on career narrative, transferable skills, and trajectory"),
  matchedSkills: z.array(z.string()).describe("Skills the candidate has that the job requires"),
  missingSkills: z.array(z.string()).describe("Required skills the candidate lacks"),
  narrativeAlignment: z.string().describe("How well the candidate's career narrative aligns with the role"),
  gaps: z.array(z.string()).describe("Specific gaps between the candidate's profile and the job requirements"),
  contextPrompt: z
    .string()
    .min(1)
    .nullable()
    .describe("A specific question that would surface information capable of materially changing the score. Only set when fitScore < 50 and context could plausibly move the score. Null in all other cases."),
  weakMatchReason: z
    .string()
    .optional()
    .describe("Direct explanation of why the match is weak. Required when fitScore < 50. Not motivational — honest and specific."),
});

export type LLMMatchOutput = z.infer<typeof MatchSchema>;
export type { MatchResult };

const SYSTEM_PROMPT = `You are a resume-to-job-description matcher. Score the candidate's semantic fit for the role from 0 to 100.

Rules:
- fitScore: semantic fit only — career narrative, transferable skills, trajectory. 0–100.
- matchedSkills: skills the candidate has that appear in requiredSkills or niceToHaveSkills.
- missingSkills: skills in requiredSkills that the candidate lacks.
- narrativeAlignment: one paragraph on how the candidate's career story aligns with this role.
- gaps: specific mismatches in experience level, domain, or skills.
- contextPrompt: only when fitScore < 50. Write a specific question that would surface information capable of materially changing the score. Set to null in all other cases — including when fitScore >= 50, or when fitScore < 50 but the gap is real and no context would help.
- weakMatchReason: required when fitScore < 50 — explain specifically what is missing. Direct and honest.
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
    ): Promise<LLMMatchOutput> => {
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
        throw validated.error;
      }

      return validated.data;
    },
  };
}
