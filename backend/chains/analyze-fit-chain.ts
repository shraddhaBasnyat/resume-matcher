import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

export const BattleCardVerdictSchema = z.enum([
  "hard_gap",
  "framing_gap",
  "terminology_gap",
  "strong_match",
]);

export type BattleCardBullet = {
  requirement: string;
  evidence: string;
  verdict: z.infer<typeof BattleCardVerdictSchema>;
};

export const AnalyzeFitLLMSchema = z.object({
  fitScore: z.number().min(0).max(100),
  headline: z.string().min(1),
  battleCardBullets: z.array(z.object({
    requirement: z.string().min(1),
    evidence:    z.string().min(1),
    verdict:     BattleCardVerdictSchema,
  })),
  fitScenarioSummary: z.string().min(1),
  fitAha: z.string().min(1),
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
- headline: one short phrase capturing the core fit story — what this candidate is relative to what this role needs. It must encode both the match AND the gap if one exists. Not a summary of the candidate. Not a job title. Example for a 72: "Strong distributed systems background, domain gap from storefront to fulfillment." Example for a 90: "Direct match — platform engineering at scale with team leadership." 
- battleCardBullets: 3–5 structured bullets. Each bullet has three fields:
    requirement: what this role specifically requires — lead with the role, not the candidate
    evidence: the candidate's direct evidence against that requirement — specific, drawn from the resume
    verdict: one of four classifications:
      hard_gap        — the candidate genuinely lacks this qualification or experience
      framing_gap     — the experience exists but is described in a way that misses the role signal
      terminology_gap — the skill is present but named differently than the JD expects
      strong_match    — the candidate directly meets or exceeds this requirement
  The bullets collectively must explain why the score is not higher. If fitScore < 85, at least one bullet must be hard_gap, framing_gap, or terminology_gap. No motivational language. Specificity test: could this bullet have been written without reading both the resume AND the job description? If yes, rewrite it.
- fitScenarioSummary: one paragraph summarising the human fit picture in isolation — factual, no ATS context, no scenario tone yet. What is the core story — does the background map, partially map, or not map to this role and why? Direct and specific. No motivational language. This is read by verdict nodes which synthesise it with the ATS picture into the final closing summary.
- fitAha: one sentence — the sharpest human fit observation. Pure observation only, no advice, no fix language. Must be specific to this candidate and this role. Example: "Your Wayfair replatforming work maps directly to fulfillment automation — but your resume frames it as storefront engineering."
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
