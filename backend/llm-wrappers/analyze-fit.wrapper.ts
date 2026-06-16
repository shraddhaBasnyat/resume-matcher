import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM, HUMAN } from "./analyze-fit.prompt.js";
import { BattleCardVerdictSchema, AnalyzeFitLLMSchema } from "./analyze-fit.schema.js";
import type { BattleCardBullet, AnalyzeFitLLMOutput } from "./analyze-fit.schema.js";

export { BattleCardVerdictSchema, AnalyzeFitLLMSchema };
export type { BattleCardBullet, AnalyzeFitLLMOutput };

export const ANALYZE_FIT_RUN_NAME = "AnalyzeFitRunnable";

export function buildAnalyzeFitRunnable(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const chain = prompt.pipe(model.withStructuredOutput(AnalyzeFitLLMSchema));

  return RunnableLambda.from(async (
    input: { resume_text: string; job_text: string },
    config?: RunnableConfig,
  ): Promise<AnalyzeFitLLMOutput> => {
    const result = await chain.invoke(input, config);

    const validated = AnalyzeFitLLMSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${ANALYZE_FIT_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return validated.data;
  }).withConfig({ runName: ANALYZE_FIT_RUN_NAME });
}
