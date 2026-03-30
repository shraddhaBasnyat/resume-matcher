import type { Resume } from "./schemas/resume-schema";
import type { JobDescription } from "./schemas/job-schema";

export type AppState = "idle" | "running" | "interrupted" | "completed" | "cancelled";
export type StepStatus = "waiting" | "running" | "done";

export interface NodeProgress {
  status: StepStatus;
  durationMs?: number;
}

export interface MatchResponse {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  narrativeAlignment: string;
  gaps: string[];
  resumeAdvice: string[];
  weakMatch: boolean;
  weakMatchReason?: string;
  resumeData: Resume;
  jobData: JobDescription;
  interrupted: boolean;
  threadId: string;
  _meta: { traceUrl: string | null; durationMs: number };
}

export const STEPS: { key: string; label: string }[] = [
  { key: "parseResume", label: "Parsing resume" },
  { key: "parseJob", label: "Parsing job" },
  { key: "scoreMatch", label: "Scoring match" },
  { key: "gapAnalysis", label: "Gap analysis" },
];

export const INITIAL_PROGRESS: Record<string, NodeProgress> = {
  parseResume: { status: "waiting" },
  parseJob: { status: "waiting" },
  scoreMatch: { status: "waiting" },
  gapAnalysis: { status: "waiting" },
};
