import { z } from "zod";

export const HonestVerdictLLMSchema = z.object({
  honestAssessment: z
    .array(z.string().min(1))
    .describe(
      "Why the gap is real for this specific candidate and role. Direct and specific. Most fundamental gaps first.",
    ),
  closingSteps: z
    .array(z.string().min(1))
    .describe(
      "Specific questions or conditions this candidate would need to satisfy before this role makes sense. Tied to actual gaps in the battle card.",
    ),
  acknowledgement: z
    .array(z.string().min(1))
    .nullable()
    .describe(
      "Acknowledgement of candidate-provided context and why the assessment still stands. Null if no context was provided.",
    ),
  contextPrompt: z
    .string()
    .min(1)
    .nullable()
    .describe(
      "A specific question for the candidate that could change the assessment. Null if the gap is fundamental or context already provided.",
    ),
  verdictAha: z.string().min(1).describe(
    "One sentence. The most important thing for this candidate to understand about their situation.",
  ),
});

export type HonestVerdictLLMOutput = z.infer<typeof HonestVerdictLLMSchema>;
