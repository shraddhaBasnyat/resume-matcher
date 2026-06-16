import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM_PROMPT, HUMAN_PROMPT } from "./ats-analysis.prompt.js";
import { AtsAnalysisSchema } from "./ats-analysis.schema.js";
import type { AtsAnalysisOutput } from "./ats-analysis.schema.js";

export { AtsAnalysisSchema };
export type { AtsAnalysisOutput };

export const ATS_ANALYSIS_RUN_NAME = "AtsAnalysisRunnable";

export function buildAtsAnalysisRunnable(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const chain = prompt.pipe(model.withStructuredOutput(AtsAnalysisSchema));

  return RunnableLambda.from(async (
    input: { resume_text: string; job_text: string },
    config?: RunnableConfig,
  ): Promise<AtsAnalysisOutput> => {
    const result = await chain.invoke(input, config);

    const validated = AtsAnalysisSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${ATS_ANALYSIS_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return {
      atsScore: validated.data.atsScore,
      machineParsing: ["// TODO: replace with programmatic resume parsing analysis"],
      machineRanking: validated.data.machineRanking,
      atsScenarioSummary: validated.data.atsScenarioSummary,
      atsAha: validated.data.atsAha,
    };
  }).withConfig({ runName: ATS_ANALYSIS_RUN_NAME });
}
