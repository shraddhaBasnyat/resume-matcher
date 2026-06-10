import { z } from "zod";

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
