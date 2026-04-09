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
  { key: "parseResume", label: "Parsing resume" },
  { key: "parseJob", label: "Parsing job" },
  { key: "scoreMatch", label: "Scoring match" },
  { key: "analyzeMatch", label: "Analysing your fit" },
];

export const INITIAL_PROGRESS: Record<string, NodeProgress> = {
  parseResume: { status: "waiting" },
  parseJob: { status: "waiting" },
  scoreMatch: { status: "waiting" },
  analyzeMatch: { status: "waiting" },
};

