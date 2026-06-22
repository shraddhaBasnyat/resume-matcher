import { Annotation } from "@langchain/langgraph";
import type { ConfidentMatchContext, ExploringGapContext } from "../../types/api.js";
import type { ScenarioId } from "./scenario/derive-scenario.js";
import type { BattleCardBullet } from "../../llm-wrappers/analyze-fit.wrapper.js";
import type { AnalyzeJDLLMOutput } from "../../llm-wrappers/analyze-jd.wrapper.js";
import type { AnalyzeResumeLLMOutput } from "../../llm-wrappers/analyze-resume.wrapper.js";

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

  // analyzeJD outputs
  jdArchetype: Annotation<AnalyzeJDLLMOutput["jdArchetype"] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  realAsk: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  recruiterFilter: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),

  // analyzeResume outputs
  candidateArchetype: Annotation<AnalyzeResumeLLMOutput["candidateArchetype"] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  demonstratedVsClaimed: Annotation<AnalyzeResumeLLMOutput["demonstratedVsClaimed"] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  careerArcNote: Annotation<AnalyzeResumeLLMOutput["careerArcNote"] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  resumeAha: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),

  // atsGapAnalysis outputs (deterministic)
  atsScore: Annotation<number | null | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  termGaps: Annotation<{ term: string; status: "missing" | "present_no_context" | "present_demonstrated" }[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  terminologyMismatches: Annotation<{ resumeUses: string; jdExpects: string }[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  formattingFlags: Annotation<string[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),

  // analyzeFit outputs
  fitScore: Annotation<number | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  headline: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  battleCardBullets: Annotation<BattleCardBullet[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  fitAha: Annotation<string | undefined>({
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

  // Phase 1: atsScenarioSummary and atsAha are not written by any node in Phase 1
  // (atsGapAnalysis is deterministic — no LLM aha). Kept in state for Phase 2+ verdict node consumption.
  atsScenarioSummary: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  atsAha: Annotation<string | undefined>({
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
  hitlFired: Annotation<boolean>({
    default: () => false,
    reducer: (_prev, next) => next,
  }),
  // User tier — hardcoded to "base" until auth middleware is wired.
  userTier: Annotation<"base" | "paid">({
    default: () => "base",
    reducer: (_prev, next) => next,
  }),
  // Verdict node outputs
  terminologyDiffs: Annotation<{ location: string; swapLabel: string; before: string; after: string }[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  verdictAha: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  // Scenario routing outputs
  scenarioId: Annotation<ScenarioId | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  fitAdvice: Annotation<Record<string, unknown> | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  // contextPrompt produced by analyzeSkepticalReconciliation; read by hitlGate to call interrupt()
  contextPrompt: Annotation<string | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
});

export type GraphStateType = typeof GraphState.State;
