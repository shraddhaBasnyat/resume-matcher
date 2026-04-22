import { Annotation } from "@langchain/langgraph";
import type { ConfidentMatchContext, ExploringGapContext } from "../../types/api.js";
import type { ScenarioId } from "./scenario/derive-scenario.js";

type FitAnalysis = {
  careerTrajectory: string;
  keyStrengths: string[];
  experienceGaps: string[];
};

export const GraphState = Annotation.Root({
  // Raw text inputs — transient for the life of the graph run only.
  // Never included in API responses.
  resumeText: Annotation<string>(),
  jobText: Annotation<string>(),
  humanContext: Annotation<string>({
    default: () => "",
    reducer: (prev, next) => prev ? `${prev}\n${next}` : next,
  }),
  // Fit analysis outputs — written by analyzeFit node
  fitScore: Annotation<number | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  headline: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  battleCardBullets: Annotation<string[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  scenarioSummary: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  sourceRole: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  targetRole: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  fitAnalysis: Annotation<FitAnalysis | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  weakMatch: Annotation<boolean | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  weakMatchReason: Annotation<string | null | undefined>({
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
  // HITL loop guard — set to true before interrupting.
  // Prevents a second interrupt on the resume pass.
  hitlFired: Annotation<boolean>({
    default: () => false,
    reducer: (_prev, next) => next,
  }),
  // User tier — hardcoded to "base" until auth middleware is wired.
  userTier: Annotation<"base" | "paid">({
    default: () => "base",
    reducer: (_prev, next) => next,
  }),
  // ATS analysis output — written by atsAnalysis node (runs in parallel with analyzeFit).
  atsProfile: Annotation<{
    atsScore: number;
    machineParsing: string[];
    machineRanking: string[];
  } | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  // Scenario routing outputs — written by routeVerdicts and verdict nodes.
  scenarioId: Annotation<ScenarioId | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  fitAdvice: Annotation<Record<string, unknown> | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
});

export type GraphStateType = typeof GraphState.State;
