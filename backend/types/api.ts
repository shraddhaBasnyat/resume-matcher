import type { ScenarioId } from "../graphs/scoring/scenario/derive-scenario.js";

// ---------------------------------------------------------------------------
// Career transition intent — structured context collected before first run
// ---------------------------------------------------------------------------

export interface ConfidentMatchContext {
  basis: Array<
    | "direct_experience"
    | "adjacent_role"
    | "side_projects"
    | "self_taught"
    | "career_pivot"
  >;
}

export interface ExploringGapContext {
  timeline: "applying_now" | "three_to_six_months" | "one_year_plus";
  currentStatus: Array<
    | "side_projects"
    | "self_taught"
    | "transferable_skills"
    | "starting_from_scratch"
    | "already_retraining"
  >;
}

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export interface MatchResult {
  fitScore: number;
  atsScore?: number;
  matchedSkills: string[];
  missingSkills: string[];
  narrativeAlignment: string;
  gaps: string[];
  resumeAdvice: string[];
  contextPrompt: string | null;
  weakMatch: boolean;
  weakMatchReason?: string;
}

export interface CareerNarrative {
  trajectory: string;
  dominantTheme: string;
  inferredStrengths: string[];
  careerMotivation: string;
  resumeStoryGaps: string[];
}

export interface Resume {
  name: string;
  email: string;
  phone: string;
  summary?: string;
  location?: string;
  skills: string[];
  experience: { company: string; role: string; years: number }[];
  education: { degree: string; institution: string }[];
  totalYearsExperience?: number;
  keywords?: string[];
  careerNarrative: CareerNarrative;
  sourceRole: string;
}

export interface Job {
  title: string;
  company?: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  keywords: string[];
  experienceYears?: number;
  seniorityLevel?: "junior" | "mid" | "senior" | "lead" | "manager";
  targetRole: string;
}

// ---------------------------------------------------------------------------
// API request / response types
// ---------------------------------------------------------------------------

export interface RunMatchRequest {
  resumeText: string;
  jobText: string;
  intent: "confident_match" | "exploring_gap";
  intentContext: ConfidentMatchContext | ExploringGapContext;
  humanContext?: string; // HITL only — absent on first run
}

export interface ResumeMatchRequest {
  threadId: string;
  humanContext: string;
}

export interface CancelMatchRequest {
  threadId: string;
  rootRunId?: string;
  runStartTime?: number;
}

export interface MatchResponse {
  fitScore: number;
  atsScore?: number;
  matchedSkills: string[];
  missingSkills: string[];
  narrativeAlignment: string;
  gaps: string[];
  resumeAdvice: string[];
  contextPrompt: string | null;
  weakMatch: boolean;
  weakMatchReason?: string;
  fitAdvice: Record<string, unknown> | null;
  atsAdvice: Record<string, unknown> | null;
  roadmapAdvice: Record<string, unknown> | null;
  scenarioId: ScenarioId | null;
  interrupted: boolean;
  threadId: string;
  _meta: { traceUrl: string | null; durationMs: number };
}
