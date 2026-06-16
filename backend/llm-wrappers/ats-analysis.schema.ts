import { z } from "zod";

export const AtsAnalysisSchema = z.object({
  atsScore: z.number().min(0).max(100),
  machineRanking: z
    .array(z.string())
    .describe(
      "Keyword gaps and terminology mismatches between this resume and the job description. " +
        "Each item is a short string describing one gap, e.g. " +
        "'resume uses \"front-end development\"; job posting requires \"React\"' or " +
        "'missing keyword: \"Kubernetes\"'. Empty array if no gaps found.",
    ),
  atsScenarioSummary: z.string().min(1).describe(
    "2–3 sentences plain-language synthesis of what the ATS analysis found collectively. " +
      "No fit context. No scenario tone. No fix language. " +
      "Example: 'Resume is parseable with minor formatting issues. " +
      "One knockout risk around production deployment language. " +
      "Missing 3 of 4 key search terms the recruiter would filter on.'",
  ),
  atsAha: z.string().min(1).describe(
    "One sentence — the single most important ATS observation. " +
      "Pure finding only — no advice, no fix language, no card content. " +
      "Example: 'Your resume surfaces for Python and LangGraph but misses RAG and agentic systems — " +
      "the terms the recruiter is filtering for.'",
  ),
});

export type AtsAnalysisOutput = {
  atsScore: number;
  machineParsing: string[];
  machineRanking: string[];
  atsScenarioSummary: string;
  atsAha: string;
};
