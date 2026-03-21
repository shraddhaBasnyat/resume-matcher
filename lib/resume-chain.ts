import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ResumeSchema } from "./schemas";

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured information from the resume text provided by the user.

Follow these rules precisely:
- Extract skills as individual atomic items (e.g. "React", "Python", "Docker"). Never group them into categories like "Frontend: React, Vue".
- Calculate totalYearsExperience by summing the years across all experience entries.
- Extract keywords as important technical and domain-specific terms that would be useful for job matching (e.g. "microservices", "agile", "NLP", "REST APIs").
- For years in each experience entry, calculate from date ranges if provided, otherwise estimate from context.
- Only extract information explicitly stated in the resume.`;

const HUMAN_PROMPT = `Parse the following resume and extract the structured data:

{resume_text}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildResumeChain(model: any) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const structuredModel = model.withStructuredOutput(ResumeSchema);

  return {
    invoke: async (input: { resume_text: string }) => {
      const messages = await prompt.invoke(input);
      return structuredModel.invoke(messages);
    },
  };
}
