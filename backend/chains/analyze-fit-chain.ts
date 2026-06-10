import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RootRunCapture, logValidationFailure } from "../langsmith.js";
import {
  BattleCardVerdictSchema,
  AnalyzeFitLLMSchema,
} from "../schemas/analyze-fit.schema.js";

export { BattleCardVerdictSchema, AnalyzeFitLLMSchema };
export type { BattleCardBullet, AnalyzeFitLLMOutput } from "../schemas/analyze-fit.schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _promptRaw = readFileSync(
  join(__dirname, "../prompts/analyze-fit.prompt.md"),
  "utf-8",
).replace(/\r\n/g, "\n");

const _systemMatch = _promptRaw.match(/^# SYSTEM\n([\s\S]*?)(?=\n# HUMAN)/m);
const _humanMatch  = _promptRaw.match(/^# HUMAN\n([\s\S]*)$/m);
if (!_systemMatch || !_humanMatch) {
  throw new Error("analyze-fit.prompt.md: missing # SYSTEM or # HUMAN section");
}
const SYSTEM = _systemMatch[1].trim();
const HUMAN  = _humanMatch[1].trim();

export function buildAnalyzeFitChain(model: BaseChatModel) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM],
    ["human", HUMAN],
  ]);

  const structuredModel = model.withStructuredOutput(AnalyzeFitLLMSchema);

  return {
    invoke: async (
      input: { resume_text: string; job_text: string },
      config?: { runName?: string },
    ) => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture(function (id) {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        ...(config ?? {}),
        callbacks: [capture],
      });

      const validated = AnalyzeFitLLMSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: config?.runName ?? "analyze-fit",
          errors: validated.error,
          rawOutput: result,
        });
        throw validated.error;
      }

      return validated.data;
    },
  };
}
