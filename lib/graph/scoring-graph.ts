import { StateGraph, interrupt, MemorySaver } from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState, type GraphStateType } from "./state";
import { makeParseResumeNode } from "./nodes/parse-resume";
import { makeParseJobNode } from "./nodes/parse-job";
import { makeScoreMatchNode } from "./nodes/score-match";
import { makeGapAnalysisNode } from "./nodes/gap-analysis";

const NODES = {
  PARSE_RESUME: "parseResume",
  PARSE_JOB: "parseJob",
  SCORE_MATCH: "scoreMatch",
  AWAIT_HUMAN: "awaitHuman",
  RESCORE: "rescore",
  GAP_ANALYSIS: "gapAnalysis",
} as const;

type NodeName = typeof NODES[keyof typeof NODES];

export function buildScoringGraph(model: BaseChatModel) {
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

  function routeAfterHuman(state: GraphStateType): Extract<NodeName, "rescore" | "gapAnalysis"> {
    return state.humanContext && state.humanContext.trim().length > 0
      ? NODES.RESCORE
      : NODES.GAP_ANALYSIS;
  }

  function routeAfterScore(state: GraphStateType): Extract<NodeName, "gapAnalysis" | "awaitHuman"> {
    return (state.matchResult?.score ?? 0) >= 60 ? NODES.GAP_ANALYSIS : NODES.AWAIT_HUMAN;
  }

  const workflow = new StateGraph(GraphState)
    .addNode(NODES.PARSE_RESUME, parseResume)
    .addNode(NODES.PARSE_JOB, parseJob)
    .addNode(NODES.SCORE_MATCH, scoreMatch)
    .addNode(NODES.AWAIT_HUMAN, awaitHuman)
    .addNode(NODES.RESCORE, scoreMatch) // same logic, humanContext already in state
    .addNode(NODES.GAP_ANALYSIS, gapAnalysis)
    .addEdge("__start__", NODES.PARSE_RESUME)
    .addEdge("__start__", NODES.PARSE_JOB)
    .addEdge(NODES.PARSE_RESUME, NODES.SCORE_MATCH)
    .addEdge(NODES.PARSE_JOB, NODES.SCORE_MATCH)
    .addConditionalEdges(NODES.SCORE_MATCH, routeAfterScore, {
      [NODES.GAP_ANALYSIS]: NODES.GAP_ANALYSIS,
      [NODES.AWAIT_HUMAN]: NODES.AWAIT_HUMAN,
    })
    .addConditionalEdges(NODES.AWAIT_HUMAN, routeAfterHuman, {
      [NODES.RESCORE]: NODES.RESCORE,
      [NODES.GAP_ANALYSIS]: NODES.GAP_ANALYSIS,
    })
    .addEdge(NODES.RESCORE, NODES.GAP_ANALYSIS)
    .addEdge(NODES.GAP_ANALYSIS, "__end__");

  // TODO: Replace MemorySaver with a durable checkpointer (e.g., Redis/DB-backed)
  // to support HITL across server restarts, cold starts, and multi-instance deployments.
  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
