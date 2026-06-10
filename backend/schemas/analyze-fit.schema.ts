import { z } from "zod";

export const BattleCardVerdictSchema = z.enum([
  "hard_gap",
  "framing_gap",
  "terminology_gap",
  "strong_match",
  "evidence_gap",
]).describe(
  "hard_gap: the candidate genuinely lacks this qualification or experience. " +
  "framing_gap: the experience exists but is described in a way that misses the role signal. " +
  "terminology_gap: the skill is present but named differently than the JD expects. " +
  "strong_match: the candidate directly meets or exceeds this requirement. " +
  "evidence_gap: the skill or experience is claimed on the resume but no concrete evidence supports it — the claim exists without proof.",
);

export type BattleCardBullet = {
  requirement: string;
  evidence: string;
  verdict: z.infer<typeof BattleCardVerdictSchema>;
};

export const AnalyzeFitLLMSchema = z.object({
  fitScore: z.number().min(0).max(100)
    .describe("Semantic fit from 0–100. Score based on career trajectory, transferable skills, and experience relative to the role. Not based on keyword overlap."),
  headline: z.string().min(1)
    .describe('One short phrase capturing the core fit story — what this candidate is relative to what this role needs. Must encode both the match AND the gap if one exists. Not a summary of the candidate. Not a job title. Example for a 72: "Strong distributed systems background, domain gap from storefront to fulfillment." Example for a 90: "Direct match — platform engineering at scale with team leadership."'),
  battleCardBullets: z.array(z.object({
    requirement: z.string().min(1)
      .describe("What this role specifically requires — lead with the role, not the candidate."),
    evidence: z.string().min(1)
      .describe("The candidate's direct evidence against that requirement — specific, drawn from the resume."),
    verdict: BattleCardVerdictSchema,
  })).describe("3–5 structured bullets. Each bullet has a requirement (what the role needs), evidence (candidate's proof against it), and verdict (one of four classifications). The bullets collectively must explain why the score is not higher."),
  fitScenarioSummary: z.string().min(1)
    .describe("One paragraph summarising the human fit picture in isolation — factual, no ATS context, no scenario tone yet. What is the core story — does the background map, partially map, or not map to this role and why? Direct and specific. No motivational language. Read by verdict nodes which synthesise it with the ATS picture into the final closing summary."),
  fitAha: z.string().min(1)
    .describe('One sentence — the sharpest human fit observation. Must be specific to this candidate and this role. Example: "Your Wayfair replatforming work maps directly to fulfillment automation — but your resume frames it as storefront engineering."'),
  sourceRole: z.string().min(1)
    .describe("The candidate's current or most recent role category. Use one of: backend_swe | frontend_swe | fullstack_swe | ai_agent_dev | ml_engineer | data_scientist | devops_engineer | product_manager | unknown."),
  targetRole: z.string().min(1)
    .describe("The role category being applied for. Same vocabulary as sourceRole."),
  fitAnalysis: z.object({
    careerTrajectory: z.string().min(1)
      .describe("The arc of the candidate's career. Where have they been and what direction are they moving? Infer from the full experience section."),
    keyStrengths: z.array(z.string().min(1))
      .describe("Specific strengths this candidate has that are relevant to THIS role. Name actual skills and experiences from the resume — not generic categories."),
    experienceGaps: z.array(z.string().min(1))
      .describe("Specific gaps between what this role requires and what this candidate has. If no gaps exist, return an empty array."),
    weakMatchReason: z.string().min(1)
      .describe('ALWAYS REQUIRED. If fitScore >= 50, return the string "NONE". If fitScore < 50, explain specifically and directly why the match is weak — what is missing and why it matters for this role. This field must never be omitted.'),
  }),
});

export type AnalyzeFitLLMOutput = z.infer<typeof AnalyzeFitLLMSchema>;
