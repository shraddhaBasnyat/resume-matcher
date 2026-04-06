import { StateGraph, Command, MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState, type GraphStateType } from "./scoring-graph-state.js";
import { makeParseResumeNode } from "./nodes/parse-resume.js";
import { makeParseJobNode } from "./nodes/parse-job.js";
import { makeScoreMatchNode } from "./nodes/score-match.js";
import { makeAnalyzeStrongMatchNode } from "./nodes/make-analyze-strong-match-node.js";
import { makeAnalyzeNarrativeGapNode } from "./nodes/make-analyze-narrative-gap-node.js";
import { makeAnalyzeArchetypeGapNode } from "./nodes/make-analyze-archetype-gap-node.js";
import { makeAnalyzeSkepticalReconciliationNode } from "./nodes/make-analyze-skeptical-reconciliation-node.js";
import { makeAnalyzeAtsGapNode } from "./nodes/make-analyze-ats-gap-node.js";
import { makeAnalyzeRoadmapNode } from "./nodes/make-analyze-roadmap-node.js";
import { deriveScenario } from "./scenario/derive-scenario.js";

const NODES = {
  PARSE_RESUME: "parseResume",
  PARSE_JOB: "parseJob",
  SCORE_MATCH: "scoreMatch",
  DETECT_ARCHETYPE: "detectArchetype",
  ROUTE_VERDICTS: "routeVerdicts",
  ANALYZE_STRONG_MATCH: "analyzeStrongMatch",
  ANALYZE_NARRATIVE_GAP: "analyzeNarrativeGap",
  ANALYZE_ARCHETYPE_GAP: "analyzeArchetypeGap",
  ANALYZE_SKEPTICAL_RECONCILIATION: "analyzeSkepticalReconciliation",
  ANALYZE_ATS_GAP: "analyzeATSGap",
  ANALYZE_ROADMAP: "analyzeRoadmap",
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
  const scoreMatch = makeScoreMatchNode(model);
  const analyzeStrongMatch = makeAnalyzeStrongMatchNode(model);
  const analyzeNarrativeGap = makeAnalyzeNarrativeGapNode(model);
  const analyzeArchetypeGap = makeAnalyzeArchetypeGapNode(model);
  const analyzeSkepticalReconciliation = makeAnalyzeSkepticalReconciliationNode(model);
  const analyzeAtsGap = makeAnalyzeAtsGapNode(model);
  const analyzeRoadmap = makeAnalyzeRoadmapNode(model);

  // Stub: sets archetypeContext = null until Pass 2 archetype detection is implemented.
  async function detectArchetype(_state: GraphStateType) {
    return { archetypeContext: null };
  }

  // Command-based routing node: calls deriveScenario, writes scenarioId to state,
  // and dispatches the verdict branch + any independent ATS/roadmap branches.
  //
  // Note: when analyzeSkepticalReconciliation interrupts (scenario 4a), the
  // interrupt suspends the entire super-step. Any co-dispatched ATS branch will
  // not run until after the human provides context and the second pass (4b)
  // completes. This is intentional — full analysis should happen with human context.
  function routeVerdicts(state: GraphStateType) {
    const result = deriveScenario(
      state.matchResult!.fitScore,
      state.matchResult!.atsScore,
      state.intent!,
      state.archetypeContext,
      state.userTier,
      state.hitlFired,
    );

    const targets: string[] = [];
    if (result.verdictNode !== null) targets.push(result.verdictNode);
    if (result.runATS) targets.push(NODES.ANALYZE_ATS_GAP);
    if (result.runRoadmap) targets.push(NODES.ANALYZE_ROADMAP);
    // Scenario 6 has verdictNode=null but always sets runRoadmap=true.
    // Guard against the theoretical all-false case.
    if (targets.length === 0) targets.push("__end__");

    return new Command({
      update: { scenarioId: result.scenarioId },
      goto: targets,
    });
  }

  const workflow = new StateGraph(GraphState)
    .addNode(NODES.PARSE_RESUME, parseResume)
    .addNode(NODES.PARSE_JOB, parseJob)
    .addNode(NODES.SCORE_MATCH, scoreMatch)
    .addNode(NODES.DETECT_ARCHETYPE, detectArchetype)
    .addNode(NODES.ROUTE_VERDICTS, routeVerdicts, {
      ends: [
        NODES.ANALYZE_STRONG_MATCH,
        NODES.ANALYZE_NARRATIVE_GAP,
        NODES.ANALYZE_ARCHETYPE_GAP,
        NODES.ANALYZE_SKEPTICAL_RECONCILIATION,
        NODES.ANALYZE_ATS_GAP,
        NODES.ANALYZE_ROADMAP,
        "__end__",
      ],
    })
    .addNode(NODES.ANALYZE_STRONG_MATCH, analyzeStrongMatch)
    .addNode(NODES.ANALYZE_NARRATIVE_GAP, analyzeNarrativeGap)
    .addNode(NODES.ANALYZE_ARCHETYPE_GAP, analyzeArchetypeGap)
    .addNode(NODES.ANALYZE_SKEPTICAL_RECONCILIATION, analyzeSkepticalReconciliation, {
      ends: [NODES.SCORE_MATCH, "__end__"],
    })
    .addNode(NODES.ANALYZE_ATS_GAP, analyzeAtsGap)
    .addNode(NODES.ANALYZE_ROADMAP, analyzeRoadmap)
    // Parse fan-in to scoreMatch
    .addEdge("__start__", NODES.PARSE_RESUME)
    .addEdge("__start__", NODES.PARSE_JOB)
    .addEdge(NODES.PARSE_RESUME, NODES.SCORE_MATCH)
    .addEdge(NODES.PARSE_JOB, NODES.SCORE_MATCH)
    // Linear spine
    .addEdge(NODES.SCORE_MATCH, NODES.DETECT_ARCHETYPE)
    .addEdge(NODES.DETECT_ARCHETYPE, NODES.ROUTE_VERDICTS)
    // Each branch terminates at END independently; LangGraph waits for all
    // active branches in the super-step before advancing.
    .addEdge(NODES.ANALYZE_STRONG_MATCH, "__end__")
    .addEdge(NODES.ANALYZE_NARRATIVE_GAP, "__end__")
    .addEdge(NODES.ANALYZE_ARCHETYPE_GAP, "__end__")
    .addEdge(NODES.ANALYZE_SKEPTICAL_RECONCILIATION, "__end__")
    .addEdge(NODES.ANALYZE_ATS_GAP, "__end__")
    .addEdge(NODES.ANALYZE_ROADMAP, "__end__");

  const checkpointer = makeCheckpointer();
  return workflow.compile({ checkpointer });
}
