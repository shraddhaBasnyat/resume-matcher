import { ChatAnthropic } from "@langchain/anthropic";
import { buildAnalyzeFitChain } from "../../../chains/analyze-fit-chain.js";

export default class AnalyzeFitProvider {
  id(): string {
    return "analyze-fit-provider";
  }

  async callApi(_prompt: string, context: { vars: Record<string, string> }) {
    try {
      const model = new ChatAnthropic({
        model: "claude-haiku-4-5-20251001",
        temperature: 0.3,
      });

      const result = await buildAnalyzeFitChain(model).invoke({
        resume_text: context.vars.resume_text,
        job_text: context.vars.job_text,
      });

      return {
        output: JSON.stringify(result),
        prompt: `Resume Text:\n${context.vars.resume_text}\n\nJob Description Text:\n${context.vars.job_text}`,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
}
