import { z } from "zod";

export const MatchSchema = z
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
  });

export type MatchResult = z.infer<typeof MatchSchema>;
