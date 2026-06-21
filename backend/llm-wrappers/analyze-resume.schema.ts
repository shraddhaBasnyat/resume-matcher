import { z } from "zod";
import { RoleArchetype } from "./analyze-jd.schema.js";

export const DemonstratedVsClaimedItemSchema = z.object({
  bullet: z.string().min(1).describe("The resume bullet being assessed."),
  status: z.enum(["demonstrated", "claimed", "ambiguous"]).describe(
    "demonstrated: concrete evidence present (deployed systems, metrics, specific outcomes). " +
    "claimed: capability listed without supporting context or proof. " +
    "ambiguous: some context present but insufficient to confirm demonstrated depth.",
  ),
  evidencePresent: z.string().min(1).nullable().describe(
    "The specific evidence that makes this demonstrated — a metric, a deployed system, a named outcome. " +
    "Null if status is claimed or ambiguous.",
  ),
});

export const ScopeAmbiguityItemSchema = z.object({
  bullet: z.string().min(1).describe("The resume bullet being assessed."),
  ambiguous: z.boolean().describe("True if the scope of the work is unclear from the bullet alone."),
  reason: z.string().min(1).nullable().describe(
    "Why the scope is ambiguous — what information would clarify it. Null if ambiguous is false.",
  ),
});

export const ArchetypeTransitionSchema = z.object({
  from: RoleArchetype,
  to: RoleArchetype,
  signal: z.string().min(1).describe(
    "One sentence, factual — what in the resume drove this transition read. " +
    "No narrative language. Specific and grounded in the resume.",
  ),
});

export const AnalyzeResumeLLMSchema = z.object({
  candidateArchetype: RoleArchetype.describe(
    "The dominant archetype today — most recent and strongest career signals, not full career history. " +
    "Generalist career patterns should be classified as founding_engineer.",
  ),
  demonstratedVsClaimed: z.array(DemonstratedVsClaimedItemSchema).describe(
    "Assessment of every substantive bullet in the resume. " +
    "Skip section headers and role titles — assess bullets with actual content.",
  ),
  scopeAmbiguity: z.array(ScopeAmbiguityItemSchema).describe(
    "Bullets where the scope of work is unclear. " +
    "Empty array if all bullets have clear scope.",
  ),
  careerArcNote: z.object({
    transitions: z.array(ArchetypeTransitionSchema).describe(
      "Meaningful archetype shifts across the career. " +
      "Empty array if the career shows a consistent single archetype.",
    ),
  }),
  resumeAha: z.string().min(1).describe(
    "One sentence — the sharpest resume-only observation. " +
    "Must be specific to this candidate. No advice, no fix language. Pure observation.",
  ),
});

export type AnalyzeResumeLLMOutput = z.infer<typeof AnalyzeResumeLLMSchema>;
