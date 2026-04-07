import { Annotation } from "@langchain/langgraph";
import type { Resume } from "../../chains/resume-chain.js";
import type { JobDescription } from "../../chains/job-chain.js";
import type { MatchResult } from "../../chains/scoring-chain.js";
import type { LayoutFlag } from "../../chains/ats-analysis-chain.js";
import type { ArchetypeContext } from "../../archetypes/types.js";
import type { ConfidentMatchContext, ExploringGapContext } from "../../types/api.js";
import type { ScenarioId } from "./scenario/derive-scenario.js";

/**
 * GRAPH STATE
 *
 * Single source of truth for the LangGraph pipeline.
 * All nodes read from and write to this state object.
 *
 * REDUCERS
 * Currently all keys use overwrite reducers (last write wins).
 * If nodes were broken into smaller units (e.g. extractSkills,
 * extractExperience as separate nodes), consider merge reducers:
 *   value: (old, next) => ({ ...old, ...next })
 * This would make partial failures more resilient — if one node
 * fails, previously written keys are preserved.
 *
 * KNOWN LIMITATIONS (as of LangGraph 0.x)
 * 1. No access control — any node can read/write any key.
 *    Convention: type each node with Pick<GraphState, "keyName">
 *    to let TypeScript enforce boundaries at dev time.
 *
 * 2. No visible subscriptions — unlike Redux selectors, there is
 *    no built-in way to see which nodes "own" which keys.
 *    See NODE DATA FLOW comment in lib/graph/scoring-graph.ts.
 *
 * 3. MemorySaver is ephemeral — paused graphs (HITL interrupt)
 *    are lost on server restart. For production, swap with
 *    a persistent checkpointer (PostgresSaver, RedisSaver).
 */
export const GraphState = Annotation.Root({
  // Raw text inputs — transient for the life of the graph run only.
  // Never included in API responses.
  resumeText: Annotation<string>(),
  jobText: Annotation<string>(),
  humanContext: Annotation<string>({
    default: () => "",
    reducer: (prev, next) => prev ? `${prev}\n${next}` : next,
  }),
  // Structured outputs written by each parse node
  resumeData: Annotation<Resume | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  jobData: Annotation<JobDescription | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  matchResult: Annotation<MatchResult | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  // LangGraph thread ID — for HITL resume
  threadId: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  // Structured user intent — set on first run, persisted through HITL
  intent: Annotation<"confident_match" | "exploring_gap" | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  intentContext: Annotation<ConfidentMatchContext | ExploringGapContext | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  // Archetype detection result — set by detectArchetype node (Pass 2)
  archetypeContext: Annotation<ArchetypeContext | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
  // HITL loop guard — set to true by awaitHuman node before interrupting.
  // Prevents a second interrupt on the rescore pass.
  hitlFired: Annotation<boolean>({
    default: () => false,
    reducer: (_prev, next) => next,
  }),
  // User tier — set from auth middleware (Pass 2). Hardcoded to "base" until then.
  userTier: Annotation<"base" | "paid">({
    default: () => "base",
    reducer: (_prev, next) => next,
  }),
  // ATS analysis output — written by atsAnalysis node (runs in parallel with parse nodes).
  atsProfile: Annotation<{
    atsScore: number;
    missingKeywords: string[];
    layoutFlags: LayoutFlag[];
    terminologyGaps: string[];
  } | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  // Scenario routing outputs — written by routeVerdicts and branch nodes.
  scenarioId: Annotation<ScenarioId | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  fitAdvice: Annotation<Record<string, unknown> | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  atsAdvice: Annotation<Record<string, unknown> | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  roadmapAdvice: Annotation<Record<string, unknown> | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
});

export type GraphStateType = typeof GraphState.State;
