import { z } from "zod";

export const PublicMatchResponseSchema = z.object({
  scenarioId: z.enum(["confirmed_fit", "invisible_expert", "narrative_gap", "honest_verdict"]),
  fitScore: z.number(),
  battleCard: z.object({
    headline: z.string(),
    bullets: z.array(z.object({
      requirement: z.string(),
      evidence:    z.string(),
      verdict:     z.enum(["hard_gap", "framing_gap", "terminology_gap", "strong_match"]),
    })),
  }),
  fitAdvice: z.array(z.object({
    key: z.string(),
    bulletPoints: z.array(z.string()),
  })),
  atsProfile: z.object({
    atsScore: z.number().nullable(),
    machineParsing: z.array(z.string()),
    machineRanking: z.array(z.string()),
  }),
  scenarioSummary: z.object({ text: z.string() }),
  threadId: z.string(),
  _meta: z.object({ durationMs: z.number() }),
});

export type PublicMatchResponse = z.infer<typeof PublicMatchResponseSchema>;
