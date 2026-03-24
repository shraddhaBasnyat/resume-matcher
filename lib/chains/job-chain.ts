import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { JobSchema } from "../schemas/job-schema";
import { RootRunCapture, logValidationFailure } from "../langsmith";

const SYSTEM_PROMPT = `You are an expert job description parser. Extract structured information from the job description text.

Follow these rules:
- Extract required skills as individual atomic items (e.g. "React", "Python").
- Extract nice-to-have skills separately from required skills.
- Extract important technical and domain keywords for matching.
- Estimate required years of experience from the text; omit if not mentioned.
- Infer seniority level from titles and expectations (junior/mid/senior/lead/manager); omit if unclear.`;

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
        return JobSchema.parse({ ...result });
      }

      return validated.data;
    },
  };
}
