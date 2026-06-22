import { z } from "zod";
import { ReframingItemSchema } from "../src/types/fit-advice.js";

export const NarrativeGapLLMSchema = z.object({
  reframingSuggestions: z
    .array(ReframingItemSchema)
    .describe(
      "Specific ways to retell existing experience so it reads as directly relevant to this role. " +
        "Each item is a structured object: " +
        "before = current resume phrasing (exact quote or close paraphrase); " +
        "after = reframed version targeting this role's language; " +
        "reason = why this specific reframe works for this role. " +
        "Must be specific to this candidate and this job — if it could have been written without reading both, rewrite it. " +
        "Do not suggest acquiring new skills.",
    ),
  missingSkills: z
    .array(z.string())
    .describe(
      "Genuine gaps only — skills the role requires that this candidate does not have, " +
        "drawn from fitAnalysis.experienceGaps. " +
        "Order most critical gaps first. " +
        "Empty array is correct output when there are no real gaps. " +
        "Do not disguise reframing suggestions as missing skills.",
    ),
  verdictAha: z.string().min(1).describe(
    "One sentence pointing to the single most important result card. " +
      "What should this candidate look at first? Specific to this candidate's situation.",
  ),
});

export type NarrativeGapLLMOutput = z.infer<typeof NarrativeGapLLMSchema>;
