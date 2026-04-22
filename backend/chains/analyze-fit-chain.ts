import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

export const AnalyzeFitLLMSchema = z.object({
  fitScore: z.number().min(0).max(100),
  headline: z.string().min(1),
  battleCardBullets: z.array(z.string().min(1)),
  scenarioSummary: z.string().min(1),
  sourceRole: z.string().min(1),
  targetRole: z.string().min(1),
  fitAnalysis: z.object({
    careerTrajectory: z.string().min(1),
    keyStrengths: z.array(z.string().min(1)),
    experienceGaps: z.array(z.string().min(1)),
    weakMatchReason: z.string().min(1),
  }),
});

export type AnalyzeFitLLMOutput = z.infer<typeof AnalyzeFitLLMSchema>;

const SYSTEM = `You are a career analyst producing a forensic fit assessment between a candidate and a role.

Your output is factual and cold. No advice, no encouragement, no reframing suggestions. Facts only.

Rules:
- fitScore: semantic fit from 0–100. Score based on career trajectory, transferable skills, and experience relative to the role. Not based on keyword overlap.
- headline: one short phrase capturing who this candidate is relative to this specific role. Must be specific to both documents — not a generic title.
- battleCardBullets: 3–5 bullets supporting the headline. Each must reference actual content from the resume relative to the job. Specificity test: could a bullet have been written without reading both documents? If yes, rewrite it.
- scenarioSummary: one paragraph summarising the fit picture. What is the core story — does the background map, partially map, or not map to this role and why? Direct and specific. No motivational language.
- sourceRole: the candidate's current or most recent role category. Use one of: backend_swe | frontend_swe | fullstack_swe | ai_agent_dev | ml_engineer | data_scientist | devops_engineer | product_manager | unknown.
- targetRole: the role category being applied for. Same vocabulary as sourceRole.
- fitAnalysis.careerTrajectory: the arc of the candidate's career. Where have they been and what direction are they moving? Infer from the full experience section.
- fitAnalysis.keyStrengths: specific strengths this candidate has that are relevant to THIS role. Name actual skills and experiences from the resume — not generic categories.
- fitAnalysis.experienceGaps: specific gaps between what this role requires and what this candidate has. If no gaps exist, return an empty array.
- fitAnalysis.weakMatchReason: ALWAYS REQUIRED. If fitScore >= 50, return the string "NONE". If fitScore < 50, explain specifically and directly why the match is weak — what is missing and why it matters for this role. This field must never be omitted.`;

const HUMAN = `Resume Text:
{resume_text}

Job Description Text:
{job_text}

Produce a fit assessment for this candidate against this role.`;

export function buildAnalyzeFitChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model.withStructuredOutput(AnalyzeFitLLMSchema);

  return {
    invoke: async (
      input: { resume_text: string; job_text: string },
      config?: { runName?: string },
    ): Promise<AnalyzeFitLLMOutput> => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture(function (id) {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = AnalyzeFitLLMSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "analyze-fit",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}
