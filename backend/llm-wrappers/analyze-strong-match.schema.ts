import { z } from "zod";
import { ReframingItemSchema } from "../src/types/fit-advice.js";

// -----------------------------------------------------------------------
// Both confirmed_fit and invisible_expert use this wrapper.
// For confirmed_fit: ATS advice fields are empty arrays, closingSummary is brief and validating.
// For invisible_expert: full ATS remediation content.
// -----------------------------------------------------------------------

export const InvisibleExpertLLMSchema = z.object({
  standoutStrengths: z
    .array(z.string())
    .describe(
      "2–4 specific strengths from this candidate's background relative to this role. " +
        "Each item must name actual skills or experience from fitAnalysis.keyStrengths. Maximum 4 items. " +
        "Format each as: \"[strength name] — [specific resume evidence]\" using \" — \" as separator. " +
        "Empty array for confirmed_fit.",
    ),
  atsRealityCheck: z
    .array(z.string())
    .describe(
      "Bullet points explaining why this candidate is invisible to automated filters despite strong fit. " +
        "Each bullet must reference specific items from the ats_ranking list provided. " +
        "Format each as: \"[ATS issue name] — [specific impact referencing ats_ranking]\". " +
        "Core insight: the problem is a translation issue between how they describe their work " +
        "and how the machine reads it — not a talent gap. Maximum 4 bullets. " +
        "Empty array for confirmed_fit.",
    ),
  terminologySwaps: z
    .array(ReframingItemSchema)
    .describe(
      "Specific terminology substitutions drawn from ats_ranking. " +
        "Each item is a structured object: " +
        "before = resume term currently used; " +
        "after = JD term that should replace it; " +
        "reason = why this swap improves discoverability for this specific role. " +
        "Empty array for confirmed_fit.",
    ),
  keywordsToAdd: z
    .array(z.string())
    .describe(
      "Keywords from the job posting that are missing from the resume. " +
        "Drawn from ats_ranking. Each item is a single keyword or short phrase to add. " +
        "Most important keywords first. " +
        "Empty array for confirmed_fit.",
    ),
  leadWithThese: z
    .array(z.string().min(1))
    .describe(
      "2–3 specific experiences from this resume to open the interview with. " +
        "Reference actual roles and achievements — not generic advice. " +
        "Format each as: \"[experience name] — [why it leads well for this role]\". " +
        "Empty array for invisible_expert.",
    ),
  expectTheseQuestions: z
    .array(z.string().min(1))
    .describe(
      "Likely interview questions the hiring manager will ask given this JD and this candidate's background. " +
        "Specific to both documents — not generic behavioural questions. " +
        "Format each as: \"[interview question] — [why the interviewer will ask it given this JD and resume]\". " +
        "Empty array for invisible_expert.",
    ),
  watchOutFor: z
    .array(z.string().min(1))
    .describe(
      "1–2 areas where the interviewer may probe harder given the role requirements. " +
        "Confirmed fit does not mean perfect fit — name the thinner areas honestly. " +
        "Format each as: \"[risk area name] — [why it's thinner for this role]\". Most serious risks first. " +
        "Empty array for invisible_expert.",
    ),
  closingSummary: z.string().min(1).describe(
    "Scenario-aware synthesis of the fit and ATS pictures. " +
      "For confirmed_fit: brief and validating — one or two sentences confirming the match is solid. " +
      "For invisible_expert: names the two-signal contrast explicitly (strong human fit, machine visibility gap). " +
      "Use fit_scenario_summary and ats_scenario_summary as source material.",
  ),
  verdictAha: z.string().min(1).describe(
    "One sentence pointing to the single most important result card for this candidate to look at first. " +
      "For confirmed_fit: surface the strongest signal. For invisible_expert: point to ATS remediation.",
  ),
});

export type InvisibleExpertLLMOutput = z.infer<typeof InvisibleExpertLLMSchema>;
