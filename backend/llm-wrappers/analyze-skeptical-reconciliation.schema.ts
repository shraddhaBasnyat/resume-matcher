import { z } from "zod";

export const HonestVerdictLLMSchema = z.object({
  honestAssessment: z
    .array(z.string().min(1))
    .describe(
      "Bullet points explaining specifically why the gap is real. Build from fitAnalysis.weakMatchReason and " +
        "fitAnalysis.experienceGaps. Direct and specific — not cruel, not generic. " +
        "Format each as: \"[gap name] — [why it matters for this specific role]\". Most fundamental gaps first. " +
        "Specificity test: could this have been written without reading this resume and this job description? If yes, rewrite it.",
    ),
  closingSteps: z
    .array(z.string().min(1))
    .describe(
      "Specific steps to close the gap between this candidate's background and this role. " +
        "Each item must be tied to an actual gap identified in this match. Not generic career advice. " +
        "Order most urgent steps first. " +
        "If human context was provided, reflect that you considered it — explain why the gap persists " +
        "after what they shared and what closing it would genuinely require.",
    ),
  acknowledgement: z
    .array(z.string().min(1))
    .nullable()
    .describe(
      "If human context was provided: bullet points acknowledging what the candidate shared and why " +
        "the score still stands after considering it. Collaborative tone — they tried to help, meet them with respect. " +
        "Do not repeat the human context back to them. " +
        "If no human context was provided, set to null.",
    ),
  contextPrompt: z
    .string()
    .min(1)
    .nullable()
    .describe(
      "On first pass only (no human context yet): a specific question to ask the candidate that could change the assessment. " +
        "Must be genuinely answerable context that would affect the score — not rhetorical. " +
        "Set to null if the gap is so fundamental that no context would change the verdict, " +
        "or if human context has already been provided.",
    ),
  closingSummary: z.string().min(1).describe(
    "Scenario-aware synthesis of the fit and ATS pictures — the most emotionally important piece of writing in the output. " +
      "Direct and respectful, mentor not rejection machine. " +
      "If HITL fired and context shifted the assessment, acknowledge it here. " +
      "Use fit_scenario_summary and ats_scenario_summary as source material.",
  ),
  verdictAha: z.string().min(1).describe(
    "One sentence. On first pass: points to the HITL context question. " +
      "On second pass: reflects whether context shifted the assessment. " +
      "Points the candidate to the most important thing to look at.",
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

export type HonestVerdictLLMOutput = z.infer<typeof HonestVerdictLLMSchema>;
