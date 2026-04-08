import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Resume } from "../types/api.js";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

const SOURCE_ROLE_VOCABULARY = [
  "backend_swe",
  "frontend_swe",
  "fullstack_swe",
  "ai_agent_dev",
  "ml_engineer",
  "data_scientist",
  "devops_engineer",
  "product_manager",
  "unknown",
] as const;

export const ResumeSchema: z.ZodType<Resume, z.ZodTypeDef, unknown> = z.object({
  name: z.string().describe("Full name of the candidate"),
  email: z.string().email().describe("Email address of the candidate"),
  phone: z.string().describe("Phone number of the candidate"),
  summary: z.string().optional().describe("Professional summary or objective statement"),
  location: z.string().optional().describe("City, state, or country of the candidate"),
  skills: z
    .array(z.string())
    .describe(
      "Individual skills as atomic items — e.g. 'React', 'Python', 'Docker'. Do NOT group them into categories like 'Frontend: React, Vue'."
    ),
  experience: z
    .array(
      z.object({
        company: z.string().describe("Company name"),
        role: z.string().describe("Job title or role"),
        years: z.number().describe("Number of years in this role"),
      })
    )
    .describe("Work experience entries"),
  education: z
    .array(
      z.object({
        degree: z.string().describe("Degree or certification obtained"),
        institution: z.string().describe("Name of the institution"),
      })
    )
    .describe("Education entries"),
  totalYearsExperience: z
    .number()
    .optional()
    .describe("Total years of professional experience, calculated by summing the experience array"),
  keywords: z
    .array(z.string())
    .optional()
    .describe(
      "Important technical and domain-specific terms from the resume useful for job matching (e.g. 'microservices', 'agile', 'NLP')"
    ),
  careerNarrative: z
    .object({
      trajectory: z.string().default("").describe("The arc of the candidate's career progression"),
      dominantTheme: z.string().default("").describe("The recurring theme or throughline across roles"),
      inferredStrengths: z.array(z.string()).default([]).describe("Strengths inferred from the pattern of roles and accomplishments"),
      careerMotivation: z.string().default("").describe("What the candidate appears to move toward based on their choices"),
      resumeStoryGaps: z.array(z.string()).default([]).describe("Gaps, contradictions, or unexplained transitions in the career story"),
    })
    .describe("Inferred career narrative — read between the lines, do not summarize"),
  sourceRole: z
    .union([
      z.enum(SOURCE_ROLE_VOCABULARY),
      z.string().transform((): typeof SOURCE_ROLE_VOCABULARY[number] => "unknown"),
    ])
    .describe(
      `The candidate's current or most recent role category. Use controlled vocabulary only: ${SOURCE_ROLE_VOCABULARY.join(" | ")}. Infer semantically from the career trajectory — do not use the literal job title. Use "unknown" only when the role category genuinely cannot be determined.`
    ),
}) as z.ZodType<Resume, z.ZodTypeDef, unknown>;

export type { Resume };

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured information from the resume text provided by the user.

Follow these rules precisely:
- Extract skills as individual atomic items (e.g. "React", "Python", "Docker"). Never group them into categories like "Frontend: React, Vue".
- Calculate totalYearsExperience by summing the years across all experience entries.
- Extract keywords as important technical and domain-specific terms that would be useful for job matching (e.g. "microservices", "agile", "NLP", "REST APIs").
- For years in each experience entry, calculate from date ranges if provided, otherwise estimate from context.
- Only extract information explicitly stated in the resume.

When extracting careerNarrative, read between the lines of the resume.
Do not summarize — infer. What story does the progression of roles tell?
What themes appear across multiple jobs? What does this person move toward?
Where does the resume leave gaps or contradict itself?
Only infer what the evidence supports. Do not invent.

You MUST include the careerNarrative field in every response.
This is not optional. Read the full experience section carefully and infer:
- trajectory: the arc of roles e.g. 'Software Engineer → Tech Lead → Engineering Manager'
- dominantTheme: the consistent domain or problem space across all roles
- inferredStrengths: 3-5 strengths implied by the career progression, not just listed skills
- careerMotivation: what this person seems to move toward based on their choices
- resumeStoryGaps: skills or experiences listed elsewhere that have no supporting evidence in the experience section
Do not skip this field. Do not leave it null.

For sourceRole, infer the candidate's role category from their overall career trajectory.
Use ONLY these values: backend_swe | frontend_swe | fullstack_swe | ai_agent_dev | ml_engineer | data_scientist | devops_engineer | product_manager | unknown
Choose the value that best describes their dominant professional identity, not just their most recent title.
Use "unknown" only when the role category genuinely cannot be determined from the resume.`;

const HUMAN_PROMPT = `Parse the following resume and extract the structured data:

{resume_text}`;

export function buildResumeChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const structuredModel = model.withStructuredOutput(ResumeSchema);

  return {
    invoke: async (input: { resume_text: string }) => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture((id) => {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        runName: "parse-resume",
        callbacks: [capture],
      });

      const validated = ResumeSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: "parse-resume",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}
