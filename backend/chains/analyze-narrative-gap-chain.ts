import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

export const NarrativeGapLLMSchema = z.object({
  narrativeBridge: z
    .string()
    .describe(
      "One paragraph connecting this candidate's actual career story to the target role. " +
        "Build directly from the narrativeAlignment in the match result — do not re-derive independently. " +
        "This is the core output. Specificity is what makes it land, not encouraging language.",
    ),
  reframingSuggestions: z
    .array(z.string())
    .describe(
      "Specific, actionable ways to retell existing experience so it reads as directly relevant to this role. " +
        "Each suggestion must be specific to this resume and this job — if it could have been written without " +
        "reading both, rewrite it. Do not suggest acquiring new skills.",
    ),
  transferableStrengths: z
    .array(z.string())
    .describe(
      "Skills and experiences this candidate already has that map explicitly to the role requirements. " +
        "Name them specifically — not 'leadership experience' but the actual experience from the resume.",
    ),
  missingSkills: z
    .array(z.string())
    .describe(
      "Genuine gaps only — skills the role requires that this candidate does not have. " +
        "Empty array is correct output when there are no real gaps. " +
        "Do not disguise reframing suggestions as missing skills.",
    ),
});

export type NarrativeGapLLMOutput = z.infer<typeof NarrativeGapLLMSchema>;

const SYSTEM = `You are a career advisor producing reframing advice for a candidate whose experience fits the role but whose resume does not show it.

Context: This candidate has a fitScore between 50 and 74. The gap is not in their background — it is in how their resume frames it. They feel like an imposter despite being qualified.

Rules:
- narrativeBridge: one paragraph connecting their actual career story to this role. Build directly from the narrativeAlignment field in the match result. Specificity is what makes it land — not encouraging language.
- reframingSuggestions: specific ways to retell existing experience to fit this role's narrative. Each item must be specific to this resume and this job. Specificity test: could it have been written without reading both? If yes, rewrite it. Do not suggest learning new skills.
- transferableStrengths: name the specific skills and experiences from this resume that map to this role. Not generic categories — actual content from the resume.
- missingSkills: real gaps only. Empty array is correct output when there are no genuine missing skills. Do not fill this with reframing suggestions or stretch goals.

The insight this candidate needs: the experience is right, the framing is wrong. Do not produce hollow reassurance. Do not manufacture gaps.`;

const HUMAN = `Resume Data:
{resume_data}

Job Description Data:
{job_data}

Match Result:
{match_result}

{ats_context}
Produce reframing advice for this candidate.`;

export function buildNarrativeGapChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model
    .bind({ temperature: 0 })
    .withStructuredOutput(NarrativeGapLLMSchema);

  return {
    invoke: async (
      input: {
        resume_data: string;
        job_data: string;
        match_result: string;
        ats_context: string;
      },
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
