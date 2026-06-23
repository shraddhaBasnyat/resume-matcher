import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM, HUMAN } from "./analyze-strong-match.prompt.js";
import { InvisibleExpertLLMSchema } from "./analyze-strong-match.schema.js";
import type { InvisibleExpertLLMOutput } from "./analyze-strong-match.schema.js";

export { InvisibleExpertLLMSchema };
export type { InvisibleExpertLLMOutput };

export const INVISIBLE_EXPERT_RUN_NAME = "InvisibleExpertRunnable";

export function buildInvisibleExpertRunnable(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const chain = prompt.pipe(model.withStructuredOutput(InvisibleExpertLLMSchema));

  return RunnableLambda.from(async (
    input: {
      scenario: string;
      fit_analysis: string;
      ats_ranking: string;
      term_gaps: string;
      battle_card_bullets: string;
      demonstrated_vs_claimed: string;
      candidate_archetype: string;
      jd_archetype_ideal: string;
      jd_archetype_could_work: string;
      real_ask: string;
      archetype_context: string; // "" for base tier, scan/probe patterns for paid
    },
    config?: RunnableConfig,
  ): Promise<InvisibleExpertLLMOutput> => {
    const result = await chain.invoke(input, config);

    const validated = InvisibleExpertLLMSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${INVISIBLE_EXPERT_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return validated.data;
  }).withConfig({ runName: INVISIBLE_EXPERT_RUN_NAME });
}
