import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

// -----------------------------------------------------------------------
// invisible_expert — fitScore >= 75, atsScore < 75
// confirmed_fit makes no LLM call — the node returns fitAdvice: [] directly.
// -----------------------------------------------------------------------

export const InvisibleExpertLLMSchema = z.object({
  standoutStrengths: z
    .array(z.string())
    .describe(
      "2–4 specific strengths from this candidate's background relative to this role. " +
        "Each item must name actual skills or experience from fitAnalysis.keyStrengths. Maximum 4 items.",
    ),
  atsRealityCheck: z
    .array(z.string())
    .describe(
      "Bullet points explaining why this candidate is invisible to automated filters despite strong fit. " +
        "Each bullet must reference specific items from the ats_ranking list provided. " +
        "Core insight: the problem is a translation issue between how they describe their work " +
        "and how the machine reads it — not a talent gap. Maximum 4 bullets.",
    ),
  terminologySwaps: z
    .array(z.string())
    .describe(
      "Specific terminology substitutions drawn from ats_ranking. " +
        "Format each as: 'Replace \"X\" with \"Y\"' where X is the resume's current language " +
        "and Y is the job posting's required term.",
    ),
  keywordsToAdd: z
    .array(z.string())
    .describe(
      "Keywords from the job posting that are missing from the resume. " +
        "Drawn from ats_ranking. Each item is a single keyword or short phrase to add.",
    ),
});

export type InvisibleExpertLLMOutput = z.infer<typeof InvisibleExpertLLMSchema>;

const SYSTEM = `You are a career advisor producing ATS remediation advice for a highly qualified candidate who is invisible to automated resume filters.

Context: This candidate has strong semantic fit (fitScore >= 75) but a low ATS score. They are qualified — their resume language does not match what automated systems scan for.

You are given:
- fit_analysis: structured assessment of their strengths and gaps relative to the role
- ats_ranking: the specific keyword and terminology gaps the ATS detected

Rules:
- standoutStrengths: 2–4 bullets. Each must reference actual content from fit_analysis.keyStrengths relative to this role. Maximum 4. Do not pad to reach a count.
- atsRealityCheck: bullet points (not prose) explaining why they're invisible to ATS. Each bullet must reference specific items from ats_ranking. The insight to convey: this is a translation problem, not a talent problem.
- terminologySwaps: for each terminology mismatch in ats_ranking, produce one "Replace X with Y" item.
- keywordsToAdd: for each missing keyword in ats_ranking, produce one item naming the keyword to add.

Specificity test: could any item be written without reading fit_analysis and ats_ranking? If yes, rewrite it.`;

const HUMAN = `Fit Analysis:
{fit_analysis}

ATS Ranking (keyword and terminology gaps detected):
{ats_ranking}

Produce ATS remediation advice for this candidate.`;

export function buildInvisibleExpertChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model.withStructuredOutput(InvisibleExpertLLMSchema);

  return {
    invoke: async (
      input: { fit_analysis: string; ats_ranking: string },
      config?: { runName?: string },
    ): Promise<InvisibleExpertLLMOutput> => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture((id) => {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = InvisibleExpertLLMSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "analyze-strong-match-invisible-expert",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}
