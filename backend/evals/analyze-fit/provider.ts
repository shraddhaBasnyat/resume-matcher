import { ChatAnthropic } from "@langchain/anthropic";
import { buildAnalyzeFitRunnable } from "../../llm-wrappers/analyze-fit.wrapper.js";

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

      const result = await buildAnalyzeFitRunnable(model).invoke(
        {
          resume_text: context.vars.resume_text,
          job_text: context.vars.job_text,
        },
        { metadata: { run_type: "eval" } },
      );

      return {
        output: JSON.stringify(result),
        prompt: `Resume Text:\n${context.vars.resume_text}\n\nJob Description Text:\n${context.vars.job_text}`,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
}
