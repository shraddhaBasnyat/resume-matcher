import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { MatchResult } from "../types/api.js";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

export const MatchSchema: z.ZodType<MatchResult> = z
  .object({
    score: z.number().min(0).max(100).describe("Overall match score from 0 to 100"),
    matchedSkills: z.array(z.string()).describe("Skills the candidate has that the job requires"),
    missingSkills: z.array(z.string()).describe("Required skills the candidate lacks"),
    narrativeAlignment: z.string().describe("How well the candidate's career narrative aligns with the role"),
    gaps: z.array(z.string()).describe("Specific gaps between the candidate's profile and the job requirements"),
    resumeAdvice: z
      .array(z.string())
      .describe("Actionable suggestions for how to rewrite resume sections to better target this job"),
    weakMatch: z.boolean().describe("True if the score is below 60 and human review is recommended"),
    weakMatchReason: z
      .string()
      .optional()
      .describe("Explanation of why the match is weak, when weakMatch is true"),
  })
  .superRefine((value, ctx) => {
    if (value.weakMatch) {
      const reason = value.weakMatchReason;
      if (!reason || reason.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weakMatchReason"],
          message:
            "weakMatchReason is required and must be a non-empty string when weakMatch is true",
        });
      }
    }
  }) as z.ZodType<MatchResult>;

export type { MatchResult };

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
