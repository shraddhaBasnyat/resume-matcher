import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

export const NarrativeGapLLMSchema = z.object({
  transferableStrengths: z
    .array(z.string())
    .describe(
      "Skills and experiences this candidate already has that map explicitly to the role requirements. " +
        "Draw directly from fitAnalysis.keyStrengths — name them specifically, not as generic categories.",
    ),
  reframingSuggestions: z
    .array(z.string())
    .describe(
      "Specific, actionable ways to retell existing experience so it reads as directly relevant to this role. " +
        "Each suggestion must be specific to this candidate and this job — if it could have been written " +
        "without reading both, rewrite it. Do not suggest acquiring new skills.",
    ),
  missingSkills: z
    .array(z.string())
    .describe(
      "Genuine gaps only — skills the role requires that this candidate does not have, " +
        "drawn from fitAnalysis.experienceGaps. " +
        "Empty array is correct output when there are no real gaps. " +
        "Do not disguise reframing suggestions as missing skills.",
    ),
});

export type NarrativeGapLLMOutput = z.infer<typeof NarrativeGapLLMSchema>;

const SYSTEM = `You are a career advisor producing reframing advice for a candidate whose experience fits the role but whose resume does not show it.

Context: This candidate has a fitScore between 50 and 74. The gap is not in their background — it is in how their resume frames it.

You are given fit_analysis: a structured assessment containing careerTrajectory, keyStrengths (specific to this role), and experienceGaps.

Rules:
- transferableStrengths: draw directly from fitAnalysis.keyStrengths. Name the specific skills and experiences — not generic categories. What from their background maps to this role?
- reframingSuggestions: specific ways to retell existing experience to fit this role's narrative. Each item must be specific to this candidate and this job. Specificity test: could it have been written without reading fit_analysis? If yes, rewrite it. Do not suggest learning new skills.
- missingSkills: draw from fitAnalysis.experienceGaps — real gaps only. Empty array is correct output when there are no genuine missing skills. Do not fill this with reframing suggestions.

The insight this candidate needs: the experience is right, the framing is wrong. Do not produce hollow reassurance. Do not manufacture gaps.`;

const HUMAN = `Fit Analysis:
{fit_analysis}

Produce reframing advice for this candidate.`;

export function buildNarrativeGapChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model.withStructuredOutput(NarrativeGapLLMSchema);

  return {
    invoke: async (
      input: { fit_analysis: string },
      config?: { runName?: string },
    ): Promise<NarrativeGapLLMOutput> => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture(function (id) {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = NarrativeGapLLMSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "analyze-narrative-gap",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}
