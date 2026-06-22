import { ChatAnthropic } from "@langchain/anthropic";
import { buildScoringGraph } from "../../graphs/scoring/scoring-graph.js";

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

      const graph = buildScoringGraph(model);

      const state = await graph.invoke(
        {
          resumeText: context.vars.resume_text,
          jobText: context.vars.job_text,
        },
        {
          configurable: { thread_id: crypto.randomUUID() },
          interruptBefore: ["routeVerdicts"],
          metadata: { run_type: "eval" },
        },
      );

      return {
        output: JSON.stringify({
          fitScore: state.fitScore,
          battleCardBullets: state.battleCardBullets,
          headline: state.headline,
          fitAha: state.fitAha,
          termGaps: state.termGaps,
          atsScore: state.atsScore,
          candidateArchetype: state.candidateArchetype,
          jdArchetype: state.jdArchetype,
        }),
        prompt: `Resume Text:\n${context.vars.resume_text}\n\nJob Description Text:\n${context.vars.job_text}`,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
}
