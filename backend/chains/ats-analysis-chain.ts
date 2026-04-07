import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

export const LayoutFlagSchema = z.enum([
  "multi_column_layout",
  "tables",
  "text_boxes",
  "headers_footers",
  "icons_symbols",
  "embedded_images",
  "non_standard_section_heading",
  "inconsistent_date_format",
  "missing_required_section",
]);

// TODO: layoutFlags should be derived deterministically from the PDF parse
// step rather than inferred by the LLM from plain text. Currently both nodes
// run in parallel — this would require parseResume to complete first and write
// structural layout flags to state (columns, tables, text boxes detected from
// the PDF object model directly), with atsAnalysis reading them as a pre-computed
// input. LLM layout inference from plain text is noisy by design.
export type LayoutFlag = z.infer<typeof LayoutFlagSchema>;

export const AtsAnalysisSchema = z.object({
  keywordPts: z.number().min(0).max(50),
  layoutPts: z.number().min(0).max(30),
  terminologyPts: z.number().min(0).max(20),
  missingKeywords: z
    .array(z.string())
    .describe(
      "Required keywords or phrases from the job description that do not appear verbatim or near-verbatim in the resume.",
    ),
  layoutFlags: z
    .array(LayoutFlagSchema)
    .describe(
      "Layout or formatting issues that would cause an ATS to fail or partially fail to parse this resume.",
    ),
  terminologyGaps: z
    .array(z.string())
    .describe(
      "Places where the resume uses a synonym or informal term instead of the exact language from the job posting (e.g. 'front-end development' instead of 'React').",
    ),
});

export type AtsAnalysisOutput = {
  atsScore: number;
  missingKeywords: string[];
  layoutFlags: LayoutFlag[];
  terminologyGaps: string[];
};

const SYSTEM_PROMPT = `You are an ATS (Applicant Tracking System) compatibility analyser. Evaluate how well a resume will be parsed and ranked by automated recruiting systems.

Score the resume from 0 to 100 using exactly three dimensions:

KEYWORD MATCH — 50 points maximum
Count how many required keywords and phrases from the job description appear verbatim or near-verbatim in the resume.
- Award full 50 points at ≥80% keyword coverage.
- Scale linearly below that (e.g. 60% coverage → 30 pts, rounded).

LAYOUT / PARSABILITY — 30 points maximum
Start at 30. Deduct approximately 4 points for each layout flag you detect.
Layout flags (only flag what you can infer from the text):
- multi_column_layout: text suggests side-by-side columns (e.g. skills listed beside contact info, two parallel blocks of content)
- tables: tabular structure evident from spacing or pipe characters
- text_boxes: content appears isolated from main flow, likely a floating box
- headers_footers: contact information or page numbers appear repeated at top/bottom in a way suggesting header/footer placement
- icons_symbols: bullet points using Unicode symbols, emoji, or decorative characters
- embedded_images: a photo or graphical element is referenced or space is reserved for one
- non_standard_section_heading: section titles that ATS cannot map to standard fields (e.g. "My Journey", "Expertise Arsenal")
- inconsistent_date_format: employment dates use mixed formats within the same document
- missing_required_section: a mandatory section (Work Experience, Education, or Skills) appears absent or unidentifiable

TERMINOLOGY ALIGNMENT — 20 points maximum
Award 20 points when the resume consistently uses the exact language from the job posting.
Deduct points where the resume substitutes synonyms or informal terms an ATS would not equate with the job posting's required term.

Output keywordPts, layoutPts, and terminologyPts as separate fields. Do not sum them — the final score will be calculated from your three values.

Additional outputs:
- missingKeywords: list every required keyword/phrase from the job description not found in the resume.
- layoutFlags: list only the flags you detected (empty array if none).
- terminologyGaps: array of short strings, one per gap, in the form "resume uses X; job posting requires Y."`;

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


  const structuredModel = model
    .withStructuredOutput(AtsAnalysisSchema);

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
        // Throw with structured error on unrecoverable failure
        AtsAnalysisSchema.parse({ ...result });
      }

      if (!validated.data) {
        throw new Error("ats-analysis-chain: validation succeeded but data is undefined");
      }
      const data = validated.data;
      const atsScore = Math.min(
        100,
        data.keywordPts + data.layoutPts + data.terminologyPts,
      );

      return {
        atsScore,
        missingKeywords: data.missingKeywords,
        layoutFlags: data.layoutFlags,
        terminologyGaps: data.terminologyGaps,
      };
    },
  };
}
