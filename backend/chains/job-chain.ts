import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Job } from "../types/api.js";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";

const TARGET_ROLE_VOCABULARY = [
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

export const JobSchema: z.ZodType<Job, z.ZodTypeDef, unknown> = z.object({
  title: z.string().describe("Job title"),
  company: z.string().optional().describe("Company name"),
  requiredSkills: z.array(z.string()).describe("Skills explicitly required for the role"),
  niceToHaveSkills: z.array(z.string()).describe("Skills listed as preferred or nice-to-have"),
  keywords: z.array(z.string()).describe("Important technical and domain keywords from the job description"),
  experienceYears: z.number().optional().describe("Minimum years of experience required"),
  seniorityLevel: z
    .enum(["junior", "mid", "senior", "lead", "manager"])
    .optional()
    .describe("Inferred seniority level of the role"),
  targetRole: z
    .union([
      z.enum(TARGET_ROLE_VOCABULARY),
      z.string().transform((): typeof TARGET_ROLE_VOCABULARY[number] => "unknown"),
    ])
    .describe(
      `The role category this job is hiring for. Use controlled vocabulary only: ${TARGET_ROLE_VOCABULARY.join(" | ")}. Infer semantically from the role's responsibilities and requirements — do not use the literal job title. Use "unknown" only when the role category genuinely cannot be determined.`
    ),
});

export type { Job };
export type JobDescription = Job;

const SYSTEM_PROMPT = `You are an expert job description parser. Extract structured information from the job description text.

Follow these rules:
- Extract required skills as individual atomic items (e.g. "React", "Python").
- Extract nice-to-have skills separately from required skills.
- Extract important technical and domain keywords for matching.
- Estimate required years of experience from the text; omit if not mentioned.
- Infer seniority level from titles and expectations (junior/mid/senior/lead/manager); omit if unclear.

For targetRole, infer the role category this job is hiring for from its responsibilities and requirements.
Use ONLY these values: backend_swe | frontend_swe | fullstack_swe | ai_agent_dev | ml_engineer | data_scientist | devops_engineer | product_manager | unknown
Choose the value that best describes what type of professional would be hired for this role.
Use "unknown" only when the role category genuinely cannot be determined.`;

const HUMAN_PROMPT = "Parse the following job description and extract the structured data:\n\n{job_text}";

export function buildJobChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const structuredModel = model.withStructuredOutput(JobSchema);

  return {
    invoke: async (input: { job_text: string }) => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture((id) => {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        runName: "parse-job",
        callbacks: [capture],
      });

      const validated = JobSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: "parse-job",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}
