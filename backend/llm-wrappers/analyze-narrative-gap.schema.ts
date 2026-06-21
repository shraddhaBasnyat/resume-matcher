import { z } from "zod";
import { ReframingItemSchema } from "../src/types/fit-advice.js";

export const NarrativeGapLLMSchema = z.object({
  transferableStrengths: z
    .array(z.string())
    .describe(
      "Skills and experiences this candidate already has that map explicitly to the role requirements. " +
        "Draw directly from fitAnalysis.keyStrengths — name them specifically, not as generic categories. " +
        "Format each as: \"[strength name] — [specific resume evidence]\" using \" — \" as separator.",
    ),
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
  closingSummary: z.string().min(1).describe(
    "Scenario-aware synthesis of the fit picture and ATS picture together. " +
      "For narrative_gap: close with the reframe opportunity — name the experience-is-right-framing-is-wrong " +
      "insight explicitly. Mentor tone. One or two sentences.",
  ),
  verdictAha: z.string().min(1).describe(
    "One sentence pointing to the single most important result card. " +
      "What should this candidate look at first? Specific to this candidate's situation.",
  ),
  terminologyDiffs: z.array(z.object({
    location: z.string().min(1).describe("Role and bullet identifier, e.g. 'Senior Engineer @ Acme — bullet 2'"),
    swapLabel: z.string().min(1).describe("resumeUses → jdExpects, e.g. 'microservices → distributed systems'"),
    before: z.string().min(1).describe("Exact original sentence from the resume"),
    after: z.string().min(1).describe("Rewritten sentence with the terminology swap applied"),
  })).describe(
    "For each terminology mismatch assessed as legitimate: the exact sentence from the resume and its rewrite. " +
      "Drop mismatches silently where the analogy does not hold. Empty array when none are legitimate.",
  ),
});

export type NarrativeGapLLMOutput = z.infer<typeof NarrativeGapLLMSchema>;
