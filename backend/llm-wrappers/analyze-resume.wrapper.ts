import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM, HUMAN } from "./analyze-resume.prompt.js";
import { AnalyzeResumeLLMSchema } from "./analyze-resume.schema.js";
import type { AnalyzeResumeLLMOutput } from "./analyze-resume.schema.js";

export { AnalyzeResumeLLMSchema };
export type { AnalyzeResumeLLMOutput };

export const ANALYZE_RESUME_RUN_NAME = "AnalyzeResumeRunnable";

export function buildAnalyzeResumeRunnable(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const chain = prompt.pipe(model.withStructuredOutput(AnalyzeResumeLLMSchema));

  return RunnableLambda.from(async (
    input: { resume_text: string },
    config?: RunnableConfig,
  ): Promise<AnalyzeResumeLLMOutput> => {
    const result = await chain.invoke(input, config);

    const validated = AnalyzeResumeLLMSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${ANALYZE_RESUME_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return validated.data;
  }).withConfig({ runName: ANALYZE_RESUME_RUN_NAME });
}
