import { StateGraph, MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState } from "./scoring-graph-state.js";
import { makeAnalyzeFitNode } from "./nodes/analyze-fit.js";
import { makeAtsAnalysisNode } from "./nodes/ats-analysis.js";
import { makeAnalyzeStrongMatchNode } from "./nodes/analyze-strong-match.js";
import { makeAnalyzeNarrativeGapNode } from "./nodes/analyze-narrative-gap.js";
import { makeAnalyzeSkepticalReconciliationNode } from "./nodes/analyze-skeptical-reconciliation.js";
import { routeVerdicts } from "./edges.js";

const NODES = {
  ATS_ANALYSIS: "atsAnalysis",
  ANALYZE_FIT: "analyzeFit",
  ROUTE_VERDICTS: "routeVerdicts",
  ANALYZE_STRONG_MATCH: "analyzeStrongMatch",
  ANALYZE_NARRATIVE_GAP: "analyzeNarrativeGap",
  ANALYZE_SKEPTICAL_RECONCILIATION: "analyzeSkepticalReconciliation",
} as const;

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
  const analyzeFit = makeAnalyzeFitNode(model);
  const atsAnalysis = makeAtsAnalysisNode(model);
  const analyzeStrongMatch = makeAnalyzeStrongMatchNode(model);
  const analyzeNarrativeGap = makeAnalyzeNarrativeGapNode(model);
  const analyzeSkepticalReconciliation = makeAnalyzeSkepticalReconciliationNode(model);

  const workflow = new StateGraph(GraphState)
    .addNode(NODES.ATS_ANALYSIS, atsAnalysis)
    .addNode(NODES.ANALYZE_FIT, analyzeFit)
    .addNode(NODES.ROUTE_VERDICTS, routeVerdicts, {
      ends: [
        NODES.ANALYZE_STRONG_MATCH,
        NODES.ANALYZE_NARRATIVE_GAP,
        NODES.ANALYZE_SKEPTICAL_RECONCILIATION,
        "__end__",
      ],
    })
    .addNode(NODES.ANALYZE_STRONG_MATCH, analyzeStrongMatch)
    .addNode(NODES.ANALYZE_NARRATIVE_GAP, analyzeNarrativeGap)
    .addNode(NODES.ANALYZE_SKEPTICAL_RECONCILIATION, analyzeSkepticalReconciliation, {
      ends: [NODES.ANALYZE_SKEPTICAL_RECONCILIATION, "__end__"],
    })
    // Two-way fan-in: atsAnalysis + analyzeFit both must complete before routeVerdicts fires
    .addEdge("__start__", NODES.ATS_ANALYSIS)
    .addEdge("__start__", NODES.ANALYZE_FIT)
    .addEdge(NODES.ATS_ANALYSIS, NODES.ROUTE_VERDICTS)
    .addEdge(NODES.ANALYZE_FIT, NODES.ROUTE_VERDICTS)
    // Verdict nodes terminate at END independently
    .addEdge(NODES.ANALYZE_STRONG_MATCH, "__end__")
    .addEdge(NODES.ANALYZE_NARRATIVE_GAP, "__end__")
    .addEdge(NODES.ANALYZE_SKEPTICAL_RECONCILIATION, "__end__");

  const checkpointer = makeCheckpointer();
  return workflow.compile({ checkpointer });
}
