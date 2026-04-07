import { StateGraph, Command, MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState, type GraphStateType } from "./scoring-graph-state.js";
import { makeParseResumeNode } from "./nodes/parse-resume.js";
import { makeParseJobNode } from "./nodes/parse-job.js";
import { makeScoreMatchNode } from "./nodes/score-match.js";
import { makeAtsAnalysisNode } from "./nodes/ats-analysis.js";
import { makeAnalyzeStrongMatchNode } from "./nodes/analyze-strong-match.js";
import { makeAnalyzeNarrativeGapNode } from "./nodes/analyze-narrative-gap.js";
import { makeAnalyzeSkepticalReconciliationNode } from "./nodes/analyze-skeptical-reconciliation.js";
import { deriveScenario } from "./scenario/derive-scenario.js";

const NODES = {
  PARSE_RESUME: "parseResume",
  PARSE_JOB: "parseJob",
  ATS_ANALYSIS: "atsAnalysis",
  SCORE_MATCH: "scoreMatch",
  DETECT_ARCHETYPE: "detectArchetype",
  ROUTE_VERDICTS: "routeVerdicts",
  ANALYZE_STRONG_MATCH: "analyzeStrongMatch",
  ANALYZE_NARRATIVE_GAP: "analyzeNarrativeGap",
  ANALYZE_SKEPTICAL_RECONCILIATION: "analyzeSkepticalReconciliation",
} as const;

// Scenario → verdict node mapping. Both confirmed_fit and invisible_expert
// route to analyzeStrongMatch — the node reads atsProfile from state to
// calibrate its output for the invisible_expert case.
const SCENARIO_NODE_MAP = {
  confirmed_fit: NODES.ANALYZE_STRONG_MATCH,
  invisible_expert: NODES.ANALYZE_STRONG_MATCH,
  narrative_gap: NODES.ANALYZE_NARRATIVE_GAP,
  honest_verdict: NODES.ANALYZE_SKEPTICAL_RECONCILIATION,
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
  const parseResume = makeParseResumeNode(model);
  const parseJob = makeParseJobNode(model);
  const atsAnalysis = makeAtsAnalysisNode();
  const scoreMatch = makeScoreMatchNode(model);
  const analyzeStrongMatch = makeAnalyzeStrongMatchNode(model);
  const analyzeNarrativeGap = makeAnalyzeNarrativeGapNode(model);
  const analyzeSkepticalReconciliation = makeAnalyzeSkepticalReconciliationNode(model);

  // Stub: sets archetypeContext = null until Pass 2 archetype detection is implemented.
  async function detectArchetype(_state: GraphStateType) {
    return { archetypeContext: null };
  }

  // Command-based routing node: calls deriveScenario (fitScore + atsScore only),
  // writes scenarioId to state, and dispatches to the single verdict node.
  function routeVerdicts(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("routeVerdicts: matchResult is missing — scoreMatch node did not complete successfully");
    }

    const atsScore = state.atsProfile?.atsScore ?? undefined;
    const { scenarioId, verdictNode } = deriveScenario(
      state.matchResult.fitScore,
      atsScore,
    );

    return new Command({
      update: { scenarioId },
      goto: [verdictNode],
    });
  }

  const workflow = new StateGraph(GraphState)
    .addNode(NODES.PARSE_RESUME, parseResume)
    .addNode(NODES.PARSE_JOB, parseJob)
    .addNode(NODES.ATS_ANALYSIS, atsAnalysis)
    .addNode(NODES.SCORE_MATCH, scoreMatch)
    .addNode(NODES.DETECT_ARCHETYPE, detectArchetype)
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
      ends: [NODES.SCORE_MATCH, "__end__"],
    })
    // Three-way fan-in to scoreMatch — all three must complete before scoreMatch fires
    .addEdge("__start__", NODES.PARSE_RESUME)
    .addEdge("__start__", NODES.PARSE_JOB)
    .addEdge("__start__", NODES.ATS_ANALYSIS)
    .addEdge(NODES.PARSE_RESUME, NODES.SCORE_MATCH)
    .addEdge(NODES.PARSE_JOB, NODES.SCORE_MATCH)
    .addEdge(NODES.ATS_ANALYSIS, NODES.SCORE_MATCH)
    // Linear spine
    .addEdge(NODES.SCORE_MATCH, NODES.DETECT_ARCHETYPE)
    .addEdge(NODES.DETECT_ARCHETYPE, NODES.ROUTE_VERDICTS)
    // Verdict nodes terminate at END independently
    .addEdge(NODES.ANALYZE_STRONG_MATCH, "__end__")
    .addEdge(NODES.ANALYZE_NARRATIVE_GAP, "__end__")
    .addEdge(NODES.ANALYZE_SKEPTICAL_RECONCILIATION, "__end__");

  const checkpointer = makeCheckpointer();
  return workflow.compile({ checkpointer });
}
