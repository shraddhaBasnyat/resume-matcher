import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ResumeSchema } from "./schemas";

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured information from the resume text provided by the user.
Be precise and extract only information that is explicitly stated in the resume.
For years of experience, calculate based on dates if available, otherwise estimate from context.`;

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
