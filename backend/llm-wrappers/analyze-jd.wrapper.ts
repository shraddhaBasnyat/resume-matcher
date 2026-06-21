import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM, HUMAN } from "./analyze-jd.prompt.js";
import { AnalyzeJDLLMSchema } from "./analyze-jd.schema.js";
import type { AnalyzeJDLLMOutput } from "./analyze-jd.schema.js";

export { AnalyzeJDLLMSchema };
export type { AnalyzeJDLLMOutput };

export const ANALYZE_JD_RUN_NAME = "AnalyzeJDRunnable";

export function buildAnalyzeJDRunnable(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const chain = prompt.pipe(model.withStructuredOutput(AnalyzeJDLLMSchema));

  return RunnableLambda.from(async (
    input: { job_text: string },
    config?: RunnableConfig,
  ): Promise<AnalyzeJDLLMOutput> => {
    const result = await chain.invoke(input, config);

    const validated = AnalyzeJDLLMSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${ANALYZE_JD_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return validated.data;
  }).withConfig({ runName: ANALYZE_JD_RUN_NAME });
}
