import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
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
});

export type NarrativeGapLLMOutput = z.infer<typeof NarrativeGapLLMSchema>;

const SYSTEM = `You are a career advisor producing reframing advice for a candidate whose experience fits the role but whose resume does not show it.

Context: This candidate has a fitScore between 50 and 74. The gap is not in their background — it is in how their resume frames it.

You are given fit_analysis, fit_scenario_summary (human fit picture in isolation), and ats_scenario_summary (machine picture in isolation).

Rules:
- transferableStrengths: draw directly from fitAnalysis.keyStrengths. Name the specific skills and experiences — not generic categories. What from their background maps to this role?
- reframingSuggestions: structured objects, each with before (current resume phrasing), after (reframed for this role's language), and reason (why this reframe works for this specific role). Each item must be specific to this candidate and this job. Specificity test: could it have been written without reading fit_analysis? If yes, rewrite it. Do not suggest learning new skills.
- missingSkills: draw from fitAnalysis.experienceGaps — real gaps only. Empty array is correct output when there are no genuine missing skills. Do not fill this with reframing suggestions.
- closingSummary: synthesise fit_scenario_summary and ats_scenario_summary into a scenario-aware closing statement. Name the experience-is-right-framing-is-wrong insight explicitly. Mentor tone. One or two sentences.
- verdictAha: one sentence pointing to the single most important result card for this candidate to look at first.

The insight this candidate needs: the experience is right, the framing is wrong. Do not produce hollow reassurance. Do not manufacture gaps.`;

const HUMAN = `Fit Analysis:
{fit_analysis}

Human Fit Summary:
{fit_scenario_summary}

ATS Summary:
{ats_scenario_summary}

Produce reframing advice for this candidate.`;

export function buildNarrativeGapChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model.withStructuredOutput(NarrativeGapLLMSchema);

  return {
    invoke: async (
      input: { fit_analysis: string; fit_scenario_summary: string; ats_scenario_summary: string },
      config?: { runName?: string },
    ): Promise<NarrativeGapLLMOutput> => {
      const messages = await prompt.invoke(input);

      const result = await structuredModel.invoke(messages, config ?? {});

      const validated = NarrativeGapLLMSchema.safeParse(result);
      if (!validated.success) {
        console.error(`[validation-failed] ${config?.runName ?? "analyze-narrative-gap"}`, validated.error.flatten(), result);
        throw validated.error;
      }

      return validated.data;
    },
  };
}
