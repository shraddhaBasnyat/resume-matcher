import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

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

const SYSTEM_PROMPT = `You are an ATS (Applicant Tracking System) compatibility analyser. Evaluate how well a resume will be parsed and ranked by automated recruiting systems.

Score the resume from 0 to 100:
- 80–100: Strong keyword coverage, clean formatting, terminology matches job posting
- 60–79: Moderate coverage, minor gaps or terminology mismatches
- 40–59: Notable keyword gaps or terminology issues that will suppress ranking
- 0–39: Significant gaps — resume will likely be filtered out by automated screening

machineRanking: list every keyword gap and terminology mismatch you detect. Each item should be a short, specific string identifying one gap. Examples:
- "resume uses 'front-end development'; job posting requires 'React'"
- "missing keyword: 'TypeScript'"
- "resume uses 'machine learning projects'; job posting requires 'production ML systems'"

Empty array is correct output when the resume covers the job's terminology well.

atsScenarioSummary: 2–3 sentences, plain language. Synthesise what the three layers found collectively. No fit context. No scenario tone. State what is true about the machine picture: parseability, knockout risks, and keyword discoverability.

atsAha: one sentence. The single most important thing you found. Pure observation — no advice, no fix language.`;

const HUMAN_PROMPT = `Resume Text:
{resume_text}

Job Description Text:
{job_text}

Analyse this resume for ATS compatibility against this job description.`;

export function buildAtsAnalysisChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const structuredModel = model.withStructuredOutput(AtsAnalysisSchema);

  return {
    invoke: async (
      input: { resume_text: string; job_text: string },
      config?: { runName?: string },
    ): Promise<AtsAnalysisOutput> => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture((id) => {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = AtsAnalysisSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "ats-analysis",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return {
        atsScore: validated.data.atsScore,
        machineParsing: ["// TODO: replace with programmatic resume parsing analysis"],
        machineRanking: validated.data.machineRanking,
        atsScenarioSummary: validated.data.atsScenarioSummary,
        atsAha: validated.data.atsAha,
      };
    },
  };
}
