import { StateGraph, interrupt, MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState, type GraphStateType } from "./scoring-graph-state.js";
import { makeParseResumeNode } from "./nodes/parse-resume.js";
import { makeParseJobNode } from "./nodes/parse-job.js";
import { makeScoreMatchNode } from "./nodes/score-match.js";
import { makeGapAnalysisNode } from "./nodes/gap-analysis.js";

const NODES = {
  PARSE_RESUME: "parseResume",
  PARSE_JOB: "parseJob",
  SCORE_MATCH: "scoreMatch",
  AWAIT_HUMAN: "awaitHuman",
  RESCORE: "rescore",
  GAP_ANALYSIS: "gapAnalysis",
} as const;

type NodeName = typeof NODES[keyof typeof NODES];

let sharedCheckpointer: PostgresSaver | MemorySaver | null = null;

export async function setupCheckpointer(): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) {
    sharedCheckpointer = new MemorySaver();
    return;
  }
  if (sharedCheckpointer instanceof PostgresSaver) {
    return;
  }
  const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_DB_URL);
  await checkpointer.setup();
  sharedCheckpointer = checkpointer;
}

function makeCheckpointer() {
  if (sharedCheckpointer) {
    return sharedCheckpointer;
  }

  if (process.env.SUPABASE_DB_URL) {
    sharedCheckpointer = PostgresSaver.fromConnString(process.env.SUPABASE_DB_URL);
    return sharedCheckpointer;
  }

  sharedCheckpointer = new MemorySaver();
  return sharedCheckpointer;
}

export function getCheckpointer(): PostgresSaver | MemorySaver {
  return sharedCheckpointer ?? makeCheckpointer();
}

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
    return (state.matchResult?.fitScore ?? 0) >= 60 ? NODES.GAP_ANALYSIS : NODES.AWAIT_HUMAN;
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

  const checkpointer = makeCheckpointer();
  return workflow.compile({ checkpointer });
}
