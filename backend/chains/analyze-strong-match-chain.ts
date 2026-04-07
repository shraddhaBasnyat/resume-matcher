import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

// -----------------------------------------------------------------------
// confirmed_fit — fitScore >= 75, atsScore >= 75 or undefined
// -----------------------------------------------------------------------

export const ConfirmedFitLLMSchema = z.object({
  confirmation: z
    .string()
    .describe(
      "One paragraph confirming why this candidate is a strong match for this specific role. " +
        "Must be specific to this resume and this job — could not have been written without reading both. " +
        "Affirming without padding.",
    ),
  standoutStrengths: z
    .array(z.string())
    .describe(
      "2–4 specific strengths that make this candidate stand out for this role. " +
        "Each item must name an actual skill or experience from the resume relative to the job requirements. " +
        "Maximum 4 items — do not pad to reach a count.",
    ),
  minorGaps: z
    .array(z.string())
    .describe(
      "Genuine gaps only. Empty array is correct output when gaps are trivial. " +
        "Do not manufacture gaps to appear balanced.",
    ),
});

export type ConfirmedFitLLMOutput = z.infer<typeof ConfirmedFitLLMSchema>;

const CONFIRMED_FIT_SYSTEM = `You are a career advisor producing a fit validation for a candidate with strong semantic match to a job.

Rules:
- confirmation: one paragraph validating their fit. Must reference actual resume content and job requirements — if it could have been written without reading either document, rewrite it. Affirming and specific.
- standoutStrengths: 2–4 items. Each must name an actual skill, experience, or trait from this resume relative to this specific role. Maximum 4 — do not pad to reach a count.
- minorGaps: genuine gaps only. Empty array is the correct output when there is nothing material to flag. Do not manufacture gaps to appear balanced.

This candidate is qualified. They want confirmation, not advice. Sparse output is correct. Padding erodes trust.`;

const CONFIRMED_FIT_HUMAN = `Resume Data:
{resume_data}

Job Description Data:
{job_data}

Match Result:
{match_result}

Produce a fit validation for this candidate.`;

export function buildConfirmedFitChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", CONFIRMED_FIT_SYSTEM],
    ["human", CONFIRMED_FIT_HUMAN],
  ]);

  const structuredModel = model
    .withStructuredOutput(ConfirmedFitLLMSchema);

  return {
    invoke: async (
      input: { resume_data: string; job_data: string; match_result: string },
      config?: { runName?: string },
    ): Promise<ConfirmedFitLLMOutput> => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture((id) => {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = ConfirmedFitLLMSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "analyze-strong-match-confirmed-fit",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}

// -----------------------------------------------------------------------
// invisible_expert — fitScore >= 75, atsScore < 75
// -----------------------------------------------------------------------

export const InvisibleExpertLLMSchema = z.object({
  confirmation: z
    .string()
    .describe(
      "One paragraph establishing that this candidate is qualified for this role. " +
        "Land this before any ATS discussion — establish fit first. Specific to this resume and this role.",
    ),
  standoutStrengths: z
    .array(z.string())
    .describe(
      "2–4 specific strengths from this candidate's resume relative to this role. Maximum 4 items.",
    ),
  minorGaps: z
    .array(z.string())
    .describe(
      "Genuine semantic gaps only. Empty array is correct when there is nothing material to flag.",
    ),
  atsRealityCheck: z
    .string()
    .describe(
      "Narrative explaining why this candidate is invisible to automated filters despite strong fit. " +
        "Must reference the specific terminology gaps and missing keywords provided in the prompt. " +
        "Core insight to convey: the problem is not their talent — it is a translation issue between how they " +
        "describe their work and how the machine reads it. " +
        "Tone: knowledgeable friend explaining something frustrating but entirely fixable. " +
        "Specificity test: if this could be written without the provided terminology gaps and missing keywords, rewrite it.",
    ),
});

export type InvisibleExpertLLMOutput = z.infer<typeof InvisibleExpertLLMSchema>;

const INVISIBLE_EXPERT_SYSTEM = `You are a career advisor producing a fit validation for a highly qualified candidate who is invisible to automated resume filters.

Context: This candidate has strong semantic fit (fitScore >= 75) but a low ATS score. They are qualified — their resume language does not match what automated systems scan for. They are frustrated and starting to doubt their skills rather than their presentation.

Rules:
- confirmation: establish fit first — one paragraph. They are qualified. Land this before the ATS issue. Reference actual resume content and job requirements.
- standoutStrengths: 2–4 specific strengths from this resume for this role. Maximum 4 items.
- minorGaps: genuine semantic gaps only. Empty array is correct when there are none.
- atsRealityCheck: explain clearly why this candidate is invisible to automated filters. You are given specific terminology gaps and missing keywords — reference them directly. Do not write a generic explanation. The insight to deliver: the problem is not their talent, it is a translation issue between how they describe their work and how the machine reads it. Tone: knowledgeable friend explaining something frustrating but entirely fixable.

Specificity test: could atsRealityCheck be written without the provided terminology gaps and missing keywords? If yes, rewrite it.`;

const INVISIBLE_EXPERT_HUMAN = `Resume Data:
{resume_data}

Job Description Data:
{job_data}

Match Result:
{match_result}

ATS Terminology Gaps (resume uses X; job posting requires Y):
{terminology_gaps}

ATS Missing Keywords:
{missing_keywords}

ATS Layout Flags:
{layout_flags}

Produce a fit validation with ATS reality check for this candidate.`;

export function buildInvisibleExpertChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", INVISIBLE_EXPERT_SYSTEM],
    ["human", INVISIBLE_EXPERT_HUMAN],
  ]);

  const structuredModel = model
    .bind({ temperature: 0 })
    .withStructuredOutput(InvisibleExpertLLMSchema);

  return {
    invoke: async (
      input: {
        resume_data: string;
        job_data: string;
        match_result: string;
        terminology_gaps: string;
        missing_keywords: string;
        layout_flags: string;
      },
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
