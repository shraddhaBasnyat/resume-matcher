import { SYSTEM, HUMAN } from "./analyze-fit.prompt.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  BattleCardVerdictSchema,
  AnalyzeFitLLMSchema,
} from "./analyze-fit.schema.js";

export { BattleCardVerdictSchema, AnalyzeFitLLMSchema };
export type { BattleCardBullet, AnalyzeFitLLMOutput } from "./analyze-fit.schema.js";

export function buildAnalyzeFitChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model.withStructuredOutput(AnalyzeFitLLMSchema);

  return {
    invoke: async (input: { resume_text: string; job_text: string }) => {
      const messages = await prompt.invoke(input);

      const result = await structuredModel.invoke(messages);

      const validated = AnalyzeFitLLMSchema.safeParse(result);
      if (!validated.success) {
        console.error("[validation-failed] analyze-fit", validated.error.flatten(), result);
        throw validated.error;
      }

      return validated.data;
    },
  };
}
