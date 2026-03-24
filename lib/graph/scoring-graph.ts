import { StateGraph, interrupt, MemorySaver } from "@langchain/langgraph";
import { GraphState, type GraphStateType } from "./state";
import { makeParseResumeNode } from "./nodes/parse-resume";
import { makeParseJobNode } from "./nodes/parse-job";
import { makeScoreMatchNode } from "./nodes/score-match";
import { makeGapAnalysisNode } from "./nodes/gap-analysis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildScoringGraph(model: any) {
  const parseResume = makeParseResumeNode(model);
  const parseJob = makeParseJobNode(model);
  const scoreMatch = makeScoreMatchNode(model);
  const gapAnalysis = makeGapAnalysisNode(model);

  async function awaitHuman(_state: GraphStateType) {
    const humanContext = interrupt(
      "Score is below 60. Please provide additional context about your experience that your resume does not show."
    );
    return { humanContext: humanContext as string };
  }

  function routeAfterHuman(state: GraphStateType): "rescore" | "gapAnalysis" {
    return state.humanContext && state.humanContext.trim().length > 0 ? "rescore" : "gapAnalysis";
  }

  function routeAfterScore(state: GraphStateType): "gapAnalysis" | "awaitHuman" {
    return (state.matchResult?.score ?? 0) >= 60 ? "gapAnalysis" : "awaitHuman";
  }

  const workflow = new StateGraph(GraphState)
    .addNode("parseResume", parseResume)
    .addNode("parseJob", parseJob)
    .addNode("scoreMatch", scoreMatch)
    .addNode("awaitHuman", awaitHuman)
    .addNode("rescore", scoreMatch) // same logic, humanContext already in state
    .addNode("gapAnalysis", gapAnalysis)
    .addEdge("__start__", "parseResume")
    .addEdge("__start__", "parseJob")
    .addEdge("parseResume", "scoreMatch")
    .addEdge("parseJob", "scoreMatch")
    .addConditionalEdges("scoreMatch", routeAfterScore, {
      gapAnalysis: "gapAnalysis",
      awaitHuman: "awaitHuman",
    })
    .addConditionalEdges("awaitHuman", routeAfterHuman, {
      rescore: "rescore",
      gapAnalysis: "gapAnalysis",
    })
    .addEdge("rescore", "gapAnalysis")
    .addEdge("gapAnalysis", "__end__");

  // TODO: Replace MemorySaver with a durable checkpointer (e.g., Redis/DB-backed)
  // to support HITL across server restarts, cold starts, and multi-instance deployments.
  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
