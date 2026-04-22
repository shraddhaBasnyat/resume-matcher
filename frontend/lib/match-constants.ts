import type { MatchResponse } from "./types/api";

export type AppState = "idle" | "running" | "interrupted" | "completed";
export type StepStatus = "waiting" | "running" | "done";

const VERDICT_NODES = new Set([
  "analyzeStrongMatch",
  "analyzeNarrativeGap",
  "analyzeSkepticalReconciliation",
]);

export const normalizeNodeName = (node: string): string =>
  VERDICT_NODES.has(node) ? "analyzeMatch" : node;

export interface NodeProgress {
  status: StepStatus;
  durationMs?: number;
}

export type { MatchResponse };

export const STEPS: { key: string; label: string }[] = [
  { key: "atsAnalysis",  label: "ATS check" },
  { key: "analyzeFit",   label: "Analysing fit" },
  { key: "analyzeMatch", label: "Building your report" },
];

export const INITIAL_PROGRESS: Record<string, NodeProgress> = {
  atsAnalysis:  { status: "waiting" },
  analyzeFit:   { status: "waiting" },
  analyzeMatch: { status: "waiting" },
};
