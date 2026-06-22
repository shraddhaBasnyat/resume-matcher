import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM, HUMAN } from "./analyze-narrative-gap.prompt.js";
import { NarrativeGapLLMSchema } from "./analyze-narrative-gap.schema.js";
import type { NarrativeGapLLMOutput } from "./analyze-narrative-gap.schema.js";

export { NarrativeGapLLMSchema };
export type { NarrativeGapLLMOutput };

export const NARRATIVE_GAP_RUN_NAME = "NarrativeGapRunnable";

export function buildNarrativeGapRunnable(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const chain = prompt.pipe(model.withStructuredOutput(NarrativeGapLLMSchema));

  return RunnableLambda.from(async (
    input: {
      fit_analysis: string;
      battle_card_bullets: string;
      candidate_archetype: string;
      jd_archetype_ideal: string;
      jd_archetype_could_work: string[];
      real_ask: string;
      career_arc_note: string;
      demonstrated_vs_claimed: string;
    },
    config?: RunnableConfig,
  ): Promise<NarrativeGapLLMOutput> => {
    const result = await chain.invoke(input, config);

    const validated = NarrativeGapLLMSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${NARRATIVE_GAP_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return validated.data;
  }).withConfig({ runName: NARRATIVE_GAP_RUN_NAME });
}
