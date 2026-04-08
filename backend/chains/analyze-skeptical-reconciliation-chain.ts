import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

export const HonestVerdictLLMSchema = z.object({
  honestAssessment: z
    .string()
    .describe(
      "One paragraph explaining specifically why the gap is real. Build from weakMatchReason and " +
        "narrativeAlignment in the match result. Direct and specific — not cruel, not generic. " +
        "Specificity test: could this have been written without reading this resume and this job description? If yes, rewrite it.",
    ),
  closingSteps: z
    .array(z.string())
    .describe(
      "Specific steps to close the gap between this candidate's background and this role. " +
        "Each item must be tied to an actual gap identified in this match. Not generic career advice. " +
        "If human context was provided, reflect that you considered it — explain why the gap persists " +
        "after what they shared and what closing it would genuinely require.",
    ),
  acknowledgement: z
    .string()
    .min(1)
    .nullable()
    .describe(
      "If human context was provided: one sentence acknowledging what the candidate shared and why " +
        "the score still stands after considering it. Collaborative tone — they tried to help, meet them with respect. " +
        "Do not repeat the human context back to them. " +
        "If no human context was provided, set to null.",
    ),
});

export type HonestVerdictLLMOutput = z.infer<typeof HonestVerdictLLMSchema>;

const SYSTEM = `You are a career advisor delivering an honest verdict to a candidate whose semantic fit score is below 50.

The gap between this candidate and this role is real. Your job is to explain it clearly and specifically so they can make an informed decision. Tone: trusted mentor delivering difficult news — direct, not cruel, not dismissive.

Rules:
- honestAssessment: one paragraph. Build from weakMatchReason and narrativeAlignment in the match result. Explain why the gap exists — what experience or skills are missing and why that matters for this specific role. Do not pad with encouraging language. Specificity test: could this have been written without reading this resume and this job description? If yes, rewrite it.
- closingSteps: specific steps to close the gap. Each step must be tied to an actual gap identified in this match — not generic advice. If human context was provided (see below), closingSteps should reflect that you considered it: not generic next steps, but why this specific gap persists after what they shared and what closing it would genuinely require.
- acknowledgement: if human context was provided, write one sentence acknowledging what the candidate shared and why the score still stands after considering it. Tone: collaborative — they tried to help, meet them with respect. Do not repeat the human context back to them. If no human context was provided, set acknowledgement to null.

Do not manufacture hope. Do not pad. Clarity over comfort.`;

const HUMAN = `Resume Data:
{resume_data}

Job Description Data:
{job_data}

Match Result:
{match_result}

{weak_match_reason_block}{human_context}Deliver an honest verdict for this candidate.`;

export function buildHonestVerdictChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model.withStructuredOutput(HonestVerdictLLMSchema);

  return {
    invoke: async (
      input: {
        resume_data: string;
        job_data: string;
        match_result: string;
        weak_match_reason_block: string;
        human_context: string;
      },
      config?: { runName?: string },
    ): Promise<HonestVerdictLLMOutput> => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture(function (id) {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = HonestVerdictLLMSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "analyze-skeptical-reconciliation",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}
