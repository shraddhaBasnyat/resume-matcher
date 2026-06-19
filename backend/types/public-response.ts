import { z } from "zod";
import { EvidenceItemSchema, ReframingItemSchema, TaggedItemSchema } from "../src/types/fit-advice.js";

export const PublicMatchResponseSchema = z.object({
  scenarioId: z.enum(["confirmed_fit", "invisible_expert", "narrative_gap", "honest_verdict"]),
  fitScore: z.number(),
  battleCard: z.object({
    headline: z.string(),
    bullets: z.array(z.object({
      requirement: z.string(),
      evidence:    z.string(),
      verdict:     z.enum(["hard_gap", "framing_gap", "terminology_gap", "strong_match", "evidence_gap"]),
    })),
  }),
  fitAdvice: z.array(z.union([
    z.object({ key: z.literal("transferable_strengths"), items: z.array(EvidenceItemSchema)  }),
    z.object({ key: z.literal("reframing_suggestions"),  items: z.array(ReframingItemSchema) }),
    z.object({ key: z.literal("missing_skills"),         items: z.array(TaggedItemSchema)    }),
    z.object({ key: z.literal("lead_with_these"),        items: z.array(EvidenceItemSchema)  }),
    z.object({ key: z.literal("expect_these_questions"), items: z.array(EvidenceItemSchema)  }),
    z.object({ key: z.literal("watch_out_for"),          items: z.array(EvidenceItemSchema)  }),
    z.object({ key: z.literal("standout_strengths"),     items: z.array(EvidenceItemSchema)  }),
    z.object({ key: z.literal("ats_reality_check"),      items: z.array(EvidenceItemSchema)  }),
    z.object({ key: z.literal("terminology_swaps"),      items: z.array(ReframingItemSchema) }),
    z.object({ key: z.literal("keywords_to_add"),        items: z.array(TaggedItemSchema)    }),
    z.object({ key: z.literal("honest_assessment"),      items: z.array(EvidenceItemSchema)  }),
    z.object({ key: z.literal("closing_steps"),          items: z.array(TaggedItemSchema)    }),
    z.object({ key: z.literal("acknowledgement"),        items: z.array(EvidenceItemSchema)  }),
  ])),
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
