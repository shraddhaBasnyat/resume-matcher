import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM, HUMAN } from "./analyze-skeptical-reconciliation.prompt.js";
import { HonestVerdictLLMSchema } from "./analyze-skeptical-reconciliation.schema.js";
import type { HonestVerdictLLMOutput } from "./analyze-skeptical-reconciliation.schema.js";

export { HonestVerdictLLMSchema };
export type { HonestVerdictLLMOutput };

export const HONEST_VERDICT_RUN_NAME = "HonestVerdictRunnable";

export function buildHonestVerdictRunnable(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const chain = prompt.pipe(model.withStructuredOutput(HonestVerdictLLMSchema));

  return RunnableLambda.from(async (
    input: {
      fit_analysis: string;
      battle_card_bullets: string;
      jd_archetype_ideal: string;
      real_ask: string;
      demonstrated_vs_claimed: string;
      career_arc_note: string;
      human_context: string;
    },
    config?: RunnableConfig,
  ): Promise<HonestVerdictLLMOutput> => {
    const result = await chain.invoke(input, config);

    const validated = HonestVerdictLLMSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${HONEST_VERDICT_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return validated.data;
  }).withConfig({ runName: HONEST_VERDICT_RUN_NAME });
}
