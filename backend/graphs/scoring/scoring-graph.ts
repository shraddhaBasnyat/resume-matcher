import { Pool } from "pg";
import { StateGraph, MemorySaver, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState } from "./scoring-graph-state.js";
import { makeAnalyzeJDNode } from "./nodes/analyze-jd.js";
import { makeAnalyzeResumeNode } from "./nodes/analyze-resume.js";
import { atsGapAnalysis } from "./nodes/ats-gap-analysis.js";
import { makeAnalyzeFitNode } from "./nodes/analyze-fit.js";
import { makeAnalyzeStrongMatchNode } from "./nodes/analyze-strong-match.js";
import { makeAnalyzeNarrativeGapNode } from "./nodes/analyze-narrative-gap.js";
import { makeAnalyzeSkepticalReconciliationNode } from "./nodes/analyze-skeptical-reconciliation.js";
import { routeVerdicts, selectVerdictNode } from "./edges.js";

const NODES = {
  ANALYZE_JD: "analyzeJD",
  ANALYZE_RESUME: "analyzeResume",
  ATS_GAP_ANALYSIS: "atsGapAnalysis",
  ANALYZE_FIT: "analyzeFit",
  ROUTE_VERDICTS: "routeVerdicts",
  ANALYZE_STRONG_MATCH: "analyzeStrongMatch",
  ANALYZE_NARRATIVE_GAP: "analyzeNarrativeGap",
  ANALYZE_SKEPTICAL_RECONCILIATION: "analyzeSkepticalReconciliation",
  HITL_GATE: "hitlGate",
} as const;

function makePgPool(): Pool {
  return new Pool({ connectionString: process.env.SUPABASE_DB_URL });
}

let sharedCheckpointer: PostgresSaver | MemorySaver | null = null;

export async function setupCheckpointer(): Promise<void> {
  if (!process.env.SUPABASE_DB_URL) {
    sharedCheckpointer = new MemorySaver();
    return;
  }
  if (sharedCheckpointer instanceof PostgresSaver) {
    return;
  }
  const checkpointer = new PostgresSaver(makePgPool());
  await checkpointer.setup();
  sharedCheckpointer = checkpointer;
}

function makeCheckpointer() {
  if (sharedCheckpointer) {
    return sharedCheckpointer;
  }

  if (process.env.SUPABASE_DB_URL) {
    sharedCheckpointer = new PostgresSaver(makePgPool());
    return sharedCheckpointer;
  }

  sharedCheckpointer = new MemorySaver();
  return sharedCheckpointer;
}

export function getCheckpointer(): PostgresSaver | MemorySaver {
  return sharedCheckpointer ?? makeCheckpointer();
}

export function buildScoringGraph(model: BaseChatModel) {
  const analyzeJD = makeAnalyzeJDNode(model);
  const analyzeResume = makeAnalyzeResumeNode(model);
  const analyzeFit = makeAnalyzeFitNode(model);
  const analyzeStrongMatch = makeAnalyzeStrongMatchNode(model);
  const analyzeNarrativeGap = makeAnalyzeNarrativeGapNode(model);
  const analyzeSkepticalReconciliation = makeAnalyzeSkepticalReconciliationNode(model);

  async function hitlGate(state: typeof GraphState.State) {
    const humanContext = interrupt(state.contextPrompt);
    return { humanContext: humanContext as string, hitlFired: true };
  }

  const workflow = new StateGraph(GraphState)
    .addNode(NODES.ANALYZE_JD, analyzeJD)
    .addNode(NODES.ANALYZE_RESUME, analyzeResume)
    .addNode(NODES.ATS_GAP_ANALYSIS, atsGapAnalysis)
    .addNode(NODES.ANALYZE_FIT, analyzeFit)
    .addNode(NODES.ROUTE_VERDICTS, routeVerdicts)
    .addNode(NODES.ANALYZE_STRONG_MATCH, analyzeStrongMatch)
    .addNode(NODES.ANALYZE_NARRATIVE_GAP, analyzeNarrativeGap)
    .addNode(NODES.ANALYZE_SKEPTICAL_RECONCILIATION, analyzeSkepticalReconciliation)
    .addNode(NODES.HITL_GATE, hitlGate)
    // Fan-out from START to both analyze nodes (run in parallel)
    .addEdge("__start__", NODES.ANALYZE_JD)
    .addEdge("__start__", NODES.ANALYZE_RESUME)
    // Both analyze nodes must complete before downstream nodes fire (LangGraph fan-in)
    .addEdge(NODES.ANALYZE_JD, NODES.ATS_GAP_ANALYSIS)
    .addEdge(NODES.ANALYZE_RESUME, NODES.ATS_GAP_ANALYSIS)
    .addEdge(NODES.ANALYZE_JD, NODES.ANALYZE_FIT)
    .addEdge(NODES.ANALYZE_RESUME, NODES.ANALYZE_FIT)
    // Fan-in to routeVerdicts: both atsGapAnalysis + analyzeFit must complete
    .addEdge(NODES.ATS_GAP_ANALYSIS, NODES.ROUTE_VERDICTS)
    .addEdge(NODES.ANALYZE_FIT, NODES.ROUTE_VERDICTS)
    .addConditionalEdges(NODES.ROUTE_VERDICTS, selectVerdictNode, {
      [NODES.ANALYZE_STRONG_MATCH]: NODES.ANALYZE_STRONG_MATCH,
      [NODES.ANALYZE_NARRATIVE_GAP]: NODES.ANALYZE_NARRATIVE_GAP,
      [NODES.ANALYZE_SKEPTICAL_RECONCILIATION]: NODES.ANALYZE_SKEPTICAL_RECONCILIATION,
    })
    // Verdict nodes terminate at END independently
    .addEdge(NODES.ANALYZE_STRONG_MATCH, "__end__")
    .addEdge(NODES.ANALYZE_NARRATIVE_GAP, "__end__")
    // honest_verdict: route to hitlGate if contextPrompt is set (first pass only); else END
    .addConditionalEdges(
      NODES.ANALYZE_SKEPTICAL_RECONCILIATION,
      (state) => state.contextPrompt != null && !state.hitlFired ? NODES.HITL_GATE : "__end__",
      { [NODES.HITL_GATE]: NODES.HITL_GATE, __end__: "__end__" },
    )
    // hitlGate interrupts; on resume it routes back to the verdict node for a second LLM call
    .addEdge(NODES.HITL_GATE, NODES.ANALYZE_SKEPTICAL_RECONCILIATION);

  const checkpointer = makeCheckpointer();
  return workflow.compile({ checkpointer });
}
